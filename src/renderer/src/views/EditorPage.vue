<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../stores/toast';
import { useGamesStore } from '../stores/games';
import { useTagsStore } from '../stores/tags';
import { useTimeline } from '../composables/useTimeline';
import { useTimelineAudio } from '../composables/useTimelineAudio';
import { useEditorHistory } from '../composables/useEditorHistory';
import { snapTime } from '../composables/useEdgeSnap';
import { useEditorVideoPlayback } from '../composables/useEditorVideoPlayback';
import { useEditorAudioPlayback } from '../composables/useEditorAudioPlayback';
import { useEditorClipLibrary } from '../composables/useEditorClipLibrary';
import { useEditorDrafts } from '../composables/useEditorDrafts';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { loadVideoMetadata } from '../composables/useVideoMetadata';
import { EDITOR_CONSTANTS } from '../constants/editor';
import { audioUrl, videoUrl as videoUrlFor } from '../utils/mediaUrl';
import { useClipExport } from '../composables/useClipExport';
import { useEditorLayout } from '../composables/useEditorLayout';
import { useClipHandlers } from '../composables/useClipHandlers';
import { getClip, type ExportOptions } from '../services/clips';
import { listAudioTracks } from '../services/audio';
import { parseClipIds } from '../utils/clipIdQuery';
import { pluralize } from '../utils/pluralize';
import { formatRelativeTime } from '../helpers/dateFormat';
import type { Clip } from '../types/clip';
import type { AudioTrack } from '../types/audio';
import type { TimelineAudio, TimelineClip } from '../types/editor';
import Timeline from '../components/Editor/Timeline.vue';
import EditorControls from '../components/Editor/EditorControls.vue';
import ClipProperties from '../components/Editor/ClipProperties.vue';
import AudioProperties from '../components/Editor/AudioProperties.vue';
import ClipLibrary from '../components/Editor/ClipLibrary.vue';
import MusicLibrary from '../components/Editor/MusicLibrary.vue';
import ExportDialog from '../components/Editor/ExportDialog.vue';
import DraftsDialog from '../components/Editor/DraftsDialog.vue';
import type { EditorDraft } from '../services/editorDraftsDb';
import type { DraftFilePayload } from '../utils/draftFile';

type LibraryTab = 'clips' | 'music';

const router = useRouter();
const route = useRoute();
const toastStore = useToastStore();
const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const { getThumbUrl } = useClipHandlers();

const {
  clips: timelineClips,
  currentTime,
  duration,
  zoom,
  playing,
  addClip,
  loadClips,
  removeClip,
  updateClipProperties,
  moveClip,
  trimClip,
  reflowClips,
  snapshotClips,
  restoreClips,
  setZoom,
  pause,
} = useTimeline();

const {
  audio: timelineAudio,
  audioDuration,
  addAudio,
  loadAudio,
  removeAudio,
  updateAudioProperties,
  moveAudio,
  trimAudio,
  snapshotAudio,
  restoreAudio,
} = useTimelineAudio();

// Both lanes are captured together: one gesture can change both, and undoing
// half of it would be worse than not undoing at all.
const { canUndo, canRedo, record, undo, redo, clearHistory } = useEditorHistory({
  snapshotClips,
  restoreClips,
  snapshotAudio,
  restoreAudio,
});

/** The ruler spans whichever lane runs longest; the export still cuts at the video. */
const totalDuration = computed(() => Math.max(duration.value, audioDuration.value));

const { videoA, videoB, activeSlot, isBuffering, togglePlayback, skipForward, skipBackward } = useEditorVideoPlayback(
  timelineClips,
  currentTime,
  playing,
  duration
);

useEditorAudioPlayback(timelineAudio, timelineClips, currentTime, playing, totalDuration);

// useTimeline clamps to the video lane alone, which would pin the playhead at
// zero on a music-only timeline. Both of these span whichever lane is longer.
function handleSeek(time: number): void {
  currentTime.value = Math.max(0, Math.min(time, totalDuration.value));
}

function handlePlay(): void {
  if (currentTime.value >= totalDuration.value) currentTime.value = 0;
  playing.value = true;
}

const { showLibrary, showProperties, toggleLibrary, toggleProperties } = useEditorLayout();

const libraryTab = ref<LibraryTab>('clips');

const library = useEditorClipLibrary();

const audioTracks = ref<AudioTrack[]>([]);
const audioTracksLoading = ref(false);

/** Backs the "In timeline" muting in the library panels. */
const addedClipIds = computed(() => timelineClips.value.map((c: TimelineClip) => c.clipId));
const addedTrackIds = computed(() => timelineAudio.value.map((a: TimelineAudio) => a.trackId));

const selectedClipId = ref<string | null>(null);
const selectedAudioId = ref<string | null>(null);

const selectedClip = computed(
  () => timelineClips.value.find((c: TimelineClip) => c.id === selectedClipId.value) || null
);
const selectedAudio = computed(
  () => timelineAudio.value.find((a: TimelineAudio) => a.id === selectedAudioId.value) || null
);

const {
  isExporting,
  exportProgress,
  exportMessage,
  exportEta,
  exportClip,
  cancelCurrentExport,
} = useClipExport(timelineClips, timelineAudio);

const {
  drafts,
  activeDraft,
  resumable,
  saving: savingDraft,
  isEmpty: timelineIsEmpty,
  loadDrafts,
  loadResumable,
  setActiveDraft,
  detachDraft,
  saveNamed,
  importDraft,
  removeDraft,
  dismissResumable,
} = useEditorDrafts(timelineClips, timelineAudio);

const showExportDialog = ref(false);
const showDraftsDialog = ref(false);
const restoring = ref(false);

const defaultExportName = computed(
  () => `Edited_${new Date().toISOString().split('T')[0]}`
);

async function loadAudioTracks(): Promise<void> {
  audioTracksLoading.value = true;
  try {
    audioTracks.value = await listAudioTracks();
  } catch (error) {
    console.error('Failed to load the music library:', error);
    toastStore.error('Could not load your music library');
  } finally {
    audioTracksLoading.value = false;
  }
}

async function addClipsToTimeline(clips: Clip[]): Promise<void> {
  // Probe durations in parallel, then append in the given order. addClip places
  // each clip at the current end of the timeline, so appending has to stay
  // ordered even though the metadata loads race each other.
  const prepared = await Promise.all(
    clips.map(async (clip) => {
      const videoUrl = videoUrlFor(clip.id, clip.fileModifiedAt);
      const thumbnailUrl = getThumbUrl(clip);
      let videoDuration: number = EDITOR_CONSTANTS.DEFAULT_VIDEO_DURATION;

      try {
        videoDuration = await loadVideoMetadata(videoUrl);
      } catch (error) {
        console.error(`Failed to load video metadata for clip ${clip.id}:`, error);
      }

      return { clip, videoUrl, thumbnailUrl, videoDuration };
    })
  );

  if (prepared.length > 0) record();
  for (const item of prepared) {
    addClip(item.clip.id, item.videoUrl, item.thumbnailUrl, item.videoDuration);
  }
}

async function handleAddToTimeline(clip: Clip): Promise<void> {
  await addClipsToTimeline([clip]);
}

function handleAddTrackToTimeline(track: AudioTrack): void {
  record();
  // Placed at the playhead, which is where the user is looking.
  const item = addAudio(track, audioUrl(track.id, track.modifiedAt), currentTime.value);
  selectedAudioId.value = item.id;
  selectedClipId.value = null;
  showProperties.value = true;
}

function openExportDialog(): void {
  if (timelineClips.value.length === 0) {
    toastStore.warning('Add clips to the timeline before exporting');
    return;
  }

  showExportDialog.value = true;
}

async function handleExportConfirm(name: string, options: ExportOptions): Promise<void> {
  await exportClip(name, options);
  showExportDialog.value = false;
}

/**
 * Rebuild a timeline from a draft.
 *
 * Only ids and edits were stored, so the media URLs are built fresh here — and
 * anything that has since been deleted from disk simply drops out, with a count
 * rather than a silent gap.
 */
async function restoreDraft(draft: EditorDraft): Promise<void> {
  restoring.value = true;

  try {
    const ids = [...new Set(draft.clips.map((entry) => entry.clipId))];
    const resolved = await Promise.all(ids.map(resolveClip));

    const clipsById = new Map<number, Clip>();
    for (const clip of resolved) {
      if (clip) clipsById.set(clip.id, clip);
    }

    const clipEntries = draft.clips
      .filter((entry) => clipsById.has(entry.clipId))
      .map((entry) => {
        const clip = clipsById.get(entry.clipId)!;
        return {
          clipId: entry.clipId,
          startTime: entry.startTime,
          duration: entry.duration,
          trimStart: entry.trimStart,
          trimEnd: entry.trimEnd,
          originalDuration: entry.originalDuration,
          volume: entry.volume,
          muted: entry.muted,
          videoUrl: videoUrlFor(clip.id, clip.fileModifiedAt),
          thumbnailUrl: getThumbUrl(clip),
        };
      });

    if (draft.audio.length > 0 && audioTracks.value.length === 0) {
      await loadAudioTracks();
    }

    const tracksById = new Map(audioTracks.value.map((track) => [track.id, track]));
    const audioEntries = draft.audio
      .filter((entry) => tracksById.has(entry.trackId))
      .map((entry) => ({
        trackId: entry.trackId,
        name: entry.name,
        url: audioUrl(entry.trackId, tracksById.get(entry.trackId)!.modifiedAt),
        startTime: entry.startTime,
        duration: entry.duration,
        trimStart: entry.trimStart,
        trimEnd: entry.trimEnd,
        originalDuration: entry.originalDuration,
        volume: entry.volume,
        muted: entry.muted,
        fadeIn: entry.fadeIn,
        fadeOut: entry.fadeOut,
      }));

    loadClips(clipEntries);
    loadAudio(audioEntries);
    // Opening a draft is a fresh start, not a step to undo back through.
    clearHistory();
    setActiveDraft(draft);

    selectedClipId.value = null;
    selectedAudioId.value = null;
    resumable.value = null;
    showDraftsDialog.value = false;

    const missing =
      draft.clips.length - clipEntries.length + (draft.audio.length - audioEntries.length);

    if (missing > 0) {
      toastStore.warning(`${missing} item${missing === 1 ? '' : 's'} no longer exist and were skipped`);
    } else {
      toastStore.success(`Restored "${draft.name}"`);
    }
  } catch (error) {
    console.error('Failed to restore the draft:', error);
    toastStore.error('Please try again.', 'Could not restore the draft');
  } finally {
    restoring.value = false;
  }
}

async function handleSaveDraft(name: string): Promise<void> {
  try {
    await saveNamed(name);
    toastStore.success(`Saved "${name}"`);
  } catch (error) {
    console.error('Failed to save the draft:', error);
    toastStore.error('Please try again.', 'Could not save the draft');
  }
}

async function handleImportDraft(payload: DraftFilePayload): Promise<void> {
  try {
    const draft = await importDraft(payload);
    toastStore.success(`Imported "${draft.name}" — open it to load it onto the timeline`);
  } catch (error) {
    console.error('Failed to import the draft:', error);
    toastStore.error('Please try again.', 'Could not import the draft');
  }
}

function handleDeleteDraft(draft: EditorDraft): void {
  toastStore.confirm(
    `"${draft.name}" is removed from this browser.`,
    async () => {
      try {
        await removeDraft(draft.id);
      } catch (error) {
        console.error('Failed to delete the draft:', error);
        toastStore.error('Please try again.', 'Could not delete the draft');
      }
    },
    'Delete draft?'
  );
}

function handleSelectClip(clipId: string): void {
  selectedClipId.value = clipId;
  selectedAudioId.value = null;
}

function handleSelectAudio(audioId: string): void {
  selectedAudioId.value = audioId;
  selectedClipId.value = null;
}

function handleUpdateClip(updates: Partial<Pick<TimelineClip, 'volume' | 'muted'>>): void {
  if (!selectedClipId.value) return;
  record();
  updateClipProperties(selectedClipId.value, updates);
}

function handleUpdateAudio(
  updates: Partial<Pick<TimelineAudio, 'volume' | 'muted' | 'fadeIn' | 'fadeOut'>>
): void {
  if (!selectedAudioId.value) return;
  record();
  updateAudioProperties(selectedAudioId.value, updates);
}

function handleRemoveAudio(audioId: string): void {
  record();
  removeAudio(audioId);
  if (selectedAudioId.value === audioId) selectedAudioId.value = null;
}

function handleRemoveClip(clipId: string): void {
  record();
  removeClip(clipId);
  if (selectedClipId.value === clipId) selectedClipId.value = null;
}

/** The delete shortcut acts on whichever lane holds the selection. */
function handleDeleteSelection(): void {
  if (selectedAudioId.value) {
    handleRemoveAudio(selectedAudioId.value);
    return;
  }

  if (selectedClipId.value) {
    handleRemoveClip(selectedClipId.value);
  }
}

/**
 * Music placements float freely, so dragging one is the only place in the
 * editor where lining up with a cut is done by eye. Snap targets are the
 * playhead, both edges of every clip, and the edges of the other tracks.
 */
function handleMoveAudio(audioId: string, newStartTime: number): void {
  const item = timelineAudio.value.find((a: TimelineAudio) => a.id === audioId);
  const { time } = snapTime(newStartTime, {
    clips: timelineClips.value,
    audio: timelineAudio.value,
    currentTime: currentTime.value,
    pixelsPerSecond: EDITOR_CONSTANTS.PIXELS_PER_SECOND_BASE * zoom.value,
    ignoreAudioId: audioId,
  }, { duration: item?.duration });

  moveAudio(audioId, time);
}

function handleZoomIn(): void {
  setZoom(zoom.value * 0.75);
}

function handleZoomOut(): void {
  setZoom(zoom.value * 1.25);
}

function goBack(): void {
  router.push('/');
}

async function resolveClip(id: number): Promise<Clip | null> {
  const loaded = library.clips.value.find((c: Clip) => c.id === id);
  if (loaded) return loaded;

  // Selection survives paging, so a selected clip is not necessarily in the
  // page the library currently holds. Fetch it directly rather than dropping it.
  try {
    return await getClip(id);
  } catch (error) {
    console.error(`Failed to load clip ${id}:`, error);
    return null;
  }
}

let loadedQueryKey = '';

async function loadClipsFromQuery(): Promise<void> {
  const ids = parseClipIds(route.query.clips ?? route.query.clip);
  const key = ids.join(',');
  if (ids.length === 0 || key === loadedQueryKey) return;
  loadedQueryKey = key;

  const resolved = (await Promise.all(ids.map(resolveClip))).filter(
    (clip): clip is Clip => clip !== null
  );

  if (resolved.length > 0) await addClipsToTimeline(resolved);

  const missing = ids.length - resolved.length;
  if (missing > 0) {
    toastStore.warning(`${missing} ${pluralize(missing, 'clip')} could not be loaded`);
  }
}

useKeyboardShortcuts({
  actions: {
    'editor-play-pause': togglePlayback,
    'editor-skip-backward': () => skipBackward(),
    'editor-skip-forward': () => skipForward(),
    'editor-delete-clip': handleDeleteSelection,
  },
});

/**
 * Undo and redo get their own listener.
 *
 * The shortcut registry matches on `event.code` alone with no notion of
 * modifiers, so registering Ctrl+Z there would fire on a bare Z as well. These
 * two are also the bindings nobody wants to customise.
 */
function handleHistoryKeys(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.code !== 'KeyZ' && event.code !== 'KeyY') return;

  const target = event.target as HTMLElement | null;
  const tag = target?.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

  event.preventDefault();
  // Ctrl+Y and Ctrl+Shift+Z both redo; Windows apps are split on which.
  if (event.code === 'KeyY' || event.shiftKey) redo();
  else undo();
}

onMounted(() => document.addEventListener('keydown', handleHistoryKeys));
onBeforeUnmount(() => document.removeEventListener('keydown', handleHistoryKeys));

onMounted(async () => {

  void gamesStore.fetchGames();
  void tagsStore.fetchTags();
  void loadAudioTracks();

  void loadDrafts();
  await loadResumable();

  await library.fetchClips(false);
  await loadClipsFromQuery();
});

watch(
  () => [route.query.clip, route.query.clips],
  () => loadClipsFromQuery()
);
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-gray-900 overflow-hidden dark:text-slate-100">
    <header class="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white/60 backdrop-blur-sm border-b border-gray-300 dark:border-slate-700">
      <div class="flex items-center gap-3">
        <button
          class="p-2 rounded-lg hover:bg-black/5 transition-colors"
          @click="goBack"
        >
          <Icon icon="material-symbols:arrow-back" class="text-xl" />
        </button>

        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <Icon icon="material-symbols:movie-edit" class="text-white" />
          </div>
          <div>
            <h1 class="text-lg font-bold">Advanced Editor</h1>
            <p v-if="!activeDraft" class="text-[10px] text-gray-600 dark:text-slate-400">Create your masterpiece</p>
            <p v-else class="text-[10px] text-gray-600 flex items-center gap-1 dark:text-slate-400">
              <Icon icon="material-symbols:bookmark" class="text-orange-500 text-xs" />
              <span class="truncate max-w-[16rem]">Editing “{{ activeDraft.name }}”</span>
              <button
                class="text-gray-400 hover:text-gray-700 transition-colors dark:text-slate-500"
                title="Stop editing this draft — further changes go to the autosave"
                @click="detachDraft"
              >
                <Icon icon="material-symbols:close" class="text-xs" />
              </button>
            </p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-xs font-medium bg-black/5 hover:bg-black/10 border border-transparent text-gray-700 dark:text-slate-300"
          @click="showDraftsDialog = true"
        >
          <Icon icon="material-symbols:bookmarks-outline" />
          Drafts
          <span
            v-if="drafts.length"
            class="px-1.5 rounded-full bg-orange-500/20 text-orange-700 text-[10px] font-semibold"
          >
            {{ drafts.length }}
          </span>
        </button>

        <button
          class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-xs font-medium"
          :class="showLibrary ? 'bg-orange-500/20 text-orange-700 border border-orange-500/30' : 'bg-black/5 hover:bg-black/10 border border-transparent text-gray-700'"
          @click="toggleLibrary"
        >
          <Icon icon="material-symbols:video-library" />
          Library
        </button>

        <button
          class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-xs font-medium"
          :class="showProperties ? 'bg-orange-500/20 text-orange-700 border border-orange-500/30' : 'bg-black/5 hover:bg-black/10 border border-transparent text-gray-700'"
          @click="toggleProperties"
        >
          <Icon icon="material-symbols:tune" />
          Properties
        </button>
      </div>
    </header>

    <div class="flex-1 flex gap-3 p-3 overflow-hidden">
      <aside v-if="showLibrary" class="w-96 flex-shrink-0 flex flex-col gap-2">
        <div class="flex-shrink-0 grid grid-cols-2 gap-1 p-1 bg-white/60 rounded-lg border border-gray-300 dark:border-slate-700">
          <button
            class="px-2 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
            :class="libraryTab === 'clips' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-black/5'"
            @click="libraryTab = 'clips'"
          >
            <Icon icon="material-symbols:video-library" />
            Clips
          </button>
          <button
            class="px-2 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
            :class="libraryTab === 'music' ? 'bg-orange-500 text-white' : 'text-gray-700 hover:bg-black/5'"
            @click="libraryTab = 'music'"
          >
            <Icon icon="material-symbols:library-music" />
            Music
          </button>
        </div>

        <div class="flex-1 min-h-0">
          <ClipLibrary
            v-if="libraryTab === 'clips'"
            v-model:search="library.search.value"
            v-model:selected-game="library.selectedGame.value"
            v-model:selected-tags="library.selectedTags.value"
            :clips="library.clips.value"
            :games="gamesStore.items"
            :tags="tagsStore.items"
            :loading="library.loading.value"
            :has-more="library.hasMore.value"
            :get-thumb-url="(clip: Clip) => getThumbUrl(clip)"
            :added-clip-ids="addedClipIds"
            @add-to-timeline="handleAddToTimeline"
            @load-more="library.loadMore"
            @clear-filters="library.clearFilters"
          />

          <MusicLibrary
            v-else
            :tracks="audioTracks"
            :loading="audioTracksLoading"
            :added-track-ids="addedTrackIds"
            @add-to-timeline="handleAddTrackToTimeline"
            @changed="loadAudioTracks"
          />
        </div>
      </aside>

      <main class="flex-1 flex flex-col gap-3 min-w-0">
        <!-- The previous session, offered back rather than restored behind your back. -->
        <div
          v-if="resumable"
          class="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-orange-500/40 bg-orange-50/80 backdrop-blur-sm"
        >
          <Icon icon="material-symbols:history" class="text-xl text-orange-500 flex-shrink-0" />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-gray-900 dark:text-slate-100">
              {{ resumable.name === 'Autosave' ? 'Continue where you left off?' : `Continue “${resumable.name}”?` }}
            </div>
            <div class="text-xs text-gray-600 dark:text-slate-400">
              {{ resumable.clips.length }} clip{{ resumable.clips.length === 1 ? '' : 's' }}
              <span v-if="resumable.audio.length">
                · {{ resumable.audio.length }} track{{ resumable.audio.length === 1 ? '' : 's' }}
              </span>
              · {{ formatRelativeTime(resumable.updatedAt) }}
            </div>
          </div>
          <button
            class="h-8 px-4 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1.5 flex-shrink-0"
            :disabled="restoring"
            @click="restoreDraft(resumable)"
          >
            <Icon v-if="restoring" icon="svg-spinners:180-ring-with-bg" class="text-sm" />
            <span>{{ restoring ? 'Restoring…' : 'Resume' }}</span>
          </button>
          <button
            class="h-8 px-4 rounded-lg border border-gray-300 bg-white/70 text-gray-700 text-xs font-semibold hover:bg-white transition-colors inline-flex items-center justify-center flex-shrink-0 dark:border-slate-700 dark:text-slate-300"
            @click="dismissResumable"
          >
            Discard
          </button>
        </div>

        <div class="flex-1 relative bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden dark:border-slate-700">
          <div v-if="timelineClips.length" class="absolute inset-0 flex items-center justify-center p-6">
            <!--
              Two stacked players: one is on screen while the other preloads and
              pre-seeks the next clip, so switching clips does not blank the
              frame. Black backdrop so any residual gap reads as black, not white.
            -->
            <div class="relative max-w-full max-h-full bg-black shadow-2xl rounded-lg border border-gray-300 overflow-hidden dark:border-slate-700">
              <video
                ref="videoA"
                class="max-w-full max-h-full block"
                :class="activeSlot === 0 ? 'relative opacity-100' : 'absolute inset-0 opacity-0 pointer-events-none'"
                preload="auto"
                playsinline
              />
              <video
                ref="videoB"
                class="max-w-full max-h-full block"
                :class="activeSlot === 1 ? 'relative opacity-100' : 'absolute inset-0 opacity-0 pointer-events-none'"
                preload="auto"
                playsinline
              />

              <div
                v-if="isBuffering"
                class="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div class="bg-black/60 backdrop-blur-sm rounded-full p-3">
                  <Icon icon="material-symbols:progress-activity" class="text-2xl text-white animate-spin" />
                </div>
              </div>
            </div>
          </div>

          <div v-else class="absolute inset-0 flex items-center justify-center">
            <div class="text-center">
              <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
                <Icon icon="material-symbols:movie" class="text-4xl text-orange-400" />
              </div>
              <p class="text-lg font-semibold mb-2 text-gray-900 dark:text-slate-100">No clips in timeline</p>
              <p class="text-sm text-gray-600 dark:text-slate-400">Click clips from the library to get started</p>
            </div>
          </div>
        </div>

        <div class="h-56 flex-shrink-0">
          <Timeline
            :clips="timelineClips"
            :audio="timelineAudio"
            :current-time="currentTime"
            :duration="totalDuration"
            :video-duration="duration"
            :zoom="zoom"
            :selected-clip-id="selectedClipId"
            :selected-audio-id="selectedAudioId"
            @seek="handleSeek"
            @select-clip="handleSelectClip"
            @remove-clip="handleRemoveClip"
            @trim-clip="trimClip"
            @move-clip="moveClip"
            @drag-start="record"
            @drag-end="reflowClips"
            @select-audio="handleSelectAudio"
            @remove-audio="handleRemoveAudio"
            @trim-audio="trimAudio"
            @move-audio="handleMoveAudio"
          />
        </div>
      </main>

      <aside v-if="showProperties" class="w-80 flex-shrink-0">
        <AudioProperties
          v-if="selectedAudio"
          :item="selectedAudio"
          @update="handleUpdateAudio"
          @remove="handleRemoveAudio(selectedAudio.id)"
        />

        <ClipProperties
          v-else
          :clip="selectedClip"
          @update="handleUpdateClip"
        />
      </aside>
    </div>

    <EditorControls
      :playing="playing"
      :current-time="currentTime"
      :duration="totalDuration"
      :zoom="zoom"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :exporting="isExporting"
      :export-progress="exportProgress"
      @play="handlePlay"
      @pause="pause"
      @skip-backward="skipBackward()"
      @skip-forward="skipForward()"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @undo="undo"
      @redo="redo"
      @export="openExportDialog"
    />

    <ExportDialog
      v-model:open="showExportDialog"
      :default-name="defaultExportName"
      :clip-count="timelineClips.length"
      :track-count="timelineAudio.length"
      :duration="duration"
      :exporting="isExporting"
      :progress="exportProgress"
      :message="exportMessage"
      :eta-seconds="exportEta"
      @confirm="handleExportConfirm"
      @cancel-export="cancelCurrentExport"
    />

    <DraftsDialog
      v-model:open="showDraftsDialog"
      :drafts="drafts"
      :active-id="activeDraft?.id ?? null"
      :can-save="!timelineIsEmpty"
      :saving="savingDraft"
      @save="handleSaveDraft"
      @import="handleImportDraft"
      @open-draft="restoreDraft"
      @delete-draft="handleDeleteDraft"
    />
  </div>
</template>
