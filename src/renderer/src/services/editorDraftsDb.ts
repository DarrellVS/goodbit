import type { DraftAudio, DraftClip } from '../types/editor';

/**
 * The editor's local scratch timeline, in IndexedDB.
 *
 * **This is no longer where a draft lives.** Until 2.0 a named draft was
 * written here and then mirrored into the library's `project` table, each on
 * its own `try`, which left two copies of one draft and no rule for choosing
 * between them. A named draft is now a row and only a row: it is the copy that
 * gets backed up, that a restore can put back, and that survives the Electron
 * profile being cleared.
 *
 * What is left here is one record, `__autosave__`, and the line is worth
 * stating because it is the whole of item 3.2:
 *
 * - A **named draft** is something somebody decided to keep. That is metadata
 *   about clips already on disk, so it belongs in the database, which is where
 *   metadata belongs and what gets backed up.
 * - The **scratch timeline** is what this window was doing when it closed. It
 *   is rewritten on an 800 ms debounce for as long as the editor is open and
 *   regenerated from nothing, so a backup carrying it is carrying noise, and
 *   the question it answers is about this profile rather than about the
 *   library. Storing it as a row would need a row that is not a project: no
 *   name anybody chose, hidden from the list, never exported, never archived.
 *   That is a schema change to hold the one thing in the system that is
 *   explicitly disposable.
 *
 * The two cannot disagree, because they no longer hold the same thing. Where
 * they overlap is one question, "what should the resume banner offer", and
 * `utils/draftResume.ts` answers it with one rule in one place.
 *
 * What is stored is only what cannot be re-derived: clip ids, track filenames
 * and the edits. Media URLs are deliberately left out, they are rebuilt when a
 * timeline is restored.
 */

// Named for what the app used to be called. Renaming the store would orphan
// every record already in it, which is a worse trade than an untidy name, and
// the 2.0 migration below has to be able to read exactly what 1.x wrote.
const DB_NAME = 'FilmpjeEditorDrafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

/** The one record this store still keeps. */
export const AUTOSAVE_ID = '__autosave__';

/**
 * A record as this store may hold it, across every version that wrote to it.
 *
 * The store has no schema, so everything beyond the key is optional and gets
 * read rather than trusted. `serverId` is what 1.x called the row a named
 * draft mirrored, and is read only by the migration; `projectId` is what the
 * scratch record calls the named draft it currently belongs to.
 */
export interface StoredDraftRecord {
  id: string;
  name?: string;
  updatedAt?: string;
  clips?: DraftClip[];
  audio?: DraftAudio[];
  /** 1.x, on a named draft: the `project` row it was mirrored into. */
  serverId?: number;
  /** 2.0, on the scratch record: the named draft it is a scratch copy of. */
  projectId?: number | null;
}

let db: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = run(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function readAutosave(): Promise<StoredDraftRecord | null> {
  return (await transact<StoredDraftRecord>('readonly', (store) => store.get(AUTOSAVE_ID))) ?? null;
}

export async function writeAutosave(record: StoredDraftRecord): Promise<void> {
  await transact('readwrite', (store) => store.put({ ...record, id: AUTOSAVE_ID }));
}

export async function clearAutosave(): Promise<void> {
  await transact('readwrite', (store) => store.delete(AUTOSAVE_ID));
}

/**
 * Everything in the store, for the one-shot 2.0 migration and nothing else.
 *
 * Kept separate from `readAutosave` so the only caller that sees a named
 * draft's local record is the code whose job is to get rid of it.
 */
export async function readStoredDrafts(): Promise<StoredDraftRecord[]> {
  return (await transact<StoredDraftRecord[]>('readonly', (store) => store.getAll())) ?? [];
}

/** Drop one migrated record, once the library has confirmed it holds it. */
export async function deleteStoredDraft(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id));
}
