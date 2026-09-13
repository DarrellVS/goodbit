/*
 * Rescue everything Filmpje keeps in the browser, as one JSON file.
 *
 * Electron gets its own profile, so none of this travels with the database when
 * the app moves to the desktop. Run this now and the data is safe regardless of
 * when the SQLite migration lands.
 *
 * HOW: open Filmpje, press F12, Console tab, paste the whole file, Enter.
 *      A .json file downloads.
 *
 * IMPORTANT: IndexedDB is per origin. If you use Filmpje at more than one
 * address — the public HTTPS one and http://192.168.178.28:4000, say — each has
 * its own separate storage. Run this on every address you have actually used
 * and keep both files; the tag patterns may only exist on one of them.
 */
(async () => {
  const out = {
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    indexedDb: {},
    localStorage: {},
  };

  const readStore = (dbName, storeName) =>
    new Promise((resolve) => {
      // Not passing a version: opening with the wrong one would trigger an
      // upgrade, and this must never write.
      const request = indexedDB.open(dbName);
      request.onerror = () => resolve({ error: String(request.error) });
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.close();
          return resolve({ error: `no store "${storeName}"` });
        }
        const all = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        all.onsuccess = () => {
          db.close();
          resolve({ rows: all.result });
        };
        all.onerror = () => {
          db.close();
          resolve({ error: String(all.error) });
        };
      };
    });

  // The two stores the app writes. Patterns hold their regexes as plain
  // strings here, which is exactly what an importer wants.
  out.indexedDb.tagPatterns = await readStore('FilmpjeTagPatterns', 'patterns');
  out.indexedDb.editorDrafts = await readStore('FilmpjeEditorDrafts', 'drafts');

  // Anything else this origin happens to hold, so nothing is missed.
  if (indexedDB.databases) {
    out.indexedDb._databasesPresent = (await indexedDB.databases()).map((d) => d.name);
  }

  // Settings, theme, shortcut customisations.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    out.localStorage[key] = localStorage.getItem(key);
  }

  const patterns = out.indexedDb.tagPatterns.rows?.length ?? 0;
  const drafts = out.indexedDb.editorDrafts.rows?.length ?? 0;
  console.log(
    `%cFilmpje export — ${patterns} tag pattern(s), ${drafts} draft(s), ` +
      `${Object.keys(out.localStorage).length} setting key(s)`,
    'font-weight:bold',
  );
  console.log(out);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const host = location.hostname.replace(/[^a-z0-9]/gi, '-');
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `filmpje-browser-data-${host}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
})();
