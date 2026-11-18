// Property-rights records kept on this device. Pure functions, no I/O.
//
// Same discipline as realty.registry (src/realty/registry.cljk): a record is a
// DRAFT the user keeps, never an official registration; its number is a
// jurisdiction-scoped sequence, not an invented registry format; and history
// is append-only (an amendment adds an entry and never rewrites the past).

export const RECORD_SCHEMA = "network.itonami.registry.record.v1";

export const PROPERTY_KINDS = Object.freeze({ land: "土地", building: "建物", unit: "区分建物" });

export const RIGHT_TYPES = Object.freeze({
  ownership: "所有権",
  "co-ownership": "共有持分",
  superficies: "地上権",
  lease: "賃借権",
  easement: "地役権",
  mortgage: "抵当権",
  "revolving-mortgage": "根抵当権",
  other: "その他",
});

const FIELDS = ["jurisdiction", "kind", "address", "parcel", "areaM2", "lat", "lon", "rights", "docs", "references", "note"];

const text = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** Normalize user input into record data. Returns { data } or { problems }. */
export function recordData(input, catalog = {}) {
  const problems = [];
  const jurisdiction = text(input.jurisdiction, 16).toUpperCase();
  if (!/^[A-Z]{3}(-[A-Z]{2,3})?$/.test(jurisdiction)) problems.push("jurisdiction");
  const kind = text(input.kind, 16);
  if (!Object.hasOwn(PROPERTY_KINDS, kind)) problems.push("kind");
  const address = text(input.address);
  if (!address) problems.push("address");
  const areaM2 = num(input.areaM2);
  if (areaM2 !== null && !(Number.isFinite(areaM2) && areaM2 > 0)) problems.push("areaM2");
  const lat = num(input.lat), lon = num(input.lon);
  if ((lat === null) !== (lon === null)) problems.push("location");
  else if (lat !== null && !(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180)) problems.push("location");
  const rights = (Array.isArray(input.rights) ? input.rights : []).map((r) => ({
    type: text(r?.type, 32), holder: text(r?.holder, 200), share: text(r?.share, 32), since: text(r?.since, 10), note: text(r?.note, 300),
  })).filter((r) => r.holder || r.note);
  for (const r of rights) {
    if (!Object.hasOwn(RIGHT_TYPES, r.type)) problems.push("rights.type");
    if (!r.holder) problems.push("rights.holder");
    if (r.since && !/^\d{4}-\d{2}-\d{2}$/.test(r.since)) problems.push("rights.since");
  }
  const known = new Set(catalog[jurisdiction]?.["required-docs"] ?? []);
  const docs = [...new Set((Array.isArray(input.docs) ? input.docs : []).filter((d) => known.has(d)))];
  const references = (Array.isArray(input.references) ? input.references : []).map(referenceData).filter(Boolean);
  if (problems.length) return { problems: [...new Set(problems)] };
  return {
    data: {
      jurisdiction, kind, address, parcel: text(input.parcel, 100), areaM2, lat, lon, rights, docs, references, note: text(input.note, 2000),
    },
  };
}

function referenceData(ref) {
  if (ref?.source !== "wikidata" || !/^Q\d+$/.test(ref.item ?? "")) return null;
  return {
    source: "wikidata", item: ref.item, label: text(ref.label, 200),
    owners: (Array.isArray(ref.owners) ? ref.owners : []).map((o) => ({ id: /^Q\d+$/.test(o?.id ?? "") ? o.id : "", label: text(o?.label, 200), person: o?.person === true })),
    retrievedAt: text(ref.retrievedAt, 40),
  };
}

const pad = (n, w) => String(n).padStart(w, "0");

/** The next jurisdiction-scoped number, as realty.registry does: "JPN-00000001". */
export function nextRecordId(records, jurisdiction) {
  const prefix = `${jurisdiction}-`;
  const used = records.map((r) => r.id).filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)));
  return prefix + pad((used.length ? Math.max(...used) : 0) + 1, 8);
}

export function createRecord(records, input, { catalog = {}, now = new Date().toISOString() } = {}) {
  const { data, problems } = recordData(input, catalog);
  if (problems) return { problems };
  const record = {
    schema: RECORD_SCHEMA,
    id: nextRecordId(records, data.jurisdiction),
    status: "draft-unsigned",
    official: false,
    createdAt: now,
    data,
    history: [{ at: now, kind: "created", data }],
  };
  return { record };
}

/** A new record with the changes applied and one amendment appended. */
export function amendRecord(record, input, { catalog = {}, now = new Date().toISOString() } = {}) {
  const merged = { ...record.data, ...input };
  if (merged.jurisdiction !== record.data.jurisdiction) return { problems: ["jurisdiction-fixed"] };
  const { data, problems } = recordData(merged, catalog);
  if (problems) return { problems };
  const changed = {};
  for (const f of FIELDS) if (JSON.stringify(data[f]) !== JSON.stringify(record.data[f])) changed[f] = data[f];
  if (!Object.keys(changed).length) return { record, unchanged: true };
  return { record: { ...record, data, history: [...record.history, { at: now, kind: "amendment", changed }] } };
}

/** Replays the history; a record whose data does not follow from it is refused on load. */
export function recordProblems(record) {
  const problems = [];
  if (record?.schema !== RECORD_SCHEMA) return ["schema"];
  if (record.official !== false || record.status !== "draft-unsigned") problems.push("status");
  if (!/^[A-Z]{3}(-[A-Z]{2,3})?-\d{8}$/.test(record.id ?? "")) problems.push("id");
  const h = record.history;
  if (!Array.isArray(h) || !h.length || h[0].kind !== "created") return [...problems, "history"];
  let data = h[0].data;
  for (const entry of h.slice(1)) {
    if (entry.kind !== "amendment" || typeof entry.changed !== "object" || entry.at < h[0].at) return [...problems, "history"];
    data = { ...data, ...entry.changed };
  }
  if (JSON.stringify(data) !== JSON.stringify(record.data)) problems.push("history-replay");
  if (!record.id.startsWith(`${record.data?.jurisdiction}-`)) problems.push("id");
  return problems;
}

/** Required documents for the jurisdiction, with what the record marks as held. */
export function checklist(record, catalog) {
  const spec = catalog[record.data.jurisdiction];
  if (!spec) return { covered: false, items: [] };
  const held = new Set(record.data.docs);
  return { covered: true, items: spec["required-docs"].map((doc) => ({ doc, held: held.has(doc) })) };
}
