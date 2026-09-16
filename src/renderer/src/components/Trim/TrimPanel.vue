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
        class="shrink-0"
        :suggestions="suggestions"
        :loading="suggestionsLoading"
        :applied="suggestionApplied"
        :watches-screen="watchesScreen"
        :good-bits="goodBits"
        @apply="applySuggestion"
        @seek="seek"
        @reject="rejectThisSuggestion"
        @keep="keepAnchor"
      />

      <TimelineEditor
        class="shrink-0"
        v-model="range"
        :max-duration="duration"
        :duration="timecode(duration)"
        :start-time="timecode(range[0])"
        :end-time="timecode(range[1])"
        :length="timecode(trimmedLength)"
        :start-percentage="timeToPercentage(range[0])"
        :end-percentage="timeToPercentage(range[1])"
        :frame-strip-source="frameStripSource"
        :is-valid="isValidRange"
        :is-saving="isSaving"
        :save-progress="saveProgress"
        :playhead-percentage="timeToPercentage(currentTime)"
        :playhead="timecode(currentTime)"
        :is-playing="isPlaying"
        :good-bits="goodBits"
        :selected-good-bit-id="selectedGoodBitId"
        :slider-step="sliderStep"
        :frame-rate-text="frameRateText"
        :step-label="stepLabel"
        :length-sub="frameSpan(trimmedLength)"
        :handle-format="timecode"
        @save="handleSave"
        @toggle-playback="togglePlayback"
        @seek="scrubTo"
        @select-goodbit="selectGoodBit"
        @step-handle="stepHandle"
        @arm="(handle) => (armedHandle = handle)"
      />

      <!--
        Under the timeline, not beside the trim button.

        The handles pick a range and then there are two things to do with it,
        and only one of them replaces the recording. Putting the marking control
        in its own bar under the strip keeps the destructive one where it has
        always been, inside the timeline's own footer, rather than making two
        buttons of equal weight out of two decisions of very different weight.
      -->
      <GoodBitMarkBar
        class="shrink-0"
        :range="range"
        :selected="selectedGoodBit"
        :good-bits="goodBits"
        :saving="goodBitSaving"
        :clashes="clashes"
        :valid="isValidRange"
        @mark="markRange"
        @save="saveSelected"
        @deselect="selectedGoodBitId = null"
        @forget="removeGoodBit"
        @select="selectGoodBit"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
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
  type SuggestionEvent,
} from '../../services/clips';
import type { Clip } from '../../types/clip';
import type { ClipMeta } from '../../services/clips';
import { useToastStore } from '../../stores/toast';
import { streamUrl, frameStripUrl } from '../../utils/mediaUrl';
import { formatBytes } from '../../utils/formatters';
import { useTrimRange } from '../../composables/useTrimRange';
import { useVideoPlayer } from '../../composables/useVideoPlayer';
import { useFrameStep, type ArmedHandle } from '../../composables/useFrameStep';
import { TENTH_SEC } from '../../utils/frameRate';
import { useGoodBits } from '../../composables/useGoodBits';
import {
  anchorToGoodBit,
  goodBitLabel,
  goodBitsLostToTrim,
  overlapping,
} from '../../utils/goodBits';
import type { GoodBit } from '../../types/goodbit';
import VideoPreview from './VideoPreview.vue';
import TimelineEditor from './TimelineEditor.vue';
import SuggestionBanner from './SuggestionBanner.vue';
import GoodBitMarkBar from './GoodBitMarkBar.vue';

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

/*
 * ## Frames, which this page needs a frame rate to have
 *
 * `ClipMeta.fps` is ffprobe's own rational, `60/1` or `60000/1001`, and until
 * now it was read in one place, `ClipDetail/ClipFacts.vue`, as a line of text.
 * It is the number that makes an arrow key mean something here: one frame is
 * only a duration if you know the rate, and this library is 60 fps ultrawide
 * capture, so a control built on an assumed 30 would be off by half a frame
 * while looking exact.
 *
 * It arrives either way. The details panel has already probed the file and
 * hands the whole `ClipMeta` over, and `/trim/:id` opening cold fetches it
 * below. The watch is there because the two are not simultaneous: the panel
 * sets `clip` and then awaits the probe, so this can mount for a tick with the
 * prop still null.
 */
const frameRate = ref<string | null>(props.metadata?.fps ?? null);

watch(
  () => props.metadata,
  (metadata) => {
    if (!metadata) return;
    frameRate.value = metadata.fps;
    if (metadata.durationSec && !duration.value) initializeRange(metadata.durationSec);
  },
);

async function loadClipMetadata(): Promise<void> {
  try {
    const metadata = await getClipMeta(Number(props.id));
    frameRate.value = metadata.fps;
    initializeRange(metadata.durationSec || 0);
  } catch (error) {
    console.error('Failed to load clip metadata:', error);
  }
}

/** Which handle the arrow keys are moving, or null for the playhead. */
const armedHandle = ref<ArmedHandle>(null);

const {
  frameRateText,
  stepLabel,
  fps,
  stepHandle,
  timecode,
  frameSpan,
} = useFrameStep({
  frameRate,
  durationSec: duration,
  range,
  playhead: currentTime,
  seek: scrubTo,
  // Nothing moves while the file is being rewritten, for the same reason the
  // player is locked: the cut ends by renaming over this exact file.
  enabled: computed(() => !isSaving.value),
  armed: armedHandle,
});

/**
 * What a drag snaps to.
 *
 * The same grid the arrow keys use, so the two ways of moving a handle cannot
 * land on different places. A tenth when the rate is unknown, which is what the
 * slider did before frames existed.
 */
const sliderStep = computed(() => (fps.value === null ? TENTH_SEC : 1 / fps.value));

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

/*
 * ## GoodBits, marked with the same two handles
 *
 * The handles pick a range; a trim replaces the recording with it and a GoodBit
 * writes it down and leaves the recording whole. Sharing the control rather than
 * building a second one is the point: there is no other sensible way to choose a
 * start and an end on this screen, and a second range picker would be a second
 * place for them to disagree.
 *
 * Pressing a band on the strip puts the handles on that GoodBit, which makes
 * editing one the same gesture as marking one. `selectedGoodBitId` is what says
 * whether the bar below is marking or editing.
 */
const {
  goodBits,
  saving: goodBitSaving,
  load: loadGoodBits,
  mark,
  edit: editGoodBit,
  remove: forgetGoodBit,
} = useGoodBits(computed(() => Number(props.id)));

const selectedGoodBitId = ref<number | null>(null);

const selectedGoodBit = computed<GoodBit | null>(
  () => goodBits.value.find((row) => row.id === selectedGoodBitId.value) ?? null,
);

/**
 * A GoodBit that has gone takes the selection with it.
 *
 * The delete goes through a confirmation toast, so it happens later and it may
 * not happen at all. Watching the list rather than clearing the selection at
 * the press means a cancelled delete leaves the bar exactly as it was.
 *
 * A shallow watch is enough because the delete *replaces* the array rather than
 * splicing it, which is the only change that can remove the selected row. A
 * rename assigns into the array in place and deliberately does not fire this.
 */
watch(goodBits, (rows) => {
  if (selectedGoodBitId.value === null) return;
  if (!rows.some((row) => row.id === selectedGoodBitId.value)) selectedGoodBitId.value = null;
});

/** What the handles currently sit on top of, the selected one excepted. */
const clashes = computed(() =>
  overlapping(
    { startSec: range.value[0], endSec: range.value[1] },
    goodBits.value.filter((row) => row.id !== selectedGoodBitId.value),
  ),
);

function selectGoodBit(goodBit: GoodBit): void {
  selectedGoodBitId.value = goodBit.id;
  range.value = [goodBit.startSec, Math.min(goodBit.endSec, duration.value)];
  seek(goodBit.startSec);
}

/**
 * Marking leaves nothing selected, deliberately.
 *
 * Selecting what was just marked reads well for a second and then bites: the
 * next thing anybody does is move the handles to the next moment, and with that
 * GoodBit still selected the primary button would be *Save changes*, which
 * would move the one just made instead of marking a new one. Unselected, the
 * new band appears under the handles, the bar says that range is taken, and
 * moving a handle makes *Mark this range* live again.
 */
async function markRange(name: string | null): Promise<void> {
  if (!isValidRange.value) return;
  await mark({ startSec: range.value[0], endSec: range.value[1], name, source: 'manual' });
  selectedGoodBitId.value = null;
}

async function saveSelected(name: string | null): Promise<void> {
  const selected = selectedGoodBit.value;
  if (!selected) return;

  await editGoodBit(selected, {
    name,
    startSec: range.value[0],
    endSec: range.value[1],
  });
}

function removeGoodBit(goodBit: GoodBit): void {
  forgetGoodBit(goodBit);
}

/**
 * Keep one of the readings the game's own HUD produced.
 *
 * The strongest reading gets the window the server already placed around it, so
 * this and the banner's *Use it* agree about the same moment. Every other one
 * gets the lead-in and the tail. See `anchorToGoodBit`.
 */
async function keepAnchor(anchor: SuggestionEvent): Promise<void> {
  const isStrongest = suggestions.value?.anchors?.[0]?.atSec === anchor.atSec;
  const created = await mark(
    anchorToGoodBit(
      anchor,
      duration.value,
      isStrongest ? (suggestions.value?.window ?? null) : null,
    ),
  );
  // Put the handles on what was kept, so it can be adjusted while it is still
  // the thing being looked at. A detected range is a starting point.
  if (created) selectGoodBit(created);
}

async function handleSave(): Promise<void> {
  if (isSaving.value || !isValidRange.value) return;

  /*
   * A trim renumbers the timeline the GoodBits are written against.
   *
   * Keeping 0 to 10 seconds of a thirty second recording leaves a GoodBit
   * marked at 20 to 25 pointing outside the file, and one at 8 to 14 half in
   * it. Nothing corrects them: `TrimAndSwapClipAction` does not know the table
   * exists, so the rows survive the cut unchanged and are then wrong.
   *
   * This is a warning and not a fix, and the fix belongs where the cut happens.
   * What it buys is that somebody finds out before pressing rather than after,
   * which for the one irreversible operation in this app is worth a click.
   */
  const orphaned = goodBitsLostToTrim(goodBits.value, {
    startSec: range.value[0],
    endSec: range.value[1],
  });

  if (orphaned.length > 0) {
    toastStore.confirm(
      `${orphaned.map(goodBitLabel).join(', ')} ${orphaned.length === 1 ? 'is' : 'are'} outside this cut, and a trim replaces the recording. ${orphaned.length === 1 ? 'That mark' : 'Those marks'} will point at the wrong part of the file afterwards.`,
      () => void runTrim(),
      'Trim anyway?',
    );
    return;
  }

  await runTrim();
}

async function runTrim(): Promise<void> {
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
      `Kept ${timecode(result.actualStartSec)} to ${timecode(result.actualEndSec)}. ${size}`,
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
  /*
   * The marks on this clip, read fresh on every open.
   *
   * The trimmer and the details panel are the two surfaces that show GoodBits
   * and they are never mounted at the same time: the modal is keyed on the
   * view, so one replaces the other and each loads on mount. That is what keeps
   * them from disagreeing, and it is why there is no store here.
   */
  void loadGoodBits();
  // Nothing depends on this arriving; it only changes what the wait says.
  void getHudWatchedGames()
    .then((games) => {
      hudGames.value = games;
    })
    .catch(() => {});
});
</script>
