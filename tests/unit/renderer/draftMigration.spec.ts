// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasMigratedLocalDrafts,
  localIdsToDrop,
  markLocalDraftsMigrated,
  toImportEntries,
} from '../../../src/renderer/src/utils/draftMigration';
import type { StoredDraftRecord } from '../../../src/renderer/src/services/editorDraftsDb';
import type { DraftClip, DraftImportResult } from '../../../src/renderer/src/types/editor';

/**
 * The renderer's half of the first-run draft migration.
 *
 * Only the renderer can read a browser store, so the reading is here and the
 * deciding is in `main/services/editorDrafts.ts`. What is left to get wrong on
 * this side is which records get handed over at all, and which local copies
 * get deleted afterwards. The second one is the dangerous half: a delete that
 * runs ahead of the library confirming it holds the draft is the one mistake
 * in this whole item that cannot be undone.
 *
 * `happy-dom` is here only for `localStorage`, which holds the marker.
 */

const clip: DraftClip = {
  clipId: 7,
  startTime: 0,
  duration: 8.3,
  trimStart: 4.5,
  trimEnd: 12.8,
  originalDuration: 30,
  volume: 1,
  muted: false,
};

function record(over: Partial<StoredDraftRecord> = {}): StoredDraftRecord {
  return {
    id: 'a31f',
    name: 'Montage',
    updatedAt: '2025-08-14T09:00:00.000Z',
    clips: [clip],
    audio: [],
    ...over,
  };
}

describe('which local records are handed over', () => {
  it('leaves the scratch record where it is', () => {
    // It is the one thing this store still keeps, and it is not a draft.
    expect(toImportEntries([record({ id: '__autosave__' })])).toEqual([]);
  });

  it('reads 1.x s `serverId` as the row the record was mirroring', () => {
    // The only link between the two copies of a draft, and the only thing that
    // stops a mirrored record being copied in beside the row it came from.
    expect(toImportEntries([record({ serverId: 41 })])[0].projectId).toBe(41);
  });

  it('hands over a record that never had a row, with no row named', () => {
    expect(toImportEntries([record()])[0]).toEqual({
      localId: 'a31f',
      name: 'Montage',
      updatedAt: '2025-08-14T09:00:00.000Z',
      projectId: null,
      clips: [clip],
      audio: [],
    });
  });

  it('does not hand over, or delete, a record holding nothing', () => {
    /*
     * Nothing in it to carry and nothing in it to lose. It is never sent, so
     * it never appears in a result, so `localIdsToDrop` never names it: it
     * stays in the store, inert. That is a better outcome than a delete this
     * migration did not have to make.
     */
    const entries = toImportEntries([record({ clips: [], audio: [] })]);

    expect(entries).toEqual([]);
    expect(localIdsToDrop([])).toEqual([]);
  });

  it('reads a record written by something that got the shape wrong', () => {
    const [entry] = toImportEntries([
      { id: 'a31f', clips: [clip], audio: undefined, name: '   ', updatedAt: undefined },
    ]);

    expect(entry).toMatchObject({ name: 'Untitled draft', updatedAt: '', audio: [] });
  });

  it('refuses a row id that could not be one', () => {
    for (const serverId of [0, -1, 1.5] as number[]) {
      expect(toImportEntries([record({ serverId })])[0].projectId).toBeNull();
    }
  });
});

describe('which local copies are safe to delete', () => {
  it('drops everything the library has accounted for', () => {
    const results: DraftImportResult[] = [
      { localId: 'created', outcome: 'created', projectId: 51 },
      { localId: 'updated', outcome: 'updated', projectId: 42 },
      { localId: 'kept', outcome: 'kept', projectId: 41 },
    ];

    expect(localIdsToDrop(results)).toEqual(['created', 'updated', 'kept']);
  });

  it('keeps one the library declined, because it is then the only copy', () => {
    const results: DraftImportResult[] = [
      { localId: 'huge', outcome: 'skipped', reason: 'too-large' },
      { localId: 'fine', outcome: 'created', projectId: 51 },
    ];

    expect(localIdsToDrop(results)).toEqual(['fine']);
  });
});

describe('the marker that stops a second pass', () => {
  beforeEach(() => localStorage.clear());

  it('is unset until it is set', () => {
    expect(hasMigratedLocalDrafts()).toBe(false);
    markLocalDraftsMigrated();
    expect(hasMigratedLocalDrafts()).toBe(true);
  });

  it('lives in the same profile as the store it describes', () => {
    /*
     * Not in `settings.json` and not in the library, deliberately. It is a
     * statement about this browser profile's IndexedDB, so if the profile is
     * cleared the marker goes with the records it was about, which is exactly
     * right: there is then nothing left to migrate and nothing claiming there
     * was.
     */
    markLocalDraftsMigrated();
    expect(localStorage.getItem('goodbit-editor-drafts-migrated')).toBe('1');
  });

  it('reads as unset rather than done when storage cannot be reached', () => {
    // Concluding "done" when it is not would strand every record in the store.
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };

    try {
      expect(hasMigratedLocalDrafts()).toBe(false);
    } finally {
      Storage.prototype.getItem = getItem;
    }
  });
});
