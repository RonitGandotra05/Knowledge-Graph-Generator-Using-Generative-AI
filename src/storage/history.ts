import type { Analysis } from "../types";
const dbName = "evidence-atlas";
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 2);
    r.onupgradeneeded = () => {
      for (const name of ["analyses", "drafts"])
        if (!r.result.objectStoreNames.contains(name))
          r.result.createObjectStore(name, { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () =>
      reject(
        new Error(
          "Local history is unavailable. Export JSON to keep your graph.",
        ),
      );
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("analyses", mode),
      req = operation(tx.objectStore("analyses"));
    let result: T;
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Unable to save local history. Storage may be full or disabled. Export JSON to keep this graph.",
        ),
      );
    };
  });
}
export const history = {
  list: async () =>
    ((await transaction("readonly", (s) => s.getAll())) as Analysis[]).sort(
      (a, b) => b.createdAt.localeCompare(a.createdAt),
    ),
  save: (a: Analysis) => transaction("readwrite", (s) => s.put(a)),
  remove: (id: string) => transaction("readwrite", (s) => s.delete(id)),
  clear: () => transaction("readwrite", (s) => s.clear()),
};
const prefix = "evidence-atlas-key:";
// Migration only: remove keys remembered by older versions without reading them.
export function clearLegacyKeys() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith(prefix)) localStorage.removeItem(key);
  } catch {
    /* This version never reads or writes stored credentials. */
  }
}
