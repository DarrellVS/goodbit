import type { TagPattern } from '../utils/tagSuggestions';

// The web app's store, read once so its rules can be lifted into the library
// database. Nothing is written here any more — see `useTagPatterns`.
const DB_NAME = 'FilmpjeTagPatterns';
const DB_VERSION = 1;
const STORE_NAME = 'patterns';

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
        database.createObjectStore(STORE_NAME, { keyPath: 'tag' });
      }
    };
  });
}

export async function getAllPatterns(): Promise<TagPattern[]> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const patterns = request.result.map((p: any) => ({
        ...p,
        patterns: p.patterns.map((pattern: string) => new RegExp(pattern, 'i')),
      }));
      resolve(patterns);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function savePattern(pattern: TagPattern): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const serializedPattern = {
      ...pattern,
      patterns: pattern.patterns.map(p => p.source),
    };
    
    const request = store.put(serializedPattern);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deletePattern(tag: string): Promise<void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(tag);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function initializeDefaultPatterns(defaultPatterns: TagPattern[]): Promise<void> {
  const existing = await getAllPatterns();
  if (existing.length === 0) {
    await Promise.all(defaultPatterns.map(savePattern));
  }
}

