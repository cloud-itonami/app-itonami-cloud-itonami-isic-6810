// Local state in IndexedDB (declared in descriptor.json as local-state).
// Every call fails soft: without storage nothing can be kept, and the app says so instead of
// pretending a record was saved.
const DB = "itonami.registry.v1";
const STORE = "kv";

// --- PII boundary (ZB20-SG01; see docs/pii-boundary.md) -------------------
// Defense in depth under records.js: even a caller that bypasses record
// validation cannot persist owner/tenant contact details or government
// identifiers through this store. Findings name only kind + path, never
// the value itself.
const PII_PATTERNS = [
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ["phone", /(?:\+[0-9]{1,3}[- ]?)?(?:0[789]0[- ]?\d{4}[- ]?\d{4}|\b0\d{10}\b)/],
  ["identifier", /\b\d{4}[- ]\d{4}[- ]\d{4}\b|\b\d{12}\b/],
];
const PROHIBITED_KEYS = new Set([
  "email", "e-mail", "phone", "telephone", "tel", "mobile", "fax",
  "mynumber", "my-number", "ssn", "social-security", "passport",
  "bank-account", "credit-card", "card-number", "date-of-birth", "dob",
]);

/** Deep-scan a value for prohibited keys / PII patterns. Returns ["path:kind"]. */
export function piiFindings(value, path = "value", out = []) {
  if (typeof value === "string") {
    for (const [kind, re] of PII_PATTERNS) if (re.test(value)) { out.push(`${path}:${kind}`); break; }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => piiFindings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (PROHIBITED_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined && String(v).trim() !== "") out.push(`${path}.${k}:prohibited-key`);
      piiFindings(v, `${path}.${k}`, out);
    }
  }
  return out;
}

export function openStore(indexedDB = globalThis.indexedDB) {
  let dbPromise = null;
  const db = () => {
    if (!indexedDB) return Promise.reject(new Error("IndexedDB unavailable"));
    dbPromise ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  };
  const run = async (mode, fn) => {
    const handle = await db();
    return new Promise((resolve, reject) => {
      const tx = handle.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  };
  return {
    async get(key) { try { return (await run("readonly", (s) => s.get(key))) ?? null; } catch { return null; } },
    async set(key, value) {
      // Fail closed: prohibited PII is never written, so it can never
      // round-trip back out of this store unredacted.
      if (piiFindings(value).length) return false;
      try { await run("readwrite", (s) => s.put(value, key)); return true; } catch { return false; }
    },
    async delete(key) { try { await run("readwrite", (s) => s.delete(key)); return true; } catch { return false; } },
  };
}
