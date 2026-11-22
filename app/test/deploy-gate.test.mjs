// The release gate (Decision 2026-11-22). Negative control: even when DNS is up and the disclosure
// page answers 200, a release stays blocked while a feature from before the move is still off.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deployAllowed, disabledFeatures, disclosurePages } from "../scripts/deploy-gate.mjs";

const ok200 = async () => new Response("", { status: 200 });
const down = async () => { throw new Error("fetch failed"); };

test("negative control: the disclosure page answers 200, a feature is still off -> blocked", async () => {
  assert.ok((await disabledFeatures()).length > 0);
  const result = await deployAllowed({ fetchImpl: ok200 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.every((r) => r.startsWith("feature still off:")));
});

test("disclosure page down -> blocked; positive control only when both hold", async () => {
  assert.equal((await deployAllowed({ fetchImpl: down, features: [] })).ok, false);
  assert.deepEqual(await deployAllowed({ fetchImpl: ok200, features: [] }), { ok: true, reasons: [] });
  assert.deepEqual(disclosurePages(), ["https://disclosures.awai.network/network.itonami.registry/foreign-info.html"]);
});

test("the list matches the code: records-kept is listed while local-state is memory", async () => {
  const descriptor = JSON.parse(await readFile(new URL("../src/descriptor.json", import.meta.url), "utf8"));
  const ids = (await disabledFeatures()).map((f) => f.id);
  assert.equal(ids.includes("records-kept"), descriptor["local-state"].adapter === "memory");
});
