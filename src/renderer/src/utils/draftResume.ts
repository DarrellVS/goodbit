import type { StoredDraftRecord } from '../services/editorDraftsDb';
import type { DraftAudio, DraftClip, EditorDraft, ResumableDraft } from '../types/editor';

/**
 * What the resume banner offers when the editor opens.
 *
 * Two stores meet here, and this is the only place they do, so this is where
 * item 3.2's missing conflict rule lives. The library holds every named draft;
 * IndexedDB holds one scratch record of what this window was last doing. They
 * describe the same work whenever a named draft was open, so they have to be
 * resolved into one offer rather than both being shown or one being guessed
 * at.
 *
 * The rule, and why each branch is the way round it is:
 *
 * - **No scratch record, or an empty one: nothing to offer.** The banner
 *   answers "you were in the middle of something", and the library list
 *   answers "what have I kept". A draft saved and closed weeks ago is in the
 *   list; shoving it in front of somebody who has just opened the editor to
 *   start something new is not resuming, it is nagging.
 * - **A scratch record belonging to no draft is offered as itself.** That is
 *   the unnamed timeline somebody was building.
 * - **A scratch record belonging to a draft is offered as that draft**, by
 *   name, with whichever of the two timelines is newer. `persist` writes the
 *   scratch copy first and the row second, so the row is normally the newer of
 *   the two and wins; the scratch copy only wins when the write to the library
 *   failed, which is precisely the divergence that used to go unnoticed.
 * - **A scratch record whose draft is gone is offered unnamed.** The draft was
 *   deleted while the editor was closed, or the library was restored from a
 *   backup older than it. The timeline is still real work, so it is still
 *   offered; calling it by the name of something that no longer exists would
 *   be a lie, and reattaching to a row that is not there would fail on the
 *   next autosave.
 */
export function pickResumable(
  autosave: StoredDraftRecord | null,
  drafts: readonly EditorDraft[],
): ResumableDraft | null {
  if (!autosave) return null;

  const clips: DraftClip[] = Array.isArray(autosave.clips) ? autosave.clips : [];
  const audio: DraftAudio[] = Array.isArray(autosave.audio) ? autosave.audio : [];
  if (clips.length === 0 && audio.length === 0) return null;

  const updatedAt = autosave.updatedAt ?? '';
  const scratch: ResumableDraft = { projectId: null, name: 'Autosave', updatedAt, clips, audio };

  const owner =
    typeof autosave.projectId === 'number'
      ? (drafts.find((draft) => draft.id === autosave.projectId) ?? null)
      : null;

  if (!owner) return scratch;

  return isNewer(updatedAt, owner.updatedAt)
    ? { ...scratch, projectId: owner.id, name: owner.name }
    : {
        projectId: owner.id,
        name: owner.name,
        updatedAt: owner.updatedAt,
        clips: owner.clips,
        audio: owner.audio,
      };
}

/**
 * Whether one stamp is strictly newer than another.
 *
 * Parsed rather than compared as text. Both sides are normally ISO 8601, one
 * written by this process and one by TypeORM, but the local store has no
 * schema and a record written by an older build can carry anything; as a
 * string, `'yesterday' > '2025-08-14T...'`, which would offer a stale scratch
 * copy over the saved draft it belongs to. A stamp that will not parse never
 * wins.
 */
function isNewer(candidate: string, against: string): boolean {
  const mine = Date.parse(candidate);
  if (Number.isNaN(mine)) return false;

  const theirs = Date.parse(against);
  if (Number.isNaN(theirs)) return true;

  return mine > theirs;
}

/** A listed draft, as the thing the timeline gets rebuilt from. */
export function draftAsResumable(draft: EditorDraft): ResumableDraft {
  return {
    projectId: draft.id,
    name: draft.name,
    updatedAt: draft.updatedAt,
    clips: draft.clips,
    audio: draft.audio,
  };
}
