// The single external operation: a Wikidata query, declared with its exact
// route, sent only after an explicit Allow. Run after `npm run build`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import * as runtime from "../dist/kotoba-client-runtime.js";
import { buildQuery, lookupUrl, parseResults, lookupOperation, createLookup } from "../dist/lookup.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFile(resolve(root, p), "utf8");
const descriptor = JSON.parse(await read("src/descriptor.json"));
const op = lookupOperation(descriptor);
const capabilities = descriptor.operations.map((o) => o.capability);

test("the descriptor declares one lookup with a fixed route and format", () => {
  assert.deepEqual(runtime.clientRuntimeProblems(descriptor, capabilities, []), []);
  assert.equal(descriptor.operations.length, 1);
  assert.equal(op.consent, "each-operation");
  assert.deepEqual(op.endpoint, { origin: "https://query.wikidata.org", routes: [{ method: "GET", path: "/sparql", "query-params": ["query", "format"], "query-values": { format: "json" } }] });
  assert.deepEqual(op["data-categories"], ["location", "ip-address", "user-agent"]);
  assert.equal(op["redirect-origins"], undefined);
  assert.equal(descriptor["local-state"].adapter, "indexeddb");
});

test("page and Tauri CSP allow only Wikidata besides IPC", async () => {
  assert.equal(runtime.clientRuntimeConnectSrc(descriptor, capabilities, [], []), "connect-src https://query.wikidata.org");
  const html = await read("src/index.html");
  const conf = JSON.parse(await read("src-tauri/tauri.conf.json"));
  for (const csp of [html.match(/Content-Security-Policy" content="([^"]+)"/)[1], conf.app.security.csp]) {
    assert.equal(csp.split(";").map((s) => s.trim()).find((s) => s.startsWith("connect-src")), "connect-src ipc: http://ipc.localhost https://query.wikidata.org");
    assert.match(csp, /default-src 'none'/);
  }
});

test("the query sends only rounded coordinates and an offered radius", () => {
  const q = buildQuery({ lat: 35.658612345, lon: 139.745412345, radiusKm: 1 });
  assert.match(q, /Point\(139\.74541 35\.65861\)/);
  assert.match(q, /wikibase:radius "1"/);
  assert.match(q, /wdt:P127/);
  assert.throws(() => buildQuery({ lat: 0, lon: 0, radiusKm: 3 }), /radius/);
  assert.throws(() => buildQuery({ lat: 91, lon: 0, radiusKm: 1 }), /coordinate/);
  const url = new URL(lookupUrl(op, q));
  assert.equal(url.origin + url.pathname, "https://query.wikidata.org/sparql");
  assert.deepEqual([...url.searchParams.keys()], ["query", "format"]);
  assert.ok(runtime.clientEndpointAllowsRequest(op.endpoint, url.href));
  url.searchParams.set("format", "xml");
  assert.ok(!runtime.clientEndpointAllowsRequest(op.endpoint, url.href), "another format is not declared");
});

test("results are grouped per place and natural persons are not named", () => {
  const b = (item, label, owner, ownerLabel, human, dist) => ({
    item: { value: `http://www.wikidata.org/entity/${item}` }, itemLabel: { value: label },
    owner: { value: `http://www.wikidata.org/entity/${owner}` }, ownerLabel: { value: ownerLabel },
    human: { value: String(human) }, coord: { value: "Point(139.7454 35.6586)" }, dist: { value: String(dist) },
  });
  const out = parseResults({ results: { bindings: [
    b("Q2", "建物 B", "Q20", "会社", false, 0.6),
    b("Q1", "建物 A", "Q10", "山田太郎", true, 0.2),
    b("Q2", "建物 B", "Q21", "自治体", false, 0.6),
    b("Q2", "建物 B", "Q21", "自治体", false, 0.6),
    { item: { value: "not an entity" } },
  ] } });
  assert.deepEqual(out.map((x) => x.item), ["Q1", "Q2"]);
  assert.deepEqual(out[0].owners, [{ id: "", label: "個人", person: true }]);
  assert.ok(!JSON.stringify(out).includes("山田太郎"));
  assert.deepEqual(out[1].owners.map((o) => o.label), ["会社", "自治体"]);
  assert.equal(out[0].lat, 35.6586);
  assert.throws(() => parseResults({}), /SPARQL/);
});

// A stand-in for the trusted consent host. A script can only deny: Allow
// counts only after a trusted press, which a test cannot make.
function denyingConsentHost() {
  const listeners = new Map();
  const seen = [];
  const node = (tag) => {
    const el = {
      tag, children: [], attributes: {}, disabled: false, open: false, textContent: "", isConnected: true,
      append: (...c) => el.children.push(...c), setAttribute: (k, v) => { el.attributes[k] = v; },
      addEventListener: (type, fn) => listeners.set(`${tag}:${el.textContent || type}:${type}`, fn),
      focus() {}, remove() { el.isConnected = false; },
      showModal() { el.open = true; seen.push(true); queueMicrotask(() => listeners.get("button:Deny:click")({})); },
      close() { el.open = false; },
    };
    return el;
  };
  const doc = { body: node("body"), createElement: node, defaultView: { performance, MouseEvent: class {} } };
  const previous = globalThis.document;
  globalThis.document = doc;
  try { return { handle: runtime.createClientConsentHost({ document: doc }), seen }; }
  finally { globalThis.document = previous; }
}

test("denying the lookup sends no request", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { calls.push(String(input?.url ?? input)); return new Response("{}"); };
  try {
    const host = denyingConsentHost();
    const lookup = createLookup({ descriptor, consentHost: host.handle });
    await assert.rejects(lookup.search({ lat: 35.6586, lon: 139.7454, radiusKm: 1 }), /not approved/);
    assert.equal(host.seen.length, 1, "the dialog was shown");
    assert.deepEqual(calls, [], "no request was sent");
  } finally { globalThis.fetch = originalFetch; }
});

test("only the vendored broker issues network requests", async () => {
  for (const name of await readdir(resolve(root, "dist"))) {
    if (!name.endsWith(".js") || name === "kotoba-client-runtime.js") continue;
    const src = await read(join("dist", name));
    for (const api of [/\bfetch\s*\(/, /XMLHttpRequest/, /\bWebSocket\b/, /\bEventSource\b/, /sendBeacon/, /import\s*\(\s*["'`]https?:/, /from\s+["']https?:/, /innerHTML/]) {
      assert.ok(!api.test(src), `${name} uses ${api}`);
    }
  }
});

test("the Tauri host grants only the read-only host-info command", async () => {
  for (const name of await readdir(resolve(root, "src-tauri/capabilities"))) {
    assert.deepEqual(JSON.parse(await read(join("src-tauri/capabilities", name))).permissions, ["allow-awai-host-info"]);
  }
  const cargo = await read("src-tauri/Cargo.toml");
  assert.match(cargo, /tauri = \{ version = "=3\.0\.0-alpha\.6"/);
  assert.doesNotMatch(cargo, /tauri-plugin-(http|fs|shell)/);
});

test("release manifest pins every shipped file, the runtime and realty.facts", async () => {
  const release = JSON.parse(await read("dist/release.json"));
  for (const name of await readdir(resolve(root, "dist"))) if (name !== "release.json") assert.ok(release.files[name], `${name} is not pinned`);
  const pins = JSON.parse(await read("vendor/PINS.json"));
  for (const [name, digest] of Object.entries(pins.files)) {
    assert.equal(createHash("sha256").update(await readFile(resolve(root, "vendor", name))).digest("hex"), digest);
  }
  assert.equal(release.facts.sha256, createHash("sha256").update(await readFile(resolve(root, "../src/realty/facts.cljk"))).digest("hex"));
});
