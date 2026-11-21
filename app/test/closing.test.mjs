// Closing preparation on the device follows the actor's governor: the four hard
// rules hold a proposal and no approval passes them; a clean proposal still
// waits for a named person; nothing is ever committed automatically.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readDef } from "../scripts/edn.mjs";
import { createRecord, amendRecord } from "../src/records.js";
import { openCase, caseState, recordScreening, propose, approve, decline, markClosed, withdraw, violations, caseProblems, RULES } from "../src/closing.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = readDef(await readFile(resolve(root, "../src/realty/facts.cljk"), "utf8"), "catalog");
const at = (n) => `2026-11-21T0${n}:00:00.000Z`;
const base = { jurisdiction: "JPN", kind: "land", address: "東京都港区芝公園四丁目", rights: [{ type: "ownership", holder: "株式会社テスト" }] };
const parties = [{ role: "seller", name: "株式会社テスト" }, { role: "buyer", name: "買主の会社" }];
const record = (over = {}) => createRecord([], { ...base, ...over }, { catalog, now: at(0) }).record;
const complete = (r) => amendRecord(r, { docs: catalog[r.data.jurisdiction]["required-docs"] }, { catalog, now: at(1) }).record;
const open = (r, cases = []) => openCase(cases, r, { parties }, { now: at(1) }).case;
const screenAll = (c, verdict = "clear") => parties.reduce((acc, _, i) => recordScreening(acc, i, verdict, { now: at(2) }).case, c);

test("intake needs named parties and allows one open case per record", () => {
  const r = record();
  assert.deepEqual(openCase([], r, { parties: [] }).problems, ["parties"]);
  assert.deepEqual(openCase([], r, { parties: [{ role: "owner", name: "x" }] }).problems, ["parties"]);
  const c = open(r);
  assert.equal(c.id, "JPN-00000001/C-0001");
  assert.equal(c.official, false);
  assert.deepEqual(caseState(c).verdicts, ["not-screened", "not-screened"]);
  assert.deepEqual(openCase([c], r, { parties }).problems, ["case-open"]);
  assert.deepEqual(caseProblems(c), []);
});

test("a covered jurisdiction with every document and no hit waits for a person, never commits", () => {
  const r = complete(record());
  const { case: c } = propose(screenAll(open(r)), r, catalog, [], { now: at(3) });
  const s = caseState(c);
  assert.equal(s.status, "awaiting-human");
  assert.deepEqual(s.proposal.violations, []);
  assert.equal(s.proposal.basis.specBasis.provenance, catalog.JPN.provenance);
  assert.equal(s.approval, null, "a clean proposal is not an approval");
  assert.deepEqual(caseProblems(c), []);
});

test("negative control: missing documents hold the proposal and it cannot be approved", () => {
  const r = amendRecord(record(), { docs: catalog.JPN["required-docs"].slice(1) }, { catalog, now: at(1) }).record;
  const { case: c } = propose(screenAll(open(r)), r, catalog, [], { now: at(3) });
  assert.equal(caseState(c).status, "hold");
  assert.deepEqual(caseState(c).proposal.violations, ["incomplete-documents"]);
  assert.deepEqual(approve(c, r, catalog, [c], { by: "山田", role: "宅地建物取引士" }).problems, ["held"]);
  assert.deepEqual(markClosed(c, { by: "山田" }).problems, ["not-approved"]);
});

test("a jurisdiction without a spec-basis gets no procedure and is held", () => {
  const r = record({ jurisdiction: "FRA" });
  const c0 = screenAll(open(r));
  assert.deepEqual(violations(c0, r, catalog), ["no-spec-basis", "incomplete-documents"]);
  const { case: c } = propose(c0, r, catalog, [], { now: at(3) });
  assert.equal(caseState(c).proposal.basis.specBasis, null);
  assert.deepEqual(caseState(c).proposal.basis.docs, []);
  assert.deepEqual(approve(c, r, catalog, [c], { by: "x", role: "y" }).problems, ["held"]);
});

test("a sanctions or PEP hit on any party is a hold no person can approve past", () => {
  const r = complete(record());
  const hit = recordScreening(screenAll(open(r)), 1, "hit", { now: at(2) }).case;
  const { case: c } = propose(hit, r, catalog, [], { now: at(3) });
  assert.deepEqual(caseState(c).proposal.violations, ["sanctions-hit"]);
  assert.deepEqual(approve(c, r, catalog, [c], { by: "山田", role: "宅地建物取引士" }).problems, ["held"]);
});

test("approval needs a named person and the same facts the proposal was judged on", () => {
  const r = complete(record());
  const { case: c } = propose(screenAll(open(r)), r, catalog, [], { now: at(3) });
  assert.deepEqual(approve(c, r, catalog, [c], { by: "", role: "宅地建物取引士" }).problems, ["approver"]);
  assert.deepEqual(approve(c, r, catalog, [c], { by: "山田", role: " " }).problems, ["approver"]);
  const fewer = amendRecord(r, { docs: r.data.docs.slice(1) }, { catalog, now: at(4) }).record;
  assert.deepEqual(approve(c, fewer, catalog, [c], { by: "山田", role: "宅地建物取引士" }).problems, ["stale-proposal"]);
  const rescreened = recordScreening(c, 0, "hit", { now: at(4) }).case;
  assert.deepEqual(approve(rescreened, r, catalog, [rescreened], { by: "山田", role: "宅地建物取引士" }).problems, ["stale-proposal"]);
  assert.deepEqual(approve(open(r), r, catalog, [], { by: "山田", role: "宅地建物取引士" }).problems, ["no-proposal"]);
  const { case: ok } = approve(c, r, catalog, [c], { by: "山田", role: "宅地建物取引士" }, { now: at(5) });
  assert.equal(caseState(ok).status, "approved");
  assert.deepEqual(caseState(ok).approval, { at: at(5), kind: "approved", by: "山田", role: "宅地建物取引士" });
  assert.deepEqual(recordScreening(ok, 0, "hit").problems, ["case-settled"]);
  assert.deepEqual(propose(ok, r, catalog).problems, ["case-settled"]);
});

test("a person may decline; a declined case can be proposed again", () => {
  const r = complete(record());
  const { case: c } = propose(screenAll(open(r)), r, catalog, [], { now: at(3) });
  const { case: d } = decline(c, { by: "山田", reason: "書類の再確認" }, { now: at(4) });
  assert.equal(caseState(d).status, "declined");
  assert.deepEqual(approve(d, r, catalog, [d], { by: "山田", role: "宅地建物取引士" }).problems, ["no-proposal"]);
  assert.equal(caseState(propose(d, r, catalog, [], { now: at(5) }).case).status, "awaiting-human");
  assert.deepEqual(caseProblems(d), []);
});

test("a record already closed holds any further closing proposal", () => {
  const r = complete(record());
  let c = propose(screenAll(open(r)), r, catalog, [], { now: at(3) }).case;
  c = approve(c, r, catalog, [c], { by: "山田", role: "宅地建物取引士" }, { now: at(4) }).case;
  c = markClosed(c, { by: "山田", reference: "受付第123号" }, { now: at(5) }).case;
  assert.equal(caseState(c).status, "closed");
  assert.deepEqual(withdraw(c).problems, ["case-settled"]);
  assert.deepEqual(caseProblems(c), []);
  const second = screenAll(openCase([c], r, { parties }, { now: at(6) }).case);
  assert.equal(second.id, "JPN-00000001/C-0002");
  const again = propose(second, r, catalog, [c, second], { now: at(7) }).case;
  assert.deepEqual(caseState(again).proposal.violations, ["already-closed"]);
  assert.deepEqual(approve(again, r, catalog, [c, again], { by: "山田", role: "宅地建物取引士" }).problems, ["held"]);
});

test("a stored case that the functions could not have produced is refused on load", () => {
  const r = complete(record());
  const held = propose(recordScreening(screenAll(open(r)), 0, "hit", { now: at(2) }).case, r, catalog, [], { now: at(3) }).case;
  const forgedApproval = { ...held, events: [...held.events, { at: at(4), kind: "approved", by: "x", role: "y" }] };
  assert.deepEqual(caseProblems(forgedApproval), ["approval"]);
  const relabelled = { ...held, events: held.events.map((e) => (e.kind === "proposed" ? { ...e, disposition: "awaiting-human" } : e)) };
  assert.deepEqual(caseProblems(relabelled), ["proposal"]);
  const emptied = { ...held, events: held.events.map((e) => (e.kind === "proposed" ? { ...e, disposition: "awaiting-human", violations: [] } : e)) };
  assert.deepEqual(caseProblems(emptied), ["proposal"], "the basis itself still shows the hit");
  const clean = propose(screenAll(open(r)), r, catalog, [], { now: at(3) }).case;
  const hitAfter = { ...clean, events: [...clean.events, { at: at(4), kind: "screened", party: 0, verdict: "hit" }, { at: at(5), kind: "approved", by: "x", role: "y" }] };
  assert.deepEqual(caseProblems(hitAfter), ["approval"]);
  const closedEarly = { ...clean, events: [...clean.events, { at: at(4), kind: "closed", by: "x" }] };
  assert.deepEqual(caseProblems(closedEarly), ["approval"]);
  assert.deepEqual(caseProblems({ ...clean, official: true }), ["status"]);
  assert.deepEqual(caseProblems({ ...clean, id: "GBR-00000001/C-0001" }), ["id"]);
  assert.deepEqual(caseProblems({ ...clean, events: [...clean.events, { at: at(4), kind: "committed" }] }), ["events"]);
  assert.deepEqual(Object.keys(RULES), ["no-spec-basis", "sanctions-hit", "incomplete-documents", "already-closed"]);
});
