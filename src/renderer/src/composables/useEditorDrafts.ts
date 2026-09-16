import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  AUTOSAVE_ID,
  clearAutosave,
  deleteStoredDraft,
  readAutosave,
  readStoredDrafts,
  writeAutosave,
  type StoredDraftRecord,
} from '../services/editorDraftsDb';
import {
  createProject,
  deleteProject,
  importEditorDrafts,
  listProjects,
  updateProject,
  type Project,
  type ProjectTimeline,
} from '../services/projects';
import {
  hasMigratedLocalDrafts,
  localIdsToDrop,
  markLocalDraftsMigrated,
  toImportEntries,
} from '../utils/draftMigration';
import { pickResumable } from '../utils/draftResume';
import type {
  DraftAudio,
  DraftClip,
  EditorDraft,
  ResumableDraft,
  TimelineAudio,
  TimelineClip,
} from '../types/editor';

/** Writing on every drag frame would hammer both stores; a beat of quiet is enough. */
const AUTOSAVE_DEBOUNCE_MS = 800;

export interface ActiveDraft {
  /** The library row being edited. */
  id: number;
  name: string;
}

function toDraftClips(clips: readonly TimelineClip[]): DraftClip[] {
  return clips.map((clip) => ({
    clipId: clip.clipId,
    startTime: clip.startTime,
    duration: clip.duration,
    trimStart: clip.trimStart,
    trimEnd: clip.trimEnd,
    originalDuration: clip.originalDuration,
    volume: clip.volume,
    muted: clip.muted,
  }));
}

function toDraftAudio(audio: readonly TimelineAudio[]): DraftAudio[] {
  return audio.map((item) => ({
    trackId: item.trackId,
    name: item.name,
    startTime: item.startTime,
    duration: item.duration,
    trimStart: item.trimStart,
    trimEnd: item.trimEnd,
    originalDuration: item.originalDuration,
    volume: item.volume,
    muted: item.muted,
    fadeIn: item.fadeIn,
    fadeOut: item.fadeOut,
  }));
}

function toEditorDraft(project: Project): EditorDraft {
  return {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    clips: project.timeline.clips ?? [],
    audio: project.timeline.audio ?? [],
  };
}

/**
 * The editor's drafts, which are rows in the library and nothing else.
 *
 * 1.x kept a named draft in IndexedDB *and* mirrored it into `project`, each
 * write in its own `try`, and merged the two lists by `serverId` on load. A
 * failed mirror therefore left two copies of one draft with no rule for
 * deciding between them, and a delete had to reach both or the draft came
 * back. Item 3.2 of the 2.0 brainstorm is that defect.
 *
 * There is one store now. A named draft is a row: it is what gets backed up,
 * what a restore can put back, and what outlives the Electron profile.
 * IndexedDB keeps one scratch record of what this window was last doing, which
 * is a different question and is never listed as a draft. See
 * `services/editorDraftsDb.ts` for the line, and `utils/draftResume.ts` for
 * the single place the two meet.
 */
export function useEditorDrafts(
  clips: Ref<readonly TimelineClip[]>,
  audio: Ref<readonly TimelineAudio[]>,
) {
  const drafts = ref<EditorDraft[]>([]);
  /**
   * The draft being edited, if any. Autosave writes into that row instead of
   * the scratch record, so opening a draft and carrying on keeps updating
   * *that* draft rather than quietly forking a shadow copy of it.
   */
  const activeDraft = ref<ActiveDraft | null>(null);
  /** What the resume banner is offering, if anything. */
  const resumable = ref<ResumableDraft | null>(null);
  const saving = ref(false);
  /** How many drafts the one-shot migration actually moved, when it moved any. */
  const migrated = ref<number | null>(null);

  const isEmpty = computed(() => clips.value.length === 0 && audio.value.length === 0);

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let carryOver: Promise<void> | null = null;
  let loading: Promise<void> | null = null;

  function timelineNow(): ProjectTimeline {
    return { clips: toDraftClips(clips.value), audio: toDraftAudio(audio.value) };
  }

  /**
   * Move whatever the old local store still holds into the library, once.
   *
   * The order is deliberate and is the answer to "what happens on a second
   * launch": hand everything over, mark it done the moment the library has
   * confirmed it, and only then delete the local copies. A crash before the
   * mark means the next launch hands the same records over again, and the
   * library's own rules recognise the rows it made from the mirrored ones;
   * a crash after it leaves inert records in a store nothing reads again.
   * Marking it done *before* the library has confirmed anything is the one
   * ordering that could lose a draft, so it is the one not used.
   *
   * A failure to read the store or to reach the library leaves the marker
   * unset, so the next time the editor opens it tries again.
   */
  async function carryOverLocalDrafts(): Promise<void> {
    if (hasMigratedLocalDrafts()) return;

    let records: StoredDraftRecord[] = [];
    try {
      records = await readStoredDrafts();
    } catch (error) {
      console.error('Could not read the old editor draft store:', error);
      return;
    }

    const entries = toImportEntries(records);
    if (entries.length === 0) {
      markLocalDraftsMigrated();
      return;
    }

    try {
      const summary = await importEditorDrafts(entries);
      markLocalDraftsMigrated();

      for (const localId of localIdsToDrop(summary.results)) {
        try {
          await deleteStoredDraft(localId);
        } catch (error) {
          // The draft is in the library either way; this is tidying.
          console.error('Could not remove a migrated draft from the old store:', error);
        }
      }

      const moved = summary.created + summary.updated;
      if (moved > 0) migrated.value = moved;
    } catch (error) {
      console.error('Could not carry the old editor drafts into the library:', error);
    }
  }

  function localDraftsCarriedOver(): Promise<void> {
    return (carryOver ??= carryOverLocalDrafts());
  }

  /** Every named draft, which is every non-archived row. */
  async function loadDrafts(): Promise<void> {
    loading = (async () => {
      await localDraftsCarriedOver();
      try {
        drafts.value = (await listProjects()).map(toEditorDraft);
      } catch (error) {
        console.error('Failed to read saved drafts from the library:', error);
      }
    })();

    return loading;
  }

  /**
   * What to offer on open.
   *
   * Awaits the draft list rather than relying on the caller to have loaded it
   * first: the banner names the draft the scratch record belongs to, so it
   * cannot decide without the rows.
   */
  async function loadResumable(): Promise<void> {
    await (loading ?? loadDrafts());

    try {
      resumable.value = pickResumable(await readAutosave(), drafts.value);
    } catch (error) {
      console.error('Failed to read the editor autosave:', error);
    }
  }

  async function persist(): Promise<void> {
    const target = activeDraft.value;
    const updatedAt = new Date().toISOString();
    const timeline = timelineNow();

    /*
     * The scratch record first, and whether or not a draft is open.
     *
     * It is the net under the write below: it is local, so it cannot fail for
     * the reason a library write can, and it carries the id of the draft it
     * belongs to so the banner can offer that draft back by name. 1.x wrote
     * *either* the scratch record or the named one, which meant a named draft
     * whose library write failed had nothing holding it at all.
     */
    try {
      await writeAutosave({
        id: AUTOSAVE_ID,
        name: 'Autosave',
        updatedAt,
        projectId: target?.id ?? null,
        ...timeline,
      });
    } catch (error) {
      console.error('Failed to keep the local scratch timeline:', error);
    }

    if (!target) return;

    try {
      await updateProject(target.id, { timeline });
    } catch (error) {
      console.error('Could not update this draft in the library:', error);
      return;
    }

    // Keep the listed row honest without re-reading the library every beat.
    drafts.value = drafts.value.map((draft) =>
      draft.id === target.id ? { ...draft, ...timeline, updatedAt } : draft,
    );
  }

  function setActiveDraft(draft: { id: number; name: string } | null): void {
    activeDraft.value = draft ? { id: draft.id, name: draft.name } : null;
  }

  /** Stop tracking a draft; further edits go to the scratch record only. */
  function detachDraft(): void {
    activeDraft.value = null;
  }

  /**
   * Keep the current timeline as a named draft.
   *
   * This throws if the library will not take it, where 1.x logged and left a
   * local-only copy behind: a save that says it worked and only half did is
   * how the two stores came apart. Nothing is lost when it throws, because the
   * scratch record still holds the timeline; what is lost is the name.
   */
  async function saveNamed(name: string): Promise<void> {
    saving.value = true;

    try {
      const project = await createProject({
        name: name.trim() || 'Untitled draft',
        timeline: timelineNow(),
      });

      // Editing continues in the draft just saved, not in the scratch record.
      setActiveDraft(project);
      await loadDrafts();
    } finally {
      saving.value = false;
    }
  }

  /**
   * Keep a draft that came from a file as a draft of its own.
   *
   * 1.x wrote this one locally and never pushed it, so an imported draft was
   * the one kind that could not survive a cleared profile. It is a row like
   * any other now. The spread that used to be here was for IndexedDB, whose
   * `structuredClone` refuses a Vue proxy; JSON on the wire does not care.
   */
  async function importDraft(payload: {
    name: string;
    clips: DraftClip[];
    audio: DraftAudio[];
  }): Promise<EditorDraft> {
    const project = await createProject({
      name: payload.name.trim() || 'Imported draft',
      timeline: { clips: payload.clips, audio: payload.audio },
    });

    await loadDrafts();
    return toEditorDraft(project);
  }

  /**
   * Delete a draft. One store, so one delete.
   *
   * The scratch record is deliberately left alone even when it belongs to this
   * draft: it holds the timeline that is on screen right now, and deleting the
   * draft is not a reason to throw that away. `pickResumable` offers a scratch
   * record whose draft has gone as an unnamed timeline, which is what it is.
   */
  async function removeDraft(id: number): Promise<void> {
    await deleteProject(id);

    if (activeDraft.value?.id === id) activeDraft.value = null;
    if (resumable.value?.projectId === id) resumable.value = null;

    await loadDrafts();
  }

  /**
   * Put the resume banner away.
   *
   * The scratch record is the banner's own, so it goes. A named draft it was
   * offering is the person's and stays in the list: the banner was pointing at
   * that draft, not holding it.
   */
  async function dismissResumable(): Promise<void> {
    resumable.value = null;

    try {
      await clearAutosave();
    } catch (error) {
      console.error('Failed to clear the editor autosave:', error);
    }
  }

  function scheduleAutosave(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => void persist(), AUTOSAVE_DEBOUNCE_MS);
  }

  watch([clips, audio], scheduleAutosave);

  onBeforeUnmount(() => {
    if (!autosaveTimer) return;
    // Leaving mid-debounce would lose the last edit, so flush it.
    clearTimeout(autosaveTimer);
    void persist();
  });

  return {
    drafts,
    activeDraft,
    resumable,
    saving,
    migrated,
    isEmpty,
    loadDrafts,
    loadResumable,
    setActiveDraft,
    detachDraft,
    saveNamed,
    importDraft,
    removeDraft,
    dismissResumable,
  };
}
