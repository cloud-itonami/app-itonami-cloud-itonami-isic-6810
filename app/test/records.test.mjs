// Records are drafts kept on the device: validated, numbered per jurisdiction
// the way realty.registry does, and amended only by appending history.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readAll, readDef } from "../scripts/edn.mjs";
import { createRecord, amendRecord, recordProblems, checklist, nextRecordId } from "../src/records.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = readDef(await readFile(resolve(root, "../src/realty/facts.cljk"), "utf8"), "catalog");
const t0 = "2026-11-18T00:00:00.000Z";
const t1 = "2026-11-18T01:00:00.000Z";
const base = { jurisdiction: "jpn", kind: "land", address: "東京都港区芝公園四丁目", parcel: "4-2", areaM2: "1200.5", lat: "35.6586", lon: "139.7454",
  rights: [{ type: "ownership", holder: "株式会社テスト", share: "1/1", since: "2020-04-01" }, { type: "ownership", holder: "" }] };

test("the EDN reader reads realty.facts as data and refuses what it cannot represent", () => {
  assert.deepEqual(Object.keys(catalog).sort(), ["AUS-NSW", "CAN-ON", "DEU", "GBR", "JPN", "NLD", "USA-CA"]);
  assert.equal(catalog.JPN["owner-authority"], "法務局 (Legal Affairs Bureau)");
  assert.equal(catalog.JPN["gates-status"], "provisional");
  assert.ok(catalog.JPN["human-gates"].includes("application-filed"));
  assert.deepEqual(readAll('{:a [1 2.5 "x\\n"] :b #{:z :y} :c nil} ; c\n#_ (ignored) true'), [{ a: [1, 2.5, "x\n"], b: ["y", "z"], c: null }, true]);
  assert.throws(() => readAll("#inst \"2020\""), /tagged/);
  assert.throws(() => readAll("{:a 1 :a 2}"), /duplicate/);
  assert.throws(() => readAll("[1 2"), /unterminated/);
});

test("a record is a jurisdiction-numbered, unsigned draft", () => {
  const { record } = createRecord([], base, { catalog, now: t0 });
  assert.equal(record.id, "JPN-00000001");
  assert.equal(record.status, "draft-unsigned");
  assert.equal(record.official, false);
  assert.equal(record.data.areaM2, 1200.5);
  assert.equal(record.data.rights.length, 1, "an empty right row is dropped");
  assert.deepEqual(recordProblems(record), []);
  assert.equal(nextRecordId([record, { id: "JPN-00000007" }, { id: "GBR-00000009" }], "JPN"), "JPN-00000008");
});

test("invalid input is refused with the fields named", () => {
  const { problems } = createRecord([], { ...base, jurisdiction: "japan", address: " ", lat: "95", rights: [{ type: "owner", holder: "x", since: "2020/1/1" }] }, { catalog });
  assert.deepEqual(problems.sort(), ["address", "jurisdiction", "location", "rights.since", "rights.type"]);
  assert.deepEqual(createRecord([], { ...base, lon: "" }, { catalog }).problems, ["location"]);
});

test("amending appends history and never rewrites it", () => {
  const { record } = createRecord([], base, { catalog, now: t0 });
  const docs = [catalog.JPN["required-docs"][0], "not a JPN document"];
  const { record: amended } = amendRecord(record, { docs, note: "購入予定" }, { catalog, now: t1 });
  assert.deepEqual(amended.data.docs, [catalog.JPN["required-docs"][0]], "only the jurisdiction's own documents are kept");
  assert.equal(amended.history.length, 2);
  assert.deepEqual(amended.history[0], record.history[0]);
  assert.deepEqual(Object.keys(amended.history[1].changed).sort(), ["docs", "note"]);
  assert.deepEqual(recordProblems(amended), []);
  assert.equal(record.history.length, 1, "the earlier record is unchanged");
  assert.ok(amendRecord(amended, {}, { catalog }).unchanged);
  assert.deepEqual(amendRecord(record, { jurisdiction: "GBR" }, { catalog }).problems, ["jurisdiction-fixed"]);
});

test("a record whose data does not follow from its history is refused", () => {
  const { record } = createRecord([], base, { catalog, now: t0 });
  assert.deepEqual(recordProblems({ ...record, data: { ...record.data, address: "書き換え" } }), ["history-replay"]);
  assert.deepEqual(recordProblems({ ...record, official: true }), ["status"]);
  assert.deepEqual(recordProblems({ ...record, history: [] }), ["history"]);
});

test("the checklist comes from realty.facts and is empty, not guessed, elsewhere", () => {
  const { record } = createRecord([], { ...base, docs: [catalog.JPN["required-docs"][1]] }, { catalog });
  const cl = checklist(record, catalog);
  assert.equal(cl.covered, true);
  assert.equal(cl.items.length, catalog.JPN["required-docs"].length);
  assert.deepEqual(cl.items.filter((i) => i.held).map((i) => i.doc), [catalog.JPN["required-docs"][1]]);
  const { record: other } = createRecord([], { ...base, jurisdiction: "FRA" }, { catalog });
  assert.deepEqual(checklist(other, catalog), { covered: false, items: [] });
});
