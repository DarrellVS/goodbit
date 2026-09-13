/**
 * Editor drafts, stored in IndexedDB.
 *
 * The timeline is not a server-side concept — nothing exists until an export
 * writes a file — so "continue later" is purely a client concern. IndexedDB
 * rather than localStorage: a draft is structured data, there can be several of
 * them, and the autosave writes on every timeline change.
 *
 * What is stored is only what cannot be re-derived: clip ids, track filenames,
 * and the edits made to them. Media URLs are deliberately left out — they carry
 * an auth token that expires and a LAN host that changes — and are rebuilt when
 * a draft is restored.
 */

const DB_NAME = 'FilmpjeEditorDrafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

/** Reserved id for the rolling autosave, so it never collides with a named draft. */
export const AUTOSAVE_ID = '__autosave__';

export interface EditorDraftClip {
  clipId: number;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
  volume: number;
  muted: boolean;
}

export interface EditorDraftAudio {
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  originalDuration: number;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
}

export interface EditorDraft {
  id: string;
  name: string;
  updatedAt: string;
  clips: EditorDraftClip[];
  audio: EditorDraftAudio[];
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

export async function listDrafts(): Promise<EditorDraft[]> {
  const database = await openDb();

  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      const drafts = request.result as EditorDraft[];
      drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(drafts);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getDraft(id: string): Promise<EditorDraft | null> {
  const database = await openDb();

  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);

    request.onsuccess = () => resolve((request.result as EditorDraft) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function putDraft(draft: EditorDraft): Promise<void> {
  const database = await openDb();

  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(draft);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const database = await openDb();

  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
