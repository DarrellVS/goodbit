<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useClipsStore } from '../stores/clips';
import { useToastStore } from '../stores/toast';
import { useTimeline } from '../composables/useTimeline';
import { useEditorVideoPlayback } from '../composables/useEditorVideoPlayback';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts';
import { loadVideoMetadata } from '../composables/useVideoMetadata';
import { EDITOR_CONSTANTS } from '../constants/editor';
import { videoUrl as videoUrlFor } from '../utils/mediaUrl';
import { useClipExport } from '../composables/useClipExport';
import { useEditorLayout } from '../composables/useEditorLayout';
import { useClipHandlers } from '../composables/useClipHandlers';
import { getClip } from '../services/clips';
import { parseClipIds } from '../utils/clipIdQuery';
import { pluralize } from '../utils/pluralize';
import type { Clip } from '../types/clip';
import type { TimelineClip } from '../types/editor';
import Timeline from '../components/Editor/Timeline.vue';
import EditorControls from '../components/Editor/EditorControls.vue';
import ClipProperties from '../components/Editor/ClipProperties.vue';
import ClipLibrary from '../components/Editor/ClipLibrary.vue';

const router = useRouter();
const route = useRoute();
const clipsStore = useClipsStore();
const toastStore = useToastStore();
const { getThumbUrl } = useClipHandlers();

const {
  clips: timelineClips,
  currentTime,
  duration,
  zoom,
  playing,
  addClip,
  removeClip,
  updateClipProperties,
  moveClip,
  trimClip,
  reflowClips,
  seekTo,
  setZoom,
  play,
  pause,
} = useTimeline();

const { videoA, videoB, activeSlot, isBuffering, togglePlayback, skipForward, skipBackward } = useEditorVideoPlayback(
  timelineClips,
  currentTime,
  playing,
  duration
);

const { showLibrary, showProperties, toggleLibrary, toggleProperties } = useEditorLayout();

/** Backs the "In timeline" muting in the library panel. */
const addedClipIds = computed(() => timelineClips.value.map((c: TimelineClip) => c.clipId));

const selectedClipId = ref<string | null>(null);
const selectedClip = computed(() => 
  timelineClips.value.find((c: TimelineClip) => c.id === selectedClipId.value) || null
);

const { isExporting, exportProgress, exportClip } = useClipExport(timelineClips);

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

  for (const item of prepared) {
    addClip(item.clip.id, item.videoUrl, item.thumbnailUrl, item.videoDuration);
  }
}

async function handleAddToTimeline(clip: Clip): Promise<void> {
  await addClipsToTimeline([clip]);
}

function handleSelectClip(clipId: string): void {
  selectedClipId.value = clipId;
}

function handleUpdateClip(updates: Partial<Pick<TimelineClip, 'volume' | 'muted'>>): void {
  if (selectedClipId.value) {
    updateClipProperties(selectedClipId.value, updates);
  }
}

function handleDeleteClip(): void {
  if (selectedClipId.value) {
    removeClip(selectedClipId.value);
    selectedClipId.value = null;
  }
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
  const loaded = clipsStore.items.find((c: Clip) => c.id === id);
  if (loaded) return loaded;

  // Selection survives paging, so a selected clip is not necessarily on the
  // page the store currently holds. Fetch it directly rather than dropping it.
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
    'editor-delete-clip': handleDeleteClip,
  },
});

onMounted(async () => {
  await clipsStore.fetchClips(false);
  await loadClipsFromQuery();
});

watch(
  () => [route.query.clip, route.query.clips],
  () => loadClipsFromQuery()
);
</script>

<template>
  <div class="h-screen flex flex-col bg-background text-gray-900 overflow-hidden">
    <header class="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-white/60 backdrop-blur-sm border-b border-gray-300">
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
            <p class="text-[10px] text-gray-600">Create your masterpiece</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
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
      <aside v-if="showLibrary" class="w-64 flex-shrink-0">
        <ClipLibrary
          :clips="clipsStore.items"
          :get-thumb-url="(clip: Clip) => getThumbUrl(clip)"
          :added-clip-ids="addedClipIds"
          @add-to-timeline="handleAddToTimeline"
        />
      </aside>

      <main class="flex-1 flex flex-col gap-3 min-w-0">
        <div class="flex-1 relative bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
          <div v-if="timelineClips.length" class="absolute inset-0 flex items-center justify-center p-6">
            <!--
              Two stacked players: one is on screen while the other preloads and
              pre-seeks the next clip, so switching clips does not blank the
              frame. Black backdrop so any residual gap reads as black, not white.
            -->
            <div class="relative max-w-full max-h-full bg-black shadow-2xl rounded-lg border border-gray-300 overflow-hidden">
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
              <p class="text-lg font-semibold mb-2 text-gray-900">No clips in timeline</p>
              <p class="text-sm text-gray-600">Click clips from the library to get started</p>
            </div>
          </div>
        </div>

        <div class="h-44 flex-shrink-0">
          <Timeline
            :clips="timelineClips"
            :current-time="currentTime"
            :duration="duration"
            :zoom="zoom"
            @seek="seekTo"
            @select-clip="handleSelectClip"
            @remove-clip="removeClip"
            @trim-clip="trimClip"
            @move-clip="moveClip"
            @drag-end="reflowClips"
          />
        </div>
      </main>

      <aside v-if="showProperties" class="w-72 flex-shrink-0">
        <ClipProperties
          :clip="selectedClip"
          @update="handleUpdateClip"
        />
      </aside>
    </div>

    <EditorControls
      :playing="playing"
      :current-time="currentTime"
      :duration="duration"
      :zoom="zoom"
      :can-undo="false"
      :can-redo="false"
      :exporting="isExporting"
      :export-progress="exportProgress"
      @play="play"
      @pause="pause"
      @skip-backward="skipBackward()"
      @skip-forward="skipForward()"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @undo="() => {}"
      @redo="() => {}"
      @export="exportClip"
    />
  </div>
</template>
