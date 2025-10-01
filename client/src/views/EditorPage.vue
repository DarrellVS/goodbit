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
import { exportTimeline } from '../services/clips';
import { EDITOR_CONSTANTS } from '../constants/editor';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
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
  seekTo,
  setZoom,
  play,
  pause,
} = useTimeline();

const { videoElement, togglePlayback, skipForward, skipBackward } = useEditorVideoPlayback(
  timelineClips,
  currentTime,
  playing,
  duration
);

const selectedClipId = ref<string | null>(null);
const showLibrary = ref(true);
const showProperties = ref(true);
const isExporting = ref(false);

const selectedClip = computed(() => 
  timelineClips.value.find((c: TimelineClip) => c.id === selectedClipId.value) || null
);

async function handleAddToTimeline(clip: Clip): Promise<void> {
  const videoUrl = videoUrlFor(clip.id, clip.fileModifiedAt);
  const thumbnailUrl = thumbUrlFor(clip.id, clip.fileModifiedAt);
  
  try {
    const videoDuration = await loadVideoMetadata(videoUrl);
    addClip(clip.id, videoUrl, thumbnailUrl, videoDuration);
  } catch (error) {
    console.error('Failed to load video metadata:', error);
    addClip(clip.id, videoUrl, thumbnailUrl, EDITOR_CONSTANTS.DEFAULT_VIDEO_DURATION);
  }
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

async function handleExport(): Promise<void> {
  if (timelineClips.value.length === 0) {
    toastStore.warning('Add clips to the timeline before exporting');
    return;
  }

  isExporting.value = true;
  
  try {
    const outputName = `Edited_${new Date().toISOString().split('T')[0]}`;
    const newClip = await exportTimeline(timelineClips.value, outputName);
    
    toastStore.success('Your edited clip has been saved!', 'Export successful');
    router.push('/');
  } catch (error) {
    console.error('Export failed:', error);
    toastStore.error('Please try again.', 'Export failed');
  } finally {
    isExporting.value = false;
  }
}

function goBack(): void {
  router.push('/');
}

async function loadClipFromQuery(clipId: string): Promise<void> {
  const clip = clipsStore.items.find((c: Clip) => c.id === Number(clipId));
  if (clip) await handleAddToTimeline(clip);
}

useKeyboardShortcuts({
  Space: togglePlayback,
  ArrowLeft: () => skipBackward(),
  ArrowRight: () => skipForward(),
  Delete: handleDeleteClip,
});

onMounted(async () => {
  await clipsStore.fetchClips();
  
  const clipId = route.query.clip;
  if (clipId && !Array.isArray(clipId)) {
    await loadClipFromQuery(clipId);
  }
});

watch(() => route.query.clip, async (clipId) => {
  if (clipId && !Array.isArray(clipId)) {
    await loadClipFromQuery(clipId);
  }
});
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
          @click="showLibrary = !showLibrary"
        >
          <Icon icon="material-symbols:video-library" />
          Library
        </button>
        
        <button
          class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 text-xs font-medium"
          :class="showProperties ? 'bg-orange-500/20 text-orange-700 border border-orange-500/30' : 'bg-black/5 hover:bg-black/10 border border-transparent text-gray-700'"
          @click="showProperties = !showProperties"
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
          :get-thumb-url="(clip: Clip) => thumbUrlFor(clip.id, clip.fileModifiedAt)"
          @add-to-timeline="handleAddToTimeline"
        />
      </aside>

      <main class="flex-1 flex flex-col gap-3 min-w-0">
        <div class="flex-1 relative bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
          <div v-if="timelineClips.length" class="absolute inset-0 flex items-center justify-center p-6">
            <video
              ref="videoElement"
              class="max-w-full max-h-full shadow-2xl rounded-lg border border-gray-300"
              preload="metadata"
            />
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
      @play="play"
      @pause="pause"
      @skip-backward="skipBackward()"
      @skip-forward="skipForward()"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @undo="() => {}"
      @redo="() => {}"
      @export="handleExport"
    />
  </div>
</template>
