// Local state in IndexedDB (declared in descriptor.json as local-state).
// Every call fails soft: without storage nothing can be kept, and the app says so instead of
// pretending a record was saved.
const DB = "itonami.registry.v1";
const STORE = "kv";

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
    async set(key, value) { try { await run("readwrite", (s) => s.put(value, key)); return true; } catch { return false; } },
    async delete(key) { try { await run("readwrite", (s) => s.delete(key)); return true; } catch { return false; } },
  };
}
