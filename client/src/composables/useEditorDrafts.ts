import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import {
  AUTOSAVE_ID,
  deleteDraft,
  listDrafts,
  putDraft,
  type EditorDraft,
  type EditorDraftAudio,
  type EditorDraftClip,
} from '../services/editorDraftsDb';
import type { TimelineAudio, TimelineClip } from '../types/editor';

/** Writing on every drag frame would hammer IndexedDB; a beat of quiet is enough. */
const AUTOSAVE_DEBOUNCE_MS = 800;

export interface ActiveDraft {
  id: string;
  name: string;
}

function toDraftClips(clips: readonly TimelineClip[]): EditorDraftClip[] {
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

function toDraftAudio(audio: readonly TimelineAudio[]): EditorDraftAudio[] {
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

export function useEditorDrafts(
  clips: Ref<readonly TimelineClip[]>,
  audio: Ref<readonly TimelineAudio[]>
) {
  const drafts = ref<EditorDraft[]>([]);
  /**
   * The draft being edited, if any. Autosave writes here instead of to the
   * rolling record, so opening a draft and carrying on keeps updating *that*
   * draft rather than quietly forking a shadow copy of it.
   */
  const activeDraft = ref<ActiveDraft | null>(null);
  /**
   * The newest stored timeline as it stood when the editor opened — offered back
   * by the resume banner. Held apart from the database record so that starting
   * to work before deciding, which overwrites that record, cannot take the offer
   * away.
   */
  const resumable = ref<EditorDraft | null>(null);
  const saving = ref(false);

  const isEmpty = computed(() => clips.value.length === 0 && audio.value.length === 0);

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Named drafts only — the rolling autosave is the resume banner's business. */
  async function loadDrafts(): Promise<void> {
    try {
      drafts.value = (await listDrafts()).filter((draft) => draft.id !== AUTOSAVE_ID);
    } catch (error) {
      console.error('Failed to read editor drafts:', error);
    }
  }

  /**
   * What to offer on open: the most recently touched timeline, whether that is
   * the rolling autosave or a named draft someone was working on.
   */
  async function loadResumable(): Promise<void> {
    try {
      const stored = await listDrafts();
      resumable.value =
        stored.find((draft) => draft.clips.length > 0 || draft.audio.length > 0) ?? null;
    } catch (error) {
      console.error('Failed to read the editor autosave:', error);
    }
  }

  async function persist(): Promise<void> {
    const target = activeDraft.value;
    const updatedAt = new Date().toISOString();

    try {
      await putDraft({
        id: target?.id ?? AUTOSAVE_ID,
        name: target?.name ?? 'Autosave',
        updatedAt,
        clips: toDraftClips(clips.value),
        audio: toDraftAudio(audio.value),
      });
    } catch (error) {
      console.error('Failed to autosave the timeline:', error);
      return;
    }

    // Keep the listed timestamp honest without re-reading the store every beat.
    if (!target) return;
    drafts.value = drafts.value.map((draft) =>
      draft.id === target.id ? { ...draft, updatedAt } : draft
    );
  }

  function setActiveDraft(draft: EditorDraft | null): void {
    activeDraft.value =
      draft && draft.id !== AUTOSAVE_ID ? { id: draft.id, name: draft.name } : null;
  }

  /** Stop tracking a draft; further edits go back to the rolling autosave. */
  function detachDraft(): void {
    activeDraft.value = null;
  }

  async function saveNamed(name: string): Promise<void> {
    saving.value = true;

    const draft: EditorDraft = {
      id: uuidv4(),
      name: name.trim() || 'Untitled draft',
      updatedAt: new Date().toISOString(),
      clips: toDraftClips(clips.value),
      audio: toDraftAudio(audio.value),
    };

    try {
      await putDraft(draft);
      // Editing continues in the draft just saved, not in the autosave.
      setActiveDraft(draft);
      await loadDrafts();
    } finally {
      saving.value = false;
    }
  }

  /** Store a draft that came from a file as a new draft of its own. */
  async function importDraft(payload: {
    name: string;
    clips: EditorDraftClip[];
    audio: EditorDraftAudio[];
  }): Promise<EditorDraft> {
    const draft: EditorDraft = {
      id: uuidv4(),
      name: payload.name.trim() || 'Imported draft',
      updatedAt: new Date().toISOString(),
      // The payload came back out of a reactive ref, so its entries are Vue
      // proxies — and structuredClone, which IndexedDB writes through, refuses
      // to clone a Proxy. Every field is a primitive, so a spread is enough to
      // hand over plain objects.
      clips: payload.clips.map((clip) => ({ ...clip })),
      audio: payload.audio.map((item) => ({ ...item })),
    };

    await putDraft(draft);
    await loadDrafts();
    return draft;
  }

  async function removeDraft(id: string): Promise<void> {
    await deleteDraft(id);
    if (activeDraft.value?.id === id) activeDraft.value = null;
    if (resumable.value?.id === id) resumable.value = null;
    await loadDrafts();
  }

  /**
   * Put the resume banner away. The rolling autosave is the banner's own record
   * so it gets deleted; a named draft is the user's and only gets dismissed.
   */
  async function dismissResumable(): Promise<void> {
    const draft = resumable.value;
    resumable.value = null;

    if (draft?.id !== AUTOSAVE_ID) return;

    try {
      await deleteDraft(AUTOSAVE_ID);
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
