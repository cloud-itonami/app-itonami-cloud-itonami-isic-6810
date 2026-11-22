// Static build: dist/ holds the whole app for the Tauri v3 shell and for a
// plain static host. No bundler and no runtime dependency.
// - The shared Kotoba client runtime is copied from vendor/ only if its digest
//   matches vendor/PINS.json.
// - descriptor.json is validated by that runtime, and the page and Tauri CSP
//   must carry exactly the connect-src it derives from the declared operations.
// - The jurisdiction catalog is read from realty.facts (../src/realty/facts.cljk),
//   the actor's own spec-basis table, and becomes an ES module, so the page needs
//   no fetch and the app never carries a second copy of the catalog.
import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { clientRuntimeProblems, clientRuntimeConnectSrc } from "../vendor/kotoba-client-runtime.js";
import { readDef } from "./edn.mjs";
import { execFileSync } from "node:child_process";
import { bundleModules, readModules } from "./guest-bundle.mjs";
import { checkNoSubmit } from "./check-no-submit.mjs";

// The guest's modules, inlined into its one script (descriptor.js and jurisdictions.js are generated).
const GUEST_MODULES = ["app.js", "store.js", "records.js", "closing.js", "lookup.js", "guest-port.js", "guest-form.js"];

const root = fileURLToPath(new URL("../", import.meta.url));
const out = resolve(root, "dist");
const meta = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const app = meta.itonami;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const pins = JSON.parse(await readFile(resolve(root, "vendor/PINS.json"), "utf8"));
for (const [name, digest] of Object.entries(pins.files)) {
  if (sha(await readFile(resolve(root, "vendor", name))) !== digest) throw new Error(`canonical runtime pin drift: ${name}`);
}

const descriptor = JSON.parse(await readFile(resolve(root, "src/descriptor.json"), "utf8"));
const capabilities = descriptor.operations.map((op) => op.capability);
const problems = clientRuntimeProblems(descriptor, capabilities, []);
if (problems.length) throw new Error(`invalid descriptor: ${JSON.stringify(problems)}`);
export const connectSrc = clientRuntimeConnectSrc(descriptor, capabilities, [], []).replace(/^connect-src /, "");

// restricted-wasm-v1 (KOTOBA-159): dist/index.html is the trusted host (src/host.html, host.js)
// with the canonical runtime and broker; the app is one guest document (src/guest.html with the
// app's modules inlined by guest-bundle.mjs and style.css inline), pinned by SHA-256 and the
// source commit, verified and mounted by the host in an opaque-origin sandbox. The page policy
// admits the runtime's guest preamble, the guest script and the guest style by hash, nothing else
// inline. The sandboxed guest inherits it and adds its own connect-src 'none'.
const cspHash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
const runtimeText = await readFile(resolve(root, "vendor/kotoba-client-runtime.js"), "utf8");
const preambleMatch = /^const GUEST_PREAMBLE = '<script>([^'\\]*)<\/script>';$/m.exec(runtimeText);
if (!preambleMatch) throw new Error("the canonical runtime has no GUEST_PREAMBLE this build can hash");
const factsPath = resolve(root, "../src/realty/facts.cljk");
const factsSource = await readFile(factsPath);
const catalog = readDef(factsSource.toString("utf8"), "catalog");
for (const [iso, spec] of Object.entries(catalog)) {
  if (!spec.name || !spec["owner-authority"] || !spec.provenance || !Array.isArray(spec["required-docs"])) throw new Error(`realty.facts ${iso} lacks a spec-basis`);
}
const facts = { source: "src/realty/facts.cljk", sha256: sha(factsSource), catalog };
const modules = await readModules(resolve(root, "src"), GUEST_MODULES);
modules["descriptor.js"] = `export default ${JSON.stringify(descriptor)};\n`;
modules["jurisdictions.js"] = `export default ${JSON.stringify(facts)};\n`;
export const guestScript = bundleModules(modules, "app.js");
// The sandbox has no allow-forms (B5): the guest must not rely on a submit event (itonami-lib guard).
checkNoSubmit(guestScript, "the restricted guest script");
export const guestStyle = await readFile(resolve(root, "src/style.css"), "utf8");
if (/<\/style/i.test(guestStyle)) throw new Error("src/style.css contains </style");
export const CSP = `default-src 'none'; script-src 'self' ${cspHash(preambleMatch[1])} ${cspHash(guestScript)}; style-src 'self' ${cspHash(guestStyle)}; img-src 'self' data:; connect-src ipc: http://ipc.localhost ${connectSrc}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`;

const confPath = resolve(root, "src-tauri/tauri.conf.json");
const confText = await readFile(confPath, "utf8");
const conf = JSON.parse(confText);
if (conf.app.security.csp !== CSP) {
  if (!process.argv.includes("--update-csp")) throw new Error("tauri.conf.json CSP is not the one derived from the descriptor and the guest; run `node scripts/build.mjs --update-csp` and commit it");
  conf.app.security.csp = CSP;
  await writeFile(confPath, JSON.stringify(conf) + "\n");
}

const state = sourceState();
if (!state.commit) throw new Error("restricted-wasm-v1 pins the guest to its source commit: build from a git checkout or set ITONAMI_SOURCE_COMMIT");
const template = await readFile(resolve(root, "src/guest.html"), "utf8");
for (const marker of ["{{STYLE}}", "{{SCRIPT}}"]) if (template.split(marker).length !== 2) throw new Error(`guest.html must contain ${marker} once`);
export const guest = template.replace("{{STYLE}}", () => guestStyle).replace("{{SCRIPT}}", () => guestScript);
checkNoSubmit(guest, "the restricted guest");
if (guest.length > 8388608) throw new Error("the guest exceeds the 8 MiB mount budget");
const guestBytes = new TextEncoder().encode(guest);
const artifact = { revision: state.commit, sha256: sha(guestBytes), "max-bytes": guestBytes.byteLength };
const foreignInfo = new URL(descriptor.operations[0].disclosure["foreign-info-url"]);
foreignInfo.hash = "";

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const host = await readFile(resolve(root, "src/host.html"), "utf8");
if (host.split("@CSP@").length !== 2) throw new Error("host.html has no CSP build marker");
await writeFile(join(out, "index.html"), host.replace("@CSP@", () => CSP));
const hostSources = ["host.js", "host.css", "allowed-sending.js"];
for (const name of hostSources) await copyFile(resolve(root, "src", name), join(out, name));
for (const name of Object.keys(pins.files)) await copyFile(resolve(root, "vendor", name), join(out, name));
await writeFile(join(out, "descriptor.json"), JSON.stringify(descriptor, null, 2) + "\n");
await writeFile(join(out, "host-data.js"), `export default ${JSON.stringify({ descriptor, artifact, guest, foreignInfo: foreignInfo.href }, null, 1)};\n`);

const names = ["index.html", ...hostSources, ...Object.keys(pins.files), "descriptor.json", "host-data.js"];
const files = {};
for (const name of names) files[name] = sha(await readFile(join(out, name)));
await writeFile(join(out, "release.json"), JSON.stringify({
  schema: "awai.app.artifact.v1", id: app.id, version: meta.version, tauri: "3.0.0-alpha.6", profile: descriptor.profile, runtimePins: pins,
  facts: { source: facts.source, sha256: facts.sha256 }, guest: artifact, source_commit: state.commit, dirty: state.dirty, files,
}, null, 2) + "\n");
console.log(`${app.title} static build (${descriptor.profile}): ${names.length} pinned files, guest ${guestBytes.byteLength} bytes`);

function sourceState() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "";
    return { commit: /^[0-9a-f]{40}$/.test(commit) ? commit : null, dirty };
  } catch {
    const commit = process.env.ITONAMI_SOURCE_COMMIT;
    return { commit: commit && /^[0-9a-f]{40}$/.test(commit) ? commit : null, dirty: process.env.ITONAMI_SOURCE_DIRTY === "true" };
  }
}
