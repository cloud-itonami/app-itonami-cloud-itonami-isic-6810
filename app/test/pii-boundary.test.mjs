// ZB20-SG01 negative control: synthetic fixture PII must be rejected or
// masked and must NEVER round-trip/persist unredacted through records.js
// or store.js. Every fixture below is strictly synthetic (fictional
// *.invalid address, sequential digits); no real personal data is used.
import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, amendRecord, recordProblems, piiFindings } from "../src/records.js";
import { openStore, piiFindings as storePiiFindings } from "../src/store.js";

const t0 = "2026-11-28T00:00:00.000Z";
const FIXTURE_EMAIL = "synthetic-owner@example.invalid";
const FIXTURE_PHONE = "090-0000-0000";
const FIXTURE_ID = "1234-5678-9012"; // synthetic grouped 12-digit identifier
const FIXTURE_PERSON = "合成フィクスチャ太郎";

const base = {
  jurisdiction: "JPN", kind: "land", address: "東京都港区芝公園四丁目",
  rights: [{ type: "ownership", holder: "株式会社フィクスチャ" }],
};

function fakeIndexedDB() {
  const data = new Map();
  const db = {
    createObjectStore() {},
    transaction() {
      let req;
      const tx = {
        oncomplete: null, onerror: null, onabort: null, error: null,
        objectStore() {
          return {
            get(key) { req = { result: data.get(key) }; queueMicrotask(() => tx.oncomplete?.()); return req; },
            put(value, key) { req = { result: key }; data.set(key, JSON.parse(JSON.stringify(value))); queueMicrotask(() => tx.oncomplete?.()); return req; },
            delete(key) { req = { result: undefined }; data.delete(key); queueMicrotask(() => tx.oncomplete?.()); return req; },
          };
        },
      };
      return tx;
    },
  };
  return {
    data,
    open() {
      const req = { result: db, error: null };
      queueMicrotask(() => { req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
}

test("control: a clean synthetic record is accepted (guard is not over-broad)", () => {
  const { record, problems } = createRecord([], base, { now: t0 });
  assert.equal(problems, undefined);
  assert.ok(record);
  assert.deepEqual(recordProblems(record), []);
  assert.deepEqual(piiFindings(record), []);
});

test("fixture contacts/identifiers are rejected wherever they are placed", () => {
  const placements = [
    { ...base, rights: [{ type: "ownership", holder: FIXTURE_EMAIL }] },
    { ...base, rights: [{ type: "ownership", holder: `連絡先 ${FIXTURE_PHONE}` }] },
    { ...base, address: `${base.address} ${FIXTURE_ID}` },
    { ...base, note: `owner mail: ${FIXTURE_EMAIL}` },
    { ...base, email: FIXTURE_EMAIL },
    { ...base, phone: FIXTURE_PHONE },
    { ...base, mynumber: FIXTURE_ID },
  ];
  for (const input of placements) {
    const result = createRecord([], input, { now: t0 });
    assert.ok(result.problems?.includes("pii-prohibited"), `expected pii-prohibited for keys ${Object.keys(input)}`);
    assert.equal(result.record, undefined, "no record may be produced from fixture PII");
    for (const fixture of [FIXTURE_EMAIL, FIXTURE_PHONE, FIXTURE_ID]) {
      assert.ok(!JSON.stringify(result).includes(fixture), "diagnostics must not echo the fixture value");
    }
  }
});

test("an amendment carrying fixture PII is rejected and the original is untouched", () => {
  const { record } = createRecord([], base, { now: t0 });
  const result = amendRecord(record, { note: FIXTURE_PHONE }, { now: t0 });
  assert.ok(result.problems?.includes("pii-prohibited"));
  assert.equal(result.record, undefined);
  assert.equal(record.data.note, "");
  assert.deepEqual(recordProblems(record), []);
});

test("a natural-person lookup owner is masked, never stored by name", () => {
  const { record, problems } = createRecord([], {
    ...base,
    references: [{
      source: "wikidata", item: "Q100", label: "Fixture Building",
      owners: [
        { id: "Q999", label: FIXTURE_PERSON, person: true },
        { id: "Q200", label: "株式会社フィクスチャ", person: false },
      ],
      retrievedAt: t0,
    }],
  }, { now: t0 });
  assert.equal(problems, undefined);
  assert.deepEqual(record.data.references[0].owners, [
    { id: "", label: "個人", person: true },
    { id: "Q200", label: "株式会社フィクスチャ", person: false },
  ]);
  const serialized = JSON.stringify(record);
  assert.ok(!serialized.includes(FIXTURE_PERSON), "person name must not persist");
  assert.ok(!serialized.includes("Q999"), "person identifier must not persist");
  assert.deepEqual(recordProblems(record), []);
});

test("a stored record tampered to contain fixture PII is refused on load", () => {
  const { record } = createRecord([], base, { now: t0 });
  const tamperedData = { ...record.data, note: FIXTURE_EMAIL };
  const tampered = {
    ...record, data: tamperedData,
    history: [{ ...record.history[0], data: tamperedData }],
  };
  assert.ok(recordProblems(tampered).includes("pii-prohibited"));
});

test("store.js refuses fixture PII and it never round-trips back out", async () => {
  const idb = fakeIndexedDB();
  const store = openStore(idb);
  const { record } = createRecord([], base, { now: t0 });

  assert.equal(await store.set("records", [record]), true, "clean record persists (control)");
  assert.deepEqual(await store.get("records"), [record]);

  for (const value of [
    [{ data: { note: FIXTURE_EMAIL } }],
    [{ holder: FIXTURE_PHONE }],
    [{ identifier: FIXTURE_ID }],
    { email: FIXTURE_EMAIL },
  ]) {
    assert.equal(await store.set("pii-attempt", value), false, "store must refuse fixture PII");
    assert.equal(await store.get("pii-attempt"), null, "refused value must not round-trip");
  }
  const persisted = JSON.stringify([...idb.data.values()]);
  for (const fixture of [FIXTURE_EMAIL, FIXTURE_PHONE, FIXTURE_ID, FIXTURE_PERSON]) {
    assert.ok(!persisted.includes(fixture), `fixture ${fixture} must never persist in store.js`);
  }
  assert.ok(storePiiFindings({ note: FIXTURE_EMAIL }).length > 0);
  assert.ok(!storePiiFindings({ note: FIXTURE_EMAIL }).join(" ").includes(FIXTURE_EMAIL), "findings must not leak the value");
});
