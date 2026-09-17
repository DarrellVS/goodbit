import { AUTOSAVE_ID, type StoredDraftRecord } from '@renderer/services/editorDraftsDb';
import type { DraftAudio, DraftClip, DraftImportEntry, DraftImportResult } from '@renderer/types/editor';

/**
 * The renderer's half of the 2.0 first-run draft migration.
 *
 * Named drafts have moved into the library, so whatever 1.x left in IndexedDB
 * has to get there. Only the renderer can read a browser store, so the reading
 * is here and the deciding is in `main/services/editorDrafts.ts`: what happens
 * to a record whose row is newer, whose row is gone, or which never had one is
 * the part worth testing, and it needs the rows to decide against.
 *
 * This module is the two ends of that: which records are worth handing over,
 * and which local copies are safe to delete afterwards.
 */

/** Set once the library has confirmed it holds everything this store had. */
const MIGRATED_KEY = 'goodbit-editor-drafts-migrated';

/**
 * Which records to hand over.
 *
 * The scratch record stays: it is the only thing this store keeps now. A
 * record holding neither a clip nor a track is not handed over and not
 * deleted either, because there is nothing in it to carry and nothing in it to
 * lose; it sits in the store inert, which is a better outcome than a delete
 * this migration did not have to make.
 *
 * `serverId` is 1.x's name for the row a named draft was mirrored into, and is
 * the only link between the two copies. Everything else is read defensively:
 * the store has no schema, and this is the one pass that will ever look at
 * these records.
 */
export function toImportEntries(records: readonly StoredDraftRecord[]): DraftImportEntry[] {
  return records.flatMap((record) => {
    if (!record || record.id === AUTOSAVE_ID || typeof record.id !== 'string') return [];

    const clips: DraftClip[] = Array.isArray(record.clips) ? record.clips : [];
    const audio: DraftAudio[] = Array.isArray(record.audio) ? record.audio : [];
    if (clips.length === 0 && audio.length === 0) return [];

    const mirrored = Number(record.serverId ?? record.projectId);

    return [
      {
        localId: record.id,
        name: record.name?.trim() || 'Untitled draft',
        updatedAt: record.updatedAt ?? '',
        projectId: Number.isInteger(mirrored) && mirrored > 0 ? mirrored : null,
        clips,
        audio,
      },
    ];
  });
}

/**
 * The local records the library has accounted for, so deleting them loses
 * nothing.
 *
 * `created` and `updated` mean the timeline is now in a row; `kept` means it
 * already was, in a row at least as new, so the local copy was the stale half
 * of the mirror. `skipped` means the library declined it, which today is only
 * a timeline too large for one column, and that record stays exactly where it
 * is: it is then the only copy there is.
 */
export function localIdsToDrop(results: readonly DraftImportResult[]): string[] {
  return results.filter((result) => result.outcome !== 'skipped').map((result) => result.localId);
}

export function hasMigratedLocalDrafts(): boolean {
  try {
    return localStorage.getItem(MIGRATED_KEY) === '1';
  } catch {
    // Storage can be unavailable. Reading the old store again and finding
    // nothing to move is cheap; concluding it was done when it was not is not.
    return false;
  }
}

export function markLocalDraftsMigrated(): void {
  try {
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    /*
     * The marker is the only thing that stops a second pass, so losing it
     * matters, and it is still not worth throwing over.
     *
     * A record that was mirrored carries the row's id, and the library's own
     * `keep` rule recognises it, so that half cannot be moved twice. A record
     * that was never mirrored has no link to the row made from it, so a second
     * pass would create a second copy of it. That is the direction this is
     * built to fail in: a duplicate draft is one click to delete, and the
     * alternative ways of closing the hole all risk not carrying something
     * over at all.
     *
     * In practice the delete below removes the record, so the second pass has
     * nothing to find either way. This is the case where both the marker and
     * the delete are lost.
     */
  }
}
