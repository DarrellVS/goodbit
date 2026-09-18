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
    <!--
      Two columns, the same two the details screen has: the picture and what
      you do to it on the left, and a 336px column beside it. The numbers are
      the details screen's own, so opening the trimmer from a clip does not
      move the furniture.

      Below `xl` the column drops underneath and the whole thing scrolls, which
      is what the details screen does at that width too.
    -->
    <main class="flex-1 min-h-0 w-full p-6 overflow-y-auto scroll-p-1.5 xl:overflow-hidden">
      <div
        class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-6 items-start xl:h-full xl:min-h-0"
      >
        <div class="min-w-0 flex flex-col gap-4 xl:h-full xl:min-h-0">
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
        :is-deleting="isDeleting"
        :save-progress="saveProgress"
        :playhead-percentage="timeToPercentage(currentTime)"
        :playhead="timecode(currentTime)"
        :is-playing="isPlaying"
        :good-bits="goodBits"
        :selected-good-bit-id="selectedGoodBitId"
        :suggested-bands="suggestedBands"
        :slider-step="sliderStep"
        :frame-rate-text="frameRateText"
        :step-label="stepLabel"
        :length-sub="frameSpan(trimmedLength)"
        :handle-format="timecode"
        @save="handleSave"
        @delete="handleDelete"
        @toggle-playback="togglePlayback"
        @seek="scrubTo"
        @select-goodbit="selectGoodBit"
        @keep-suggested="keepSuggestedBand"
        @step-handle="stepHandle"
        @arm="(handle) => (armedHandle = handle)"
      />

        </div>

        <!--
          The marks, beside the picture rather than under the timeline.

          They were a bar below the strip: a heading, a range readout that
          repeated the one directly above it, a name field and a button, all
          level with *Save Trimmed Clip* and in the same corner of the eye. The
          column is the details screen's own GoodBits list, in the details
          screen's own styling, so the same thing looks the same on both
          screens and the bottom of the trimmer has one filled button in it.
        -->
        <div v-if="clip" class="min-w-0 xl:h-full xl:min-h-0 xl:overflow-y-auto scroll-p-1.5">
          <ClipGoodBitsSection
            flush
            :clip="clip"
            :range="range"
            :selected-id="selectedGoodBitId"
            :dirty="selectedIsDirty"
            :busy="goodBitSaving"
            :can-mark="isValidRange && !alreadyMarked"
            :mark-hint="alreadyMarked ? 'This exact range is already marked' : null"
            @mark="markRange(null)"
            @select="selectGoodBit"
            @save="saveSelected"
            @deselect="selectedGoodBitId = null"
          />

          <!--
            Under the marks, because it is about the same clip and answers a
            later question: what to keep comes before what it should sound
            like. Both are the column's own sections, with the column's own
            rule between them.
          -->
          <ClipAudioSection
            class="mt-5"
            :tracks="audioTracks"
            :loading="audioLoading"
            :changed="audioChanged"
            :is-muted="audioIsMuted"
            :volume-of="audioVolumeOf"
            :disabled="fileIsClaimed"
            @toggle-mute="toggleAudioMute"
            @set-volume="setAudioVolume"
            @solo="soloAudio"
            @reset="resetAudio"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useClipsStore } from '@renderer/stores/clips';
import {
  deleteClip,
  getClip,
  getClipMeta,
  getClipSuggestions,
  getHudWatchedGames,
  rejectSuggestion,
  trimClip,
  updateClipName,
  type ClipSuggestions,
  type SuggestionEvent,
} from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';
import type { ClipMeta } from '@renderer/services/clips';
import { useToastStore } from '@renderer/stores/toast';
import { streamUrl, frameStripUrl } from '@renderer/utils/mediaUrl';
import { formatBytes } from '@renderer/utils/formatters';
import { useTrimRange } from '@renderer/composables/trim/useTrimRange';
import { useVideoPlayer } from '@renderer/composables/media/useVideoPlayer';
import { useFrameStep, type ArmedHandle } from '@renderer/composables/trim/useFrameStep';
import { TENTH_SEC } from '@renderer/utils/frameRate';
import { useGoodBits } from '@renderer/composables/clips/useGoodBits';
import {
  anchorToGoodBit,
  goodBitLabel,
  goodBitsLostToTrim,
  momentCovered,
  overlapping,
  sameRange,
} from '@renderer/utils/goodBits';
import type { GoodBit } from '@renderer/types/goodbit';
import VideoPreview from './VideoPreview.vue';
import TimelineEditor from './TimelineEditor.vue';
import SuggestionBanner from './SuggestionBanner.vue';
import type { SuggestedBand } from './GoodBitBands.vue';
import ClipGoodBitsSection from '@renderer/components/ClipDetail/ClipGoodBitsSection.vue';
import ClipAudioSection from '@renderer/components/ClipDetail/ClipAudioSection.vue';
import { useClipAudio } from '@renderer/composables/clips/useClipAudio';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { clipDeleteQuestion, clipTitle } from '@renderer/utils/clipDeleteQuestion';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

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
const emit = defineEmits<{ (e: 'saved'): void; (e: 'deleted'): void }>();

/*
 * Whether a delete asks first.
 *
 * `confirmBeforeDelete` in Settings, Data, which is the same switch the
 * library's own delete reads. One setting, so somebody who turned the question
 * off because they delete in batches does not meet it again here, and somebody
 * who left it on is not surprised by a trimmer that deletes on one press.
 */
const config = useConfiguration();

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
const isDeleting = ref(false);

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

/**
 * The file is about to be claimed, so the preview lets go of it.
 *
 * The cut replaces this exact file, by renaming over it, and a delete moves it
 * to the Recycle Bin. Holding it open until then is how either one fails, so
 * both count, and the lock is the pair rather than the trim alone.
 */
const fileIsClaimed = computed(() => isSaving.value || isDeleting.value);

const { currentTime, isPlaying, togglePlayback, seek, scrubTo } = useVideoPlayer({
  videoElement,
  range,
  locked: fileIsClaimed,
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


/**
 * The clip's own audio tracks, and what has been decided about them.
 *
 * Almost always one track, in which case the section is a mute and a level for
 * the whole soundtrack. A recording made through GoodBit's multi-track OBS
 * setup carries one per source, and then this is where a loud voice chat stops
 * being the whole clip.
 */
const {
  tracks: audioTracks,
  loading: audioLoading,
  changed: audioChanged,
  selection: audioSelection,
  isMuted: audioIsMuted,
  volumeOf: audioVolumeOf,
  toggleMute: toggleAudioMute,
  setVolume: setAudioVolume,
  solo: soloAudio,
  reset: resetAudio,
  reload: reloadAudio,
} = useClipAudio(computed(() => props.id));

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

    /*
     * Take the suggestion, rather than offering it and asking for a drag.
     *
     * The button that gets here is called "Trim to the good bit" and the
     * screen it opened said "Drag the handles to keep the good bit", with the
     * handles still at both ends and the answer sitting unused in a banner
     * beside them. A button that promises a result and hands over homework is
     * the complaint every walkthrough user arrived at independently.
     *
     * Only when the handles have not been touched, so this can never overwrite
     * a range somebody chose: a full-width range is the untouched state, and
     * anything narrower means they have already started. The banner reads
     * "Applied" the moment it lands, "Wrong" still rejects it, and both handles
     * still drag, so nothing is taken away by starting from the answer.
     */
    const window = suggestions.value?.window;
    const untouched =
      duration.value > 0 &&
      range.value[0] <= FRAME_SLOP &&
      range.value[1] >= duration.value - FRAME_SLOP;

    if (window && untouched) applySuggestion(window.start, window.end);
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

/**
 * Whether this exact range is already marked.
 *
 * The one overlap worth stopping rather than remarking on: it is never
 * deliberate, and it leaves two identical rows that differ only by id.
 * Overlaps in general are fine and common, which is why the bands stack.
 */
const alreadyMarked = computed(
  () =>
    selectedGoodBitId.value === null &&
    clashes.value.some((other) =>
      sameRange({ startSec: range.value[0], endSec: range.value[1] }, other),
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

/**
 * Write the moved handles back to the row they were borrowed from.
 *
 * The range only. The name is edited on the row itself, the way it is on the
 * details screen, so sending one from here would send whatever this screen
 * last knew about it and quietly undo a rename made two seconds ago.
 */
async function saveSelected(): Promise<void> {
  const selected = selectedGoodBit.value;
  if (!selected) return;

  await editGoodBit(selected, {
    startSec: range.value[0],
    endSec: range.value[1],
  });
}

/**
 * Whether the handles have moved off the row they were put on.
 *
 * What makes *Save range* live. A rename is not in here: that is saved on the
 * row as it is typed, and this screen never holds an unsaved copy of a name.
 */
const selectedIsDirty = computed(() => {
  const selected = selectedGoodBit.value;
  if (!selected) return false;
  return !sameRange({ startSec: range.value[0], endSec: range.value[1] }, selected, 0.05);
});

/**
 * Keep one of the readings the game's own HUD produced.
 *
 * Each one gets its own lead-in and tail. It used to be that the strongest got
 * the window the server had placed, so that this and *Use it* agreed about the
 * same moment; that window now spans every reading in the clip, and handing it
 * to one of them would mark the whole span as a single moment. The chips only
 * appear when there are several, so what they have to agree with is each
 * other. See `anchorToGoodBit`.
 */
async function keepAnchor(anchor: SuggestionEvent): Promise<void> {
  const created = await mark(anchorToGoodBit(anchor, duration.value, null));
  // Put the handles on what was kept, so it can be adjusted while it is still
  // the thing being looked at. A detected range is a starting point.
  if (created) selectGoodBit(created);
}

/**
 * The readings drawn as outlines along the strip, and what pressing one does.
 *
 * Only when there are several. One reading is what the handles are already
 * sitting on, and an outline around the handles says nothing that the handles
 * do not.
 */
const offeredAnchors = computed<SuggestionEvent[]>(() => {
  const anchors = suggestions.value?.anchors ?? [];
  if (anchors.length < 2) return [];
  return [...anchors]
    // One that has already been kept is drawn as a kept band, by the row it
    // wrote. Leaving the outline there as well would draw the same moment
    // twice and offer to keep it again.
    .filter((anchor) => !momentCovered(anchor.atSec, goodBits.value))
    .sort((a, b) => a.atSec - b.atSec);
});

function anchorKey(anchor: SuggestionEvent): string {
  return `${anchor.kind}-${anchor.atSec}`;
}

const suggestedBands = computed<SuggestedBand[]>(() =>
  offeredAnchors.value.map((anchor) => {
    const range = anchorToGoodBit(anchor, duration.value, null);
    return {
      key: anchorKey(anchor),
      startSec: range.startSec,
      endSec: range.endSec,
      reason: anchor.reason,
      name: range.name ?? null,
    };
  }),
);

function keepSuggestedBand(band: SuggestedBand): void {
  const anchor = offeredAnchors.value.find((candidate) => anchorKey(candidate) === band.key);
  if (anchor) void keepAnchor(anchor);
}

/**
 * Close enough to an edge to mean "I did not move this handle".
 *
 * A twentieth of a second, which is comfortably under one frame at 60fps and
 * comfortably over the float error that comes back from a dragged handle.
 */
const FRAME_SLOP = 0.05;

async function handleSave(): Promise<void> {
  if (isSaving.value || !isValidRange.value) return;

  /*
   * Refuse a cut that is the whole recording.
   *
   * "Save Trimmed Clip" with the handles untouched replaced the file with
   * itself: a full re-encode, over the only copy, for no change in content. A
   * walkthrough user did exactly that and watched a 104 KB recording become
   * 308 KB, with no question asked, because the confirmation below only fires
   * when a mark is at risk.
   *
   * Refused rather than confirmed. There is no version of this the person
   * wanted, so asking them to approve it would be asking them to approve
   * nothing happening, slowly and destructively.
   */
  const whole = duration.value;
  if (whole > 0 && range.value[0] <= FRAME_SLOP && range.value[1] >= whole - FRAME_SLOP) {
    toastStore.info(
      'Drag a handle, or take the suggestion, to choose the part worth keeping.',
      'That is the whole clip',
    );
    return;
  }

  /*
   * A trim renumbers the timeline the GoodBits are written against.
   *
   * The cut itself now carries them: marks inside it shift, marks across its
   * edge are clamped, and marks outside it are removed, in
   * `TrimAndSwapClipAction`. So this is no longer a warning about rows going
   * wrong, it is a warning about rows going away, which is the one part a
   * person cannot undo and cannot see coming.
   */
  const orphaned = goodBitsLostToTrim(goodBits.value, {
    startSec: range.value[0],
    endSec: range.value[1],
  });

  if (orphaned.length > 0) {
    confirmAction(
      `${orphaned.map(goodBitLabel).join(', ')} ${orphaned.length === 1 ? 'is' : 'are'} outside this cut, and a trim replaces the recording. ${orphaned.length === 1 ? 'That mark will be removed' : 'Those marks will be removed'} with the footage ${orphaned.length === 1 ? 'it names' : 'they name'}.`,
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
    /*
     * The mode is still the setting's to choose, so it is left out.
     *
     * The selection is not: leaving it out means "nobody looked", which is a
     * different command from "every track as recorded" and is the one that
     * copies rather than rebuilds.
     */
    const result = await trimClip(
      Number(props.id),
      startTime,
      endTime,
      undefined,
      audioSelection.value,
    );
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
    // The cut rewrote the file, and a selection is written into it: a muted
    // track is not in there any more, so the list this screen is showing is a
    // description of a file that no longer exists.
    resetAudio();
    await reloadAudio();
    // The cut rewrote the file, so the details behind this need re-reading.
    emit('saved');
  } catch (error) {
    console.error('Failed to trim clip:', error);
    toastStore.error((error as Error).message || 'Could not trim this clip');
  } finally {
    isSaving.value = false;
  }
}

/**
 * What the question says about this clip, from `clipDeleteQuestion`.
 *
 * The wording rules live in a pure function so `tests/unit` owns them; this is
 * only the reading of what the panel currently has in hand.
 */
const deleteQuestion = computed(() =>
  clipDeleteQuestion({
    markCount: goodBits.value.length,
    notes: clip.value?.notes,
    tagCount: clip.value?.tags?.length,
    displayName: clip.value?.displayName,
  }),
);

/** What to call this clip in the question's title. */
const clipName = computed(() => clipTitle(clip.value));

/**
 * The whole recording goes, from the screen that exists to keep part of it.
 *
 * Reaching that conclusion here is ordinary: the trimmer is where somebody
 * watches a clip end to end deciding what is worth cutting, and "none of it"
 * is one of the answers that inspection produces. Before this it was the one
 * answer the screen could not act on, so it cost backing out to the library,
 * finding the tile again and opening its menu.
 *
 * The question, and whether there is one, are decided here rather than in the
 * timeline strip: this is what knows the clip, what it carries and what the
 * setting says.
 */
function handleDelete(): void {
  if (isSaving.value || isDeleting.value) return;

  if (!config.public.value.confirmBeforeDelete) {
    void runDelete();
    return;
  }

  confirmAction(
    deleteQuestion.value,
    () => void runDelete(),
    `Delete ${clipName.value}?`,
    { confirmLabel: 'Delete', icon: 'material-symbols:delete-outline-rounded' },
  );
}

async function runDelete(): Promise<void> {
  if (isSaving.value || isDeleting.value) return;

  isDeleting.value = true;

  try {
    /*
     * The preview is already off the file: `isDeleting` is part of
     * `fileIsClaimed`, which pauses the `<video>` and stops the loop putting it
     * straight back. Setting the flag before the call rather than after is what
     * makes that true, and is the same order the cut uses.
     */
    await deleteClip(Number(props.id));

    toastStore.success('Clip moved to Recycle Bin');

    /*
     * Close first, then refresh.
     *
     * The panel is showing a clip that no longer exists, so every moment it
     * stays up is a moment its buttons can be pressed against a missing row.
     * The library underneath is refreshed after, and would have been anyway:
     * the watcher sees the file leave and fires `clip-removed`. Doing it here
     * as well makes it immediate rather than dependent on a filesystem event.
     */
    emit('deleted');

    clipsStore.resetPagination();
    await clipsStore.fetchClips(false);
  } catch (error) {
    console.error('Failed to delete clip:', error);
    toastStore.error((error as Error).message || 'Could not delete this clip');
  } finally {
    isDeleting.value = false;
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
