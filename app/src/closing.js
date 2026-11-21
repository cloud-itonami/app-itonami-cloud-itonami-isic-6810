// Closing preparation kept on this device. Pure functions, no I/O.
//
// The device-side form of the actor's governed flow (src/realty/governor.cljk,
// src/realty/phase.cljk): intake -> jurisdiction document checklist -> closing
// proposal -> a person's approval. The four HARD rules are the governor's own:
// no spec-basis, a sanctions/PEP hit, incomplete documents, already closed. A
// hard rule holds the proposal and no approval can pass it. A clean proposal is
// never automatic either: it waits for a named person, as `:closing/submit`
// does at every phase.
//
// What this never does: screen anyone, file a registration, release funds, or
// state a requirement that realty.facts does not carry. A screening verdict is
// what the operator typed after their own screening.

export const CASE_SCHEMA = "network.itonami.registry.closing.v1";

export const PARTY_ROLES = Object.freeze({ seller: "売主", buyer: "買主", lessor: "貸主", tenant: "借主" });
export const VERDICTS = Object.freeze({ "not-screened": "未照合", clear: "一致なし", hit: "一致あり" });

export const RULES = Object.freeze({
  "no-spec-basis": "この法域の公式な根拠が realty.facts にありません。要件を推測で補わないため、成約の提案は作れません。",
  "sanctions-hit": "制裁・PEP リストに一致した関係者がいます。この取引は進められません。",
  "incomplete-documents": "法域の必要書類がそろっていません。",
  "already-closed": "この記録は成約済みです。もう一度の成約提案は進められません。",
});

const text = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pad = (n, w) => String(n).padStart(w, "0");

function partyData(p) {
  const role = text(p?.role, 16);
  const name = text(p?.name);
  if (!Object.hasOwn(PARTY_ROLES, role) || !name) return null;
  return { role, name };
}

/** Intake: one case for one record, with the parties named. */
export function openCase(cases, record, input, { now = new Date().toISOString() } = {}) {
  const rows = (Array.isArray(input?.parties) ? input.parties : []).filter((p) => text(p?.name) || text(p?.role));
  const parties = rows.map(partyData);
  const problems = [];
  if (!parties.length || parties.includes(null)) problems.push("parties");
  if (cases.some((c) => c.recordId === record.id && caseState(c).status !== "closed" && caseState(c).status !== "withdrawn")) problems.push("case-open");
  if (problems.length) return { problems };
  const n = cases.filter((c) => c.recordId === record.id).length + 1;
  return {
    case: {
      schema: CASE_SCHEMA,
      id: `${record.id}/C-${pad(n, 4)}`,
      recordId: record.id,
      jurisdiction: record.data.jurisdiction,
      official: false,
      createdAt: now,
      events: [{ at: now, kind: "opened", parties }],
    },
  };
}

/** Replays the events. The state is only what the events say. */
export function caseState(c) {
  const state = { status: "open", parties: [], verdicts: [], proposal: null, approval: null, closed: null };
  for (const e of c.events) {
    if (e.kind === "opened") { state.parties = e.parties; state.verdicts = e.parties.map(() => "not-screened"); }
    else if (e.kind === "screened") { state.verdicts = state.verdicts.map((v, i) => (i === e.party ? e.verdict : v)); }
    else if (e.kind === "proposed") { state.proposal = e; state.approval = null; state.status = e.disposition === "hold" ? "hold" : "awaiting-human"; }
    else if (e.kind === "approved") { state.approval = e; state.status = "approved"; }
    else if (e.kind === "declined") { state.approval = null; state.status = "declined"; }
    else if (e.kind === "closed") { state.closed = e; state.status = "closed"; }
    else if (e.kind === "withdrawn") { state.status = "withdrawn"; }
  }
  return state;
}

const DONE = new Set(["closed", "withdrawn"]);

/** The operator records the result of their own screening of one party. */
export function recordScreening(c, party, verdict, { now = new Date().toISOString() } = {}) {
  const state = caseState(c);
  if (DONE.has(state.status) || state.status === "approved") return { problems: ["case-settled"] };
  if (!Number.isInteger(party) || party < 0 || party >= state.parties.length) return { problems: ["party"] };
  if (!Object.hasOwn(VERDICTS, verdict)) return { problems: ["verdict"] };
  if (state.verdicts[party] === verdict) return { case: c, unchanged: true };
  return { case: { ...c, events: [...c.events, { at: now, kind: "screened", party, verdict }] } };
}

/** What a proposal is judged on, taken from the record and the case as they are now. */
export function basisOf(c, record, catalog) {
  const spec = catalog[c.jurisdiction];
  const held = new Set(record.data.docs);
  return {
    jurisdiction: c.jurisdiction,
    specBasis: spec ? { provenance: spec.provenance, required: spec["required-docs"].length } : null,
    docs: spec ? spec["required-docs"].filter((d) => held.has(d)) : [],
    verdicts: caseState(c).verdicts,
  };
}

/** The governor's hard rules, in its order. An empty list means "ask a person", never "go". */
export function violations(c, record, catalog, cases = []) {
  const basis = basisOf(c, record, catalog);
  const out = [];
  if (!basis.specBasis) out.push("no-spec-basis");
  if (basis.verdicts.includes("hit")) out.push("sanctions-hit");
  if (!basis.specBasis || basis.docs.length !== basis.specBasis.required) out.push("incomplete-documents");
  if (cases.some((x) => x.recordId === c.recordId && x.id !== c.id && caseState(x).status === "closed")) out.push("already-closed");
  return out;
}

/** Draft a closing proposal. It is held, or it waits for a person; it is never committed here. */
export function propose(c, record, catalog, cases = [], { now = new Date().toISOString() } = {}) {
  const state = caseState(c);
  if (DONE.has(state.status) || state.status === "approved") return { problems: ["case-settled"] };
  const found = violations(c, record, catalog, cases);
  const event = {
    at: now, kind: "proposed", disposition: found.length ? "hold" : "awaiting-human", violations: found,
    unscreened: state.verdicts.filter((v) => v === "not-screened").length,
    basis: basisOf(c, record, catalog),
  };
  return { case: { ...c, events: [...c.events, event] } };
}

/** A named person approves the proposal on screen. Refused on a hold, and when anything changed since. */
export function approve(c, record, catalog, cases, input, { now = new Date().toISOString() } = {}) {
  const state = caseState(c);
  const by = text(input?.by), role = text(input?.role);
  if (state.status !== "awaiting-human") return { problems: [state.status === "hold" ? "held" : "no-proposal"] };
  if (!by || !role) return { problems: ["approver"] };
  if (!same(state.proposal.basis, basisOf(c, record, catalog))) return { problems: ["stale-proposal"] };
  if (violations(c, record, catalog, cases).length) return { problems: ["held"] };
  return { case: { ...c, events: [...c.events, { at: now, kind: "approved", by, role }] } };
}

export function decline(c, input, { now = new Date().toISOString() } = {}) {
  const state = caseState(c);
  const by = text(input?.by);
  if (state.status !== "awaiting-human") return { problems: ["no-proposal"] };
  if (!by) return { problems: ["approver"] };
  return { case: { ...c, events: [...c.events, { at: now, kind: "declined", by, reason: text(input?.reason, 500) }] } };
}

/** A person notes that the registration was completed elsewhere. The app files nothing. */
export function markClosed(c, input, { now = new Date().toISOString() } = {}) {
  const state = caseState(c);
  const by = text(input?.by);
  if (state.status !== "approved") return { problems: ["not-approved"] };
  if (!by) return { problems: ["approver"] };
  return { case: { ...c, events: [...c.events, { at: now, kind: "closed", by, reference: text(input?.reference, 100) }] } };
}

export function withdraw(c, { now = new Date().toISOString() } = {}) {
  if (DONE.has(caseState(c).status)) return { problems: ["case-settled"] };
  return { case: { ...c, events: [...c.events, { at: now, kind: "withdrawn" }] } };
}

/** A stored case is refused on load unless its events could have been produced by the functions above. */
export function caseProblems(c) {
  if (c?.schema !== CASE_SCHEMA) return ["schema"];
  const problems = [];
  if (c.official !== false) problems.push("status");
  if (typeof c.recordId !== "string" || !new RegExp(`^${c.recordId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}/C-\\d{4}$`).test(c.id ?? "")) problems.push("id");
  const ev = c.events;
  if (!Array.isArray(ev) || !ev.length || ev[0].kind !== "opened" || !Array.isArray(ev[0].parties) || !ev[0].parties.length || ev[0].parties.some((p) => !partyData(p))) return [...problems, "events"];
  let status = "open";
  let proposal = null;
  let verdicts = ev[0].parties.map(() => "not-screened");
  for (const e of ev.slice(1)) {
    const settled = DONE.has(status);
    if (settled || typeof e.at !== "string" || e.at < ev[0].at) return [...problems, "events"];
    if (e.kind === "screened") {
      if (status === "approved" || !Object.hasOwn(VERDICTS, e.verdict) || !(e.party >= 0 && e.party < ev[0].parties.length)) return [...problems, "events"];
      verdicts = verdicts.map((v, i) => (i === e.party ? e.verdict : v));
    } else if (e.kind === "proposed") {
      if (status === "approved" || !Array.isArray(e.violations) || e.violations.some((v) => !Object.hasOwn(RULES, v))) return [...problems, "events"];
      if ((e.disposition === "hold") !== (e.violations.length > 0) || !["hold", "awaiting-human"].includes(e.disposition)) return [...problems, "proposal"];
      // A proposal that waits for a person must itself show a spec-basis, every document and no hit.
      const b = e.basis;
      if (e.disposition === "awaiting-human" && !(b?.specBasis && b.docs?.length === b.specBasis.required && !b.verdicts?.includes("hit"))) return [...problems, "proposal"];
      if (!same(b?.verdicts, verdicts)) return [...problems, "proposal"];
      proposal = e; status = e.disposition === "hold" ? "hold" : "awaiting-human";
    } else if (e.kind === "approved") {
      // Approved only against the screening the proposal was judged on.
      if (status !== "awaiting-human" || !text(e.by) || !text(e.role) || !proposal || !same(proposal.basis.verdicts, verdicts)) return [...problems, "approval"];
      status = "approved";
    } else if (e.kind === "declined") {
      if (status !== "awaiting-human" || !text(e.by)) return [...problems, "approval"];
      status = "declined";
    } else if (e.kind === "closed") {
      if (status !== "approved" || !text(e.by)) return [...problems, "approval"];
      status = "closed";
    } else if (e.kind === "withdrawn") {
      status = "withdrawn";
    } else return [...problems, "events"];
  }
  return problems;
}
