// Lookup of public ownership statements near a record's location.
//
// The source is Wikidata ("owned by", P127), the same public source the
// jinushi land-ownership actor ingests (jinushi.methods.normalize-wdqs). The
// query goes straight from this device to query.wikidata.org through the
// shared Kotoba broker, and only after a fresh approval of that one request;
// the dialog shows the coordinates and radius that will be sent. Denying sends
// nothing. Results are statements in Wikidata, not a land register.
//
// Like jinushi, the app does not show natural persons by name: an owner that
// Wikidata types as a human (Q5) is shown as "個人". This masking is the
// lookup half of the PII boundary in docs/pii-boundary.md (ZB20-SG01):
// parseResults applies it before anything can be displayed or saved as a
// record reference, and records.js referenceData re-applies it on save.
import { createClientOperationBroker } from "./kotoba-client-runtime.js";

export const MAX_BYTES = 2_000_000;
export const RADII_KM = Object.freeze([0.5, 1, 5, 25]);

export function lookupOperation(descriptor) {
  const op = descriptor.operations.find((o) => o.operation === "query-owned-by-near");
  if (!op) throw new Error("lookup operation is not declared");
  return op;
}

const coord = (v, lim) => {
  const x = Number(v);
  if (!Number.isFinite(x) || Math.abs(x) > lim) throw new RangeError("invalid coordinate");
  return Math.round(x * 1e5) / 1e5; // ~1 m; nothing finer is sent
};

export function buildQuery({ lat, lon, radiusKm }) {
  if (!RADII_KM.includes(radiusKm)) throw new RangeError("radius must be one of the offered values");
  const point = `Point(${coord(lon, 180)} ${coord(lat, 90)})`;
  return [
    "SELECT ?item ?itemLabel ?owner ?ownerLabel ?human ?coord ?dist WHERE {",
    "  SERVICE wikibase:around {",
    "    ?item wdt:P625 ?coord .",
    `    bd:serviceParam wikibase:center "${point}"^^geo:wktLiteral .`,
    `    bd:serviceParam wikibase:radius "${radiusKm}" .`,
    "    bd:serviceParam wikibase:distance ?dist .",
    "  }",
    "  ?item wdt:P127 ?owner .",
    "  BIND(EXISTS { ?owner wdt:P31 wd:Q5 } AS ?human)",
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }',
    "} ORDER BY ?dist LIMIT 100",
  ].join("\n");
}

export function lookupUrl(op, query) {
  const url = new URL(op.endpoint.origin + op.endpoint.routes[0].path);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");
  return url.href;
}

const qid = (uri) => (typeof uri === "string" && /\/entity\/(Q\d+)$/.test(uri) ? uri.match(/(Q\d+)$/)[1] : null);
const POINT = /^Point\((-?[\d.]+(?:[eE]-?\d+)?) (-?[\d.]+(?:[eE]-?\d+)?)\)$/;

/** SPARQL JSON results → one entry per item, owners grouped, nearest first. */
export function parseResults(json) {
  const rows = json?.results?.bindings;
  if (!Array.isArray(rows)) throw new Error("not a SPARQL result");
  const items = new Map();
  for (const row of rows) {
    const item = qid(row.item?.value);
    const owner = qid(row.owner?.value);
    if (!item || !owner) continue;
    let entry = items.get(item);
    if (!entry) {
      const m = POINT.exec(row.coord?.value ?? "");
      const dist = Number(row.dist?.value);
      entry = {
        item, label: String(row.itemLabel?.value ?? item).slice(0, 200),
        lon: m ? Number(m[1]) : null, lat: m ? Number(m[2]) : null,
        distanceKm: Number.isFinite(dist) ? dist : null, owners: [],
      };
      items.set(item, entry);
    }
    if (entry.owners.some((o) => o.id === owner)) continue;
    const person = row.human?.value === "true";
    entry.owners.push(person ? { id: "", label: "個人", person: true } : { id: owner, label: String(row.ownerLabel?.value ?? owner).slice(0, 200), person: false });
  }
  return [...items.values()].sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

async function boundedText(response, max) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("lookup response is too large"); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

export function createLookup({ descriptor, consentHost }) {
  const op = lookupOperation(descriptor);
  const selector = { capability: op.capability, service: op.service, operation: op.operation };
  const broker = createClientOperationBroker({
    runtime: descriptor,
    requestedCapabilities: descriptor.operations.map((o) => o.capability),
    approvedOperations: [op],
    hostSupportedOperations: [[op.capability, op.service, op.operation]],
    consentHost,
  });
  return {
    operation: op,
    /** Ask, then query. Throws "client operation was not approved" when denied. */
    async search({ lat, lon, radiusKm, signal }) {
      const input = lookupUrl(op, buildQuery({ lat, lon, radiusKm }));
      const response = await broker.invoke(selector, { input }, { signal });
      if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
      const results = parseResults(JSON.parse(await boundedText(response, MAX_BYTES)));
      return { results, retrievedAt: new Date().toISOString() };
    },
  };
}
