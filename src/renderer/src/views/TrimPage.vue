<template>
  <!--
    A column that fits the window: the preview takes what is left over after
    the timeline and the transport, rather than the timeline being pushed off
    the bottom by a tall clip.
  -->
  <div class="h-full flex flex-col overflow-hidden">
    <TrimHeader />

    <main class="flex-1 min-h-0 w-full max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4 overflow-y-auto">
      <VideoPreview
        ref="videoPreviewRef"
        class="flex-1 min-h-[140px]"
        :video-source="videoSource"
        @toggle="togglePlayback"
      />

      <SuggestionBanner
        class="flex-shrink-0"
        :suggestions="suggestions"
        :loading="suggestionsLoading"
        :applied="suggestionApplied"
        @apply="applySuggestion"
        @seek="seek"
      />

      <TimelineEditor
        class="flex-shrink-0"
        v-model="range"
        :max-duration="duration"
        :duration="formatTime(duration)"
        :start-time="formatTime(range[0])"
        :end-time="formatTime(range[1])"
        :length="formatTime(trimmedLength)"
        :start-percentage="timeToPercentage(range[0])"
        :end-percentage="timeToPercentage(range[1])"
        :frame-strip-source="frameStripSource"
        :is-valid="isValidRange"
        :is-saving="isSaving"
        :playhead-percentage="timeToPercentage(currentTime)"
        :playhead="formatTime(currentTime)"
        :is-playing="isPlaying"
        @save="handleSave"
        @toggle-playback="togglePlayback"
        @seek="scrubTo"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { getClipMeta, getClipSuggestions, trimClip, type ClipSuggestions } from '../services/clips';
import { streamUrl, frameStripUrl } from '../utils/mediaUrl';
import { restoreScrollPosition } from '../utils/scroll';
import { useTrimRange } from '../composables/useTrimRange';
import { useVideoPlayer } from '../composables/useVideoPlayer';
import TrimHeader from '../components/Trim/TrimHeader.vue';
import VideoPreview from '../components/Trim/VideoPreview.vue';
import TimelineEditor from '../components/Trim/TimelineEditor.vue';
import SuggestionBanner from '../components/Trim/SuggestionBanner.vue';

interface Props {
  id: string;
}

const props = defineProps<Props>();

const router = useRouter();
const clipsStore = useClipsStore();

const {
  duration,
  range,
  trimmedLength,
  isValidRange,
  timeToPercentage,
  initializeRange,
  formatTime,
} = useTrimRange();

const videoPreviewRef = ref<InstanceType<typeof VideoPreview> | null>(null);
const isSaving = ref(false);

const videoSource = computed(() => streamUrl(Number(props.id)));

const frameStripSource = computed(() => frameStripUrl(Number(props.id)));

const videoElement = computed(() => 
  videoPreviewRef.value?.videoElement ?? null
);

const { currentTime, isPlaying, togglePlayback, seek, scrubTo } = useVideoPlayer({
  videoElement,
  range,
});

async function loadClipMetadata(): Promise<void> {
  try {
    const metadata = await getClipMeta(Number(props.id));
    initializeRange(metadata.durationSec || 0);
  } catch (error) {
    console.error('Failed to load clip metadata:', error);
  }
}

const suggestions = ref<ClipSuggestions | null>(null);
const suggestionsLoading = ref(false);

/**
 * The banner only appears when the analysis is confident, so a failure here is
 * not worth telling the user about — there was nothing promised to lose.
 */
async function loadSuggestions(): Promise<void> {
  suggestionsLoading.value = true;
  try {
    suggestions.value = await getClipSuggestions(Number(props.id));
  } catch (error) {
    console.error('Failed to analyse clip:', error);
    suggestions.value = null;
  } finally {
    suggestionsLoading.value = false;
  }
}

/** True once the range already matches the suggestion, within a rounding error. */
const suggestionApplied = computed(() => {
  const w = suggestions.value?.window;
  if (!w) return false;
  return Math.abs(range.value[0] - w.start) < 0.15 && Math.abs(range.value[1] - w.end) < 0.15;
});

function applySuggestion(start: number, end: number): void {
  range.value = [start, Math.min(end, duration.value)];
  seek(start);
}

async function handleSave(): Promise<void> {
  if (isSaving.value || !isValidRange.value) return;
  
  isSaving.value = true;
  
  try {
    const [startTime, endTime] = range.value;
    await trimClip(Number(props.id), startTime, endTime);
    clipsStore.resetPagination();
    await clipsStore.fetchClips(false);
    await router.push('/');
    restoreScrollPosition();
  } catch (error) {
    console.error('Failed to trim clip:', error);
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void loadClipMetadata();
  void loadSuggestions();
});
</script>
