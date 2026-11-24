// The single external operation: a Wikidata query, declared with its exact
// route, sent only after an explicit Allow. Run after `npm run build`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import * as runtime from "../dist/kotoba-client-runtime.js";
import { buildQuery, lookupUrl, parseResults, lookupOperation, createLookup, decimalsFor, roundCoordinate, RADII_KM } from "../src/lookup.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p) => readFile(resolve(root, p), "utf8");
const descriptor = JSON.parse(await read("src/descriptor.json"));
const fileRoot = root;
const op = lookupOperation(descriptor);
const capabilities = descriptor.operations.map((o) => o.capability);

test("the descriptor declares one lookup with a fixed route and format, and its disclosure", () => {
  assert.deepEqual(runtime.clientRuntimeProblems(descriptor, capabilities, []), []);
  assert.equal(descriptor.profile, "restricted-wasm-v1");
  assert.equal(descriptor.operations.length, 1);
  assert.equal(op.consent, "each-operation");
  assert.deepEqual(op.endpoint, { origin: "https://query.wikidata.org", routes: [{ method: "GET", path: "/sparql", "query-params": ["query", "format"], "query-values": { format: "json" } }] });
  assert.deepEqual(op["data-categories"], ["location", "ip-address", "user-agent"]);
  assert.equal(op["redirect-origins"], undefined);
  // The sandboxed guest has no storage of its own until the runtime's host-mediated storage (KOTOBA-968).
  assert.equal(descriptor["local-state"].adapter, "memory");
  const d = op.disclosure;
  assert.deepEqual(runtime.clientDisclosureProblems(d), []);
  assert.equal(d.recipient, "Wikimedia Foundation, Inc.");
  assert.equal(d.country, "US");
  assert.equal(d.data[0], "登録した物件のおおよその位置（約 100 m に丸めた緯度と経度）");
  assert.equal(d.note, "物件のおおよその位置（約 100 m 単位）を米国の Wikimedia Foundation に送ります。自宅を登録している場合は、ご注意ください。");
  assert.equal(d.withdrawal, "設定 › 許可した送信");
  const conf = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
  assert.equal(d["foreign-info-url"], `https://disclosures.awai.network/${conf.identifier}/foreign-info.html#us`);
});

test("negative controls: the canonical runtime refuses the lookup without a complete disclosure", () => {
  for (const field of ["recipient", "country", "data", "purpose", "frequency", "withdrawal", "foreign-info-url"]) {
    const { [field]: _gone, ...disclosure } = op.disclosure;
    const problems = runtime.clientRuntimeProblems({ ...descriptor, operations: [{ ...op, disclosure }] }, capabilities, []);
    assert.ok(problems.some((p) => p.error === "invalid-disclosure"), field);
  }
});

test("host page and Tauri CSP: Wikidata besides IPC, and only the guest's hashed script and style inline", async () => {
  assert.equal(runtime.clientRuntimeConnectSrc(descriptor, capabilities, [], []), "connect-src https://query.wikidata.org");
  const html = await read("dist/index.html");
  const conf = JSON.parse(await read("src-tauri/tauri.conf.json"));
  const pageCsp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(conf.app.security.csp, pageCsp, "tauri.conf.json carries the page policy");
  assert.equal(pageCsp.split(";").map((s) => s.trim()).find((s) => s.startsWith("connect-src")), "connect-src ipc: http://ipc.localhost https://query.wikidata.org");
  assert.match(pageCsp, /^default-src 'none'; script-src 'self' 'sha256-[^']+' 'sha256-[^']+'; style-src 'self' 'sha256-[^']+';/);
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) assert.match(tag[0], /src=/, "no inline script in the host");
});

test("the guest is one self-contained document, pinned and verified by the canonical runtime", async () => {
  const { default: host } = await import("../dist/host-data.js");
  const release = JSON.parse(await read("dist/release.json"));
  assert.deepEqual(host.descriptor, descriptor);
  assert.deepEqual(release.guest, host.artifact);
  assert.match(host.artifact.revision, /^[0-9a-f]{40}$/);
  assert.equal(host.artifact.revision, release.source_commit);
  assert.ok(host.guest.length <= 8388608);
  assert.equal((await runtime.verifyClientArtifact(new TextEncoder().encode(host.guest), host.artifact)).verified, true);
  await assert.rejects(runtime.verifyClientArtifact(new TextEncoder().encode(host.guest.replace("登記", "登録")), host.artifact), /digest mismatch/);
  const scripts = [...host.guest.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  const html = await read("dist/index.html");
  const hash = (t) => `'sha256-${createHash("sha256").update(t, "utf8").digest("base64")}'`;
  assert.ok(html.includes(hash(scripts[0][2])), "the guest script is admitted by hash");
  assert.ok(!/<link\b|<script\b[^>]*\bsrc=/i.test(host.guest), "the guest loads no file");
  assert.equal(host.foreignInfo, "https://disclosures.awai.network/network.itonami.registry/foreign-info.html");
  const file = join(tmpdir(), `registry-guest-${process.pid}.mjs`);
  await writeFile(file, scripts[0][2]);
  execFileSync(process.execPath, ["--check", file]);
});

test("the query sends only rounded coordinates and an offered radius", () => {
  const q = buildQuery({ lat: 35.658612345, lon: 139.745412345, radiusKm: 1 });
  assert.match(q, /Point\(139\.745 35\.659\)/);
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
      showModal() { el.open = true; seen.push(true); queueMicrotask(() => listeners.get("button:許可しない:click")({})); },
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
    const broker = runtime.createClientOperationBroker({ runtime: descriptor, requestedCapabilities: capabilities, approvedOperations: [op],
      hostSupportedOperations: [[op.capability, op.service, op.operation]], consentHost: host.handle });
    const lookup = createLookup({ descriptor, invoke: (selector, payload, options) => broker.invoke(selector, payload, options) });
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

test("only the approximate place is sent: about 100 m (3 decimals) for every offered radius", () => {
  for (const r of RADII_KM) assert.equal(decimalsFor(r), 3, `radius ${r} km`);
  // A radius under 100 m would need a finer grid, but only as fine as the radius.
  assert.equal(decimalsFor(0.05), 4);
  assert.equal(decimalsFor(0.005), 5);
  assert.equal(roundCoordinate(35.6586, 90), 35.659);
  assert.equal(roundCoordinate(-0.0004, 90), 0);
  assert.equal(roundCoordinate(139.7454999, 180), 139.745);
  assert.throws(() => roundCoordinate(Number.NaN, 90), /coordinate/);
  // Whatever the input precision, the query carries at most 3 decimals per coordinate.
  for (const [lat, lon] of [[35.658612345, 139.745412345], [-33.8567844, 151.213108], [0.00049, -0.00051], [89.9999999, -179.9999999]]) {
    for (const radiusKm of RADII_KM) {
      const q = buildQuery({ lat, lon, radiusKm });
      const [, x, y] = /Point\((-?[\d.]+) (-?[\d.]+)\)/.exec(q);
      for (const v of [x, y]) assert.ok(!v.includes(".") || v.split(".")[1].length <= 3, `${v} in ${q}`);
      assert.ok(Math.abs(Number(y) - lat) <= 0.0005 + 1e-12 && Math.abs(Number(x) - lon) <= 0.0005 + 1e-12);
    }
  }
  // Two homes about 30 m apart send the same place.
  assert.equal(buildQuery({ lat: 35.65861, lon: 139.74541, radiusKm: 0.5 }), buildQuery({ lat: 35.65880, lon: 139.74520, radiusKm: 0.5 }));
});
