import type { ProjectTimeline, ProjectTimelineAudio, ProjectTimelineClip } from '@shared/index.js';

/**
 * Carrying editor drafts out of the browser and into the library, once.
 *
 * Until 2.0 a named draft existed twice: as a record in the renderer's
 * `FilmpjeEditorDrafts` IndexedDB store, and as a row in `project`. The local
 * record was written first and the row was mirrored after it, each on its own
 * `try`, so a failed mirror left two copies of one draft with no rule for
 * deciding between them. `loadDrafts` then merged the two lists by `serverId`
 * and showed whichever it happened to read, which is the defect 3.2 describes.
 *
 * `project` is now the only store for a named draft, and this module is the
 * decision that gets the old local records there. It is separate from the
 * action that performs it, and pure, because the interesting part is not the
 * writing: it is what to do about a local record whose row is newer, whose row
 * is gone, or which never had a row at all. Each of those is somebody's
 * unsaved work, and getting one wrong loses it.
 *
 * Nothing here reads a database or a browser store. The renderer hands over
 * what IndexedDB holds, `ImportEditorDraftsAction` hands over what `project`
 * holds, and this says what should happen to each.
 */

/**
 * Keep one timeline from growing without limit; a draft is small by nature.
 *
 * Measured in UTF-16 units rather than bytes, which is what `String.length`
 * gives and what this has always compared. A timeline is clip ids and numbers,
 * so the two only diverge on a track filename with non-ASCII in it.
 */
export const MAX_TIMELINE_UNITS = 2 * 1024 * 1024;

/** A record the renderer found in IndexedDB and wants carried over. */
export interface IncomingDraft {
  /** The IndexedDB key, so a result can be matched back to the record. */
  localId: string;
  name: string;
  /** ISO 8601, as the local store wrote it. */
  updatedAt: string;
  /**
   * The row this record was mirroring, if it ever reached the library.
   *
   * Absent on a draft that was imported from a file, which never pushed one,
   * and on a draft whose `createProject` failed at the moment it was saved.
   */
  projectId?: number | null;
  clips: ProjectTimelineClip[];
  audio: ProjectTimelineAudio[];
}

/** Just enough of a `project` row to decide against it. */
export interface StoredDraftStamp {
  id: number;
  /** ISO 8601. */
  updatedAt: string;
}

export type DraftSkipReason = 'empty' | 'too-large';

export type DraftImportStep =
  /** No row for this record, so it becomes one. */
  | {
      step: 'create';
      localId: string;
      name: string;
      updatedAt: string;
      timeline: ProjectTimeline;
    }
  /** The row exists and the local record is newer, so the row takes its timeline. */
  | {
      step: 'overwrite';
      localId: string;
      projectId: number;
      name: string;
      updatedAt: string;
      timeline: ProjectTimeline;
    }
  /** The row exists and is at least as new, so the local record is a stale mirror. */
  | { step: 'keep'; localId: string; projectId: number }
  /** Nothing worth carrying, or too big to hold. The local record is left alone. */
  | { step: 'skip'; localId: string; reason: DraftSkipReason };

/**
 * Whether `candidate` is strictly newer than `against`.
 *
 * An unparseable stamp never wins. A local record's `updatedAt` is written by
 * the renderer and a row's by TypeORM, so both are normally ISO 8601 and either
 * a string or a numeric comparison would do; the store has no schema, though,
 * so a record written by hand or by a much older build can carry anything, and
 * `'not a date' > '2025-08-14...'` is true as a string. Overwriting a library
 * row on the strength of that would lose the row's timeline.
 */
export function isNewer(candidate: string | undefined | null, against: string): boolean {
  const mine = Date.parse(candidate ?? '');
  if (Number.isNaN(mine)) return false;

  const theirs = Date.parse(against);
  if (Number.isNaN(theirs)) return true;

  return mine > theirs;
}

/**
 * The instant, in the format TypeORM's SQLite driver reads back.
 *
 * A migrated draft has to keep the date it was last touched, for the same
 * reason a trim keeps the recording's own date: `updatedAt` is what the drafts
 * list sorts and prints, so taking the moment of the upgrade instead would
 * move a draft from August into today and read "just now" about work months
 * old. TypeORM sets `@UpdateDateColumn` to `new Date()` on every `save`
 * unconditionally (`SubjectExecutor`), so the only way to keep the real stamp
 * is to write the column afterwards, and that means writing it in the driver's
 * own storage format: UTC, a space rather than a `T`, three decimal places and
 * no zone suffix. `AbstractSqliteDriver.prepareHydratedValue` puts the `T` and
 * the `Z` back on the way out, so anything else round-trips as an invalid date.
 */
export function toSqliteUtc(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').replace('Z', '');
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * What a request body is allowed to be taken as.
 *
 * The body arrives over a named pipe from this app's own renderer, and is
 * still read rather than trusted: `clips` as a string would pass the emptiness
 * check on `String.length` and land in the column as a timeline no editor can
 * open. A record with no `localId` is dropped outright, because the renderer
 * identifies its local records by that and cannot be told what happened to one
 * without it.
 */
export function readIncomingDrafts(value: unknown): IncomingDraft[] {
  return asArray<Record<string, unknown>>(value).flatMap((raw) => {
    const entry = raw ?? {};
    const localId = typeof entry.localId === 'string' ? entry.localId : '';
    if (!localId) return [];

    const projectId = Number(entry.projectId);

    return [
      {
        localId,
        name: typeof entry.name === 'string' ? entry.name : '',
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
        projectId: Number.isInteger(projectId) && projectId > 0 ? projectId : null,
        clips: asArray<ProjectTimelineClip>(entry.clips),
        audio: asArray<ProjectTimelineAudio>(entry.audio),
      },
    ];
  });
}

/**
 * What to do with each local record, given what the library already holds.
 *
 * The order of the rules is the order of how much there is to lose:
 *
 * - **Empty** carries nothing. `canSave` in the drafts dialog is false on an
 *   empty timeline and `parseDraftFile` refuses an empty file, so this should
 *   not exist; the store has no schema, and a record written by an older build
 *   is not worth making a project out of.
 * - **Too large** cannot be stored as one column and is left where it is,
 *   rather than dropped. The local record stays readable, which is the only
 *   copy there is.
 * - **A row that exists and is at least as new** means the local record is the
 *   mirror working as intended. Nothing moves.
 * - **A row that exists and is older** is the divergence 3.2 is about: the
 *   local write succeeded and the mirror did not. The local timeline wins, and
 *   its name with it, because half a record winning is not a rule.
 * - **Anything else becomes a row.** That covers a draft imported from a file,
 *   which never pushed one at all, and a `projectId` pointing at a row that is
 *   gone, whether deleted from the library or absent from a restored backup
 *   taken before the draft was saved. Creating a second copy of a draft
 *   somebody deleted is a mess they can fix in one click; losing the only copy
 *   of a timeline they spent an evening on is not.
 */
export function planDraftImport(
  incoming: readonly IncomingDraft[],
  stored: readonly StoredDraftStamp[],
): DraftImportStep[] {
  const rows = new Map(stored.map((row) => [row.id, row]));

  /*
   * Two local records naming the same row cannot happen through any path the
   * app has: `serverId` was written once, from the id the library gave back.
   * It costs one pass to be sure, though, and the alternative is two
   * overwrites of one row where the loser's timeline disappears. The newest
   * takes the row; the rest are created beside it, so both survive and the
   * person can delete the one they do not want.
   */
  const claimed = new Map<number, IncomingDraft>();
  for (const draft of incoming) {
    const id = draft.projectId;
    if (typeof id !== 'number' || !rows.has(id)) continue;

    const held = claimed.get(id);
    if (!held || isNewer(draft.updatedAt, held.updatedAt)) claimed.set(id, draft);
  }

  return incoming.map((draft): DraftImportStep => {
    const timeline: ProjectTimeline = {
      clips: asArray<ProjectTimelineClip>(draft.clips),
      audio: asArray<ProjectTimelineAudio>(draft.audio),
    };

    if (timeline.clips.length === 0 && timeline.audio.length === 0) {
      return { step: 'skip', localId: draft.localId, reason: 'empty' };
    }

    if (JSON.stringify(timeline).length > MAX_TIMELINE_UNITS) {
      return { step: 'skip', localId: draft.localId, reason: 'too-large' };
    }

    const name = draft.name?.trim() || 'Untitled draft';
    const id = draft.projectId;
    const row = typeof id === 'number' ? rows.get(id) : undefined;

    if (row && claimed.get(row.id) === draft) {
      return isNewer(draft.updatedAt, row.updatedAt)
        ? {
            step: 'overwrite',
            localId: draft.localId,
            projectId: row.id,
            name,
            updatedAt: draft.updatedAt,
            timeline,
          }
        : { step: 'keep', localId: draft.localId, projectId: row.id };
    }

    return { step: 'create', localId: draft.localId, name, updatedAt: draft.updatedAt, timeline };
  });
}
