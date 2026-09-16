<template>
  <!--
    A column that fits the modal: the preview takes what is left over after the
    timeline and the transport, rather than the timeline being pushed off the
    bottom by a tall clip.

    No header of its own. This used to be a page with `TrimHeader` on top,
    carrying the clip's name in a second editable field; inside the modal the
    header above already has one, and two boxes for one name is how you end up
    with two answers.
  -->
  <div class="h-full min-h-0 flex flex-col overflow-hidden">
    <main class="flex-1 min-h-0 w-full px-6 py-5 flex flex-col gap-4 overflow-y-auto">
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
import { useClipsStore } from '../../stores/clips';
import {
  getClip,
  getClipMeta,
  getClipSuggestions,
  getHudWatchedGames,
  rejectSuggestion,
  trimClip,
  updateClipName,
  type ClipSuggestions,
} from '../../services/clips';
import type { Clip } from '../../types/clip';
import type { ClipMeta } from '../../services/clips';
import { useToastStore } from '../../stores/toast';
import { streamUrl, frameStripUrl } from '../../utils/mediaUrl';
import { formatBytes } from '../../utils/formatters';
import { useTrimRange } from '../../composables/useTrimRange';
import { useVideoPlayer } from '../../composables/useVideoPlayer';
import VideoPreview from './VideoPreview.vue';
import TimelineEditor from './TimelineEditor.vue';
import SuggestionBanner from './SuggestionBanner.vue';

interface Props {
  id: string;
  /**
   * What the panel that opened this already knows.
   *
   * The details panel has loaded the clip and probed the file before the
   * trimmer exists, and re-fetching both here is what made opening the trimmer
   * feel unfinished: the strip painted, and then a moment later the duration
   * arrived and the range shading appeared over it. Handing the numbers over
   * means the range is right on the first frame and there is nothing to pop in.
   *
   * Optional, because `/trim/:id` can open this cold, and then the fetches
   * below are the only way to find out.
   */
  clip?: Clip | null;
  metadata?: ClipMeta | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'saved'): void }>();

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
  // The cut replaces this exact file, by renaming over it. Holding it open
  // until then is how that rename fails.
  locked: isSaving,
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

async function loadClip(): Promise<void> {
  try {
    clip.value = await getClip(Number(props.id));
  } catch (error) {
    console.error('Failed to load the clip:', error);
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
    // The cut rewrote the file, so the details behind this need re-reading.
    emit('saved');
  } catch (error) {
    console.error('Failed to trim clip:', error);
    toastStore.error((error as Error).message || 'Could not trim this clip');
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  // Straight from the caller where possible, over the wire only when not.
  if (props.metadata?.durationSec) initializeRange(props.metadata.durationSec);
  else void loadClipMetadata();

  if (props.clip) clip.value = props.clip;
  else void loadClip();

  void loadSuggestions();
  // Nothing depends on this arriving; it only changes what the wait says.
  void getHudWatchedGames()
    .then((games) => {
      hudGames.value = games;
    })
    .catch(() => {});
});
</script>
