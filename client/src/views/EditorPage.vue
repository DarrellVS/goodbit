<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useClipsStore } from '../stores/clips';
import { useTimeline } from '../composables/useTimeline';
import { useEditorPlayback } from '../composables/useEditorPlayback';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
import type { Clip } from '../types/clip';
import Timeline from '../components/Editor/Timeline.vue';
import EditorControls from '../components/Editor/EditorControls.vue';
import ClipProperties from '../components/Editor/ClipProperties.vue';
import ClipLibrary from '../components/Editor/ClipLibrary.vue';

const router = useRouter();
const route = useRoute();
const clipsStore = useClipsStore();

const {
  clips: timelineClips,
  audioSegments,
  currentTime,
  duration,
  zoom,
  playing,
  addClip,
  removeClip,
  updateClip,
  moveClip,
  trimClip,
  muteSegment,
  seekTo,
  play,
  pause,
} = useTimeline();

const { videoElement, activeClip, togglePlayback, skipForward, skipBackward } = useEditorPlayback(
  timelineClips,
  currentTime,
  playing,
  duration
);

const selectedClipId = ref<string | null>(null);
const selectedClip = computed(() => 
  selectedClipId.value 
    ? timelineClips.value.find(c => c.id === selectedClipId.value) || null
    : null
);

const showLibrary = ref(true);
const showProperties = ref(true);
const exporting = ref(false);

async function handleAddToTimeline(clip: Clip): Promise<void> {
  const videoUrl = videoUrlFor(clip.id, clip.fileModifiedAt);
  
  const tempVideo = document.createElement('video');
  tempVideo.src = videoUrl;
  
  try {
    await new Promise<void>((resolve, reject) => {
      tempVideo.addEventListener('loadedmetadata', () => resolve());
      tempVideo.addEventListener('error', () => reject());
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
    
    const videoDuration = tempVideo.duration;
    
    addClip(
      clip.id,
      videoUrl,
      thumbUrlFor(clip.id, clip.fileModifiedAt),
      videoDuration
    );
  } catch (error) {
    console.error('Failed to load video metadata, using default duration:', error);
    addClip(
      clip.id,
      videoUrl,
      thumbUrlFor(clip.id, clip.fileModifiedAt),
      30
    );
  }
}

function handleSelectClip(clipId: string): void {
  selectedClipId.value = clipId;
}

function handleUpdateClip(updates: Partial<any>): void {
  if (!selectedClipId.value) return;
  updateClip(selectedClipId.value, updates);
}

function handleMoveClip(clipId: string, newStartTime: number): void {
  moveClip(clipId, newStartTime);
}


function handleZoomIn(): void {
  zoom.value = Math.max(0.25, zoom.value * 0.75);
}

function handleZoomOut(): void {
  zoom.value = Math.min(3, zoom.value * 1.25);
}

function handleExport(): void {
  exporting.value = true;
  
  setTimeout(() => {
    alert('Export functionality will render your timeline to a final video file!\nThis requires backend FFmpeg processing.');
    exporting.value = false;
  }, 500);
}

function goBack(): void {
  router.push('/');
}

function getThumbUrl(clip: Clip): string {
  return thumbUrlFor(clip.id, clip.fileModifiedAt);
}

function handleKeyboard(event: KeyboardEvent): void {
  if (event.code === 'Space' && event.target === document.body) {
    event.preventDefault();
    togglePlayback();
  } else if (event.code === 'ArrowLeft') {
    skipBackward(5);
  } else if (event.code === 'ArrowRight') {
    skipForward(5);
  } else if (event.code === 'Delete' && selectedClipId.value) {
    removeClip(selectedClipId.value);
    selectedClipId.value = null;
  }
}

onMounted(async () => {
  await clipsStore.fetchClips();
  
  const clipId = route.query.clip;
  if (clipId) {
    const clip = clipsStore.items.find(c => c.id === Number(clipId));
    if (clip) {
      await handleAddToTimeline(clip);
    }
  }
  
  document.addEventListener('keydown', handleKeyboard);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyboard);
});

watch(() => route.query.clip, async (clipId) => {
  if (!clipId) return;
  const clip = clipsStore.items.find(c => c.id === Number(clipId));
  if (clip) {
    await handleAddToTimeline(clip);
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
          :get-thumb-url="getThumbUrl"
          @add-to-timeline="handleAddToTimeline"
        />
      </aside>

      <main class="flex-1 flex flex-col gap-3 min-w-0">
        <div class="flex-1 relative bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
          <div v-if="activeClip" class="absolute inset-0 flex items-center justify-center p-6">
            <video
              ref="videoElement"
              class="max-w-full max-h-full shadow-2xl rounded-lg border border-gray-300"
              style="aspect-ratio: 16/9"
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
            @move-clip="handleMoveClip"
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
      @play="play"
      @pause="pause"
      @skip-backward="skipBackward(5)"
      @skip-forward="skipForward(5)"
      @zoom-in="handleZoomIn"
      @zoom-out="handleZoomOut"
      @undo="() => {}"
      @redo="() => {}"
      @export="handleExport"
    />
  </div>
</template>
