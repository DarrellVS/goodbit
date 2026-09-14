<template>
  <!--
    A column that fits the window: the preview takes what is left over after
    the timeline and the transport, rather than the timeline being pushed off
    the bottom by a tall clip.
  -->
  <div class="h-full flex flex-col overflow-hidden">
    <TrimHeader
      :name="clipName"
      :placeholder="clip?.filename ?? 'Name this clip'"
      @update:name="clipName = $event"
      @commit="saveName"
    />

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
        :watches-screen="watchesScreen"
        @apply="applySuggestion"
        @seek="seek"
        @reject="rejectThisSuggestion"
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
        :save-progress="saveProgress"
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import {
  getClip,
  getClipMeta,
  getClipSuggestions,
  getHudWatchedGames,
  rejectSuggestion,
  trimClip,
  updateClipName,
  type ClipSuggestions,
} from '../services/clips';
import type { Clip } from '../types/clip';
import { useToastStore } from '../stores/toast';
import { streamUrl, frameStripUrl } from '../utils/mediaUrl';
import { restoreScrollPosition } from '../utils/scroll';
import { formatBytes } from '../utils/formatters';
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

/**
 * How far the cut has got, straight from the action doing it.
 *
 * An exact trim re-encodes, tens of seconds on a wide recording, and the
 * button used to spin with no number at all.
 */
const saveProgress = ref(0);
let detachTrimProgress: (() => void) | null = null;

onMounted(() => {
  detachTrimProgress =
    window.goodbit?.onServiceEvent((raw) => {
      const event = raw as { type?: string; clipId?: number; percent?: number };
      if (event.type !== 'trim-progress') return;
      if (event.clipId !== Number(props.id)) return;
      saveProgress.value = Math.max(0, Math.min(100, event.percent ?? 0));
    }) ?? null;
});

onBeforeUnmount(() => {
  detachTrimProgress?.();
  detachTrimProgress = null;
});

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

const toastStore = useToastStore();
const clip = ref<Clip | null>(null);
const clipName = ref('');

async function loadClip(): Promise<void> {
  try {
    clip.value = await getClip(Number(props.id));
    clipName.value = clip.value.displayName ?? '';
  } catch (error) {
    console.error('Failed to load the clip:', error);
  }
}

/**
 * The name is saved when the field is left, not when the trim is saved: a name
 * is a decision on its own and should not be lost to a change of mind about
 * the cut. An empty field clears the name, and the filename shows again.
 */
async function saveName(): Promise<void> {
  if (!clip.value) return;
  const next = clipName.value.trim() || null;
  if (next === (clip.value.displayName ?? null)) return;

  try {
    clip.value = await updateClipName(clip.value.id, next);
    clipName.value = clip.value.displayName ?? '';
    toastStore.success(next ? `Named "${next}"` : 'Name cleared');
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not save the name');
  }
}

const suggestions = ref<ClipSuggestions | null>(null);
const suggestionsLoading = ref(false);

/**
 * Whether this clip's game gets its screen read as well as heard.
 *
 * Known from the game's folder name alone, so the banner can say what a wait
 * is for before the answer that would have told it arrives.
 */
const hudGames = ref<string[]>([]);
const watchesScreen = computed(
  () => !!clip.value && hudGames.value.includes(clip.value.game.trim().toLowerCase()),
);

/**
 * The banner only appears when the analysis is confident, so a failure here is
 * not worth telling the user about. There was nothing promised to lose.
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

/**
 * Recorded rather than acted on: the banner stays where it is, and the next
 * version of the analysis has one more example of what not to point at.
 */
async function rejectThisSuggestion(): Promise<void> {
  try {
    await rejectSuggestion(Number(props.id));
  } catch (error) {
    console.error('Could not record that:', error);
  }
}

function applySuggestion(start: number, end: number): void {
  range.value = [start, Math.min(end, duration.value)];
  seek(start);
}

async function handleSave(): Promise<void> {
  if (isSaving.value || !isValidRange.value) return;
  
  isSaving.value = true;
  saveProgress.value = 0;
  
  try {
    const [startTime, endTime] = range.value;
    const result = await trimClip(Number(props.id), startTime, endTime);
    // Say what happened to the file: a compressed trim is the whole reason a
    // hundred megabyte clip became fifteen, and a lossless one explains why
    // it did not.
    const was = clip.value?.sizeBytes;
    const size = was ? `${formatBytes(was)} → ${formatBytes(result.sizeBytes)}` : formatBytes(result.sizeBytes);

    // Say where the cut landed, not just what it weighs. The toast used to
    // report megabytes only, which is how a cut that quietly moved could go
    // unnoticed. It cannot move any more, so this simply states the range.
    toastStore.success(
      `Kept ${formatTime(result.actualStartSec)} to ${formatTime(result.actualEndSec)}. ${size}`,
      result.mode === 'compressed' ? 'Trimmed and compressed' : 'Trimmed',
    );
    clipsStore.resetPagination();
    await clipsStore.fetchClips(false);
    await router.push('/');
    restoreScrollPosition();
  } catch (error) {
    console.error('Failed to trim clip:', error);
    toastStore.error((error as Error).message || 'Could not trim this clip');
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void loadClip();
  void loadClipMetadata();
  void loadSuggestions();
  // Nothing depends on this arriving; it only changes what the wait says.
  void getHudWatchedGames()
    .then((games) => {
      hudGames.value = games;
    })
    .catch(() => {});
});
</script>
