import { ref, watch, onBeforeUnmount, type Ref, shallowRef } from 'vue';
import { EDITOR_CONSTANTS } from '../constants/editor';
import type { TimelineClip } from '../types/editor';

/**
 * Preview playback for the editor timeline.
 *
 * Two things shape this:
 *
 * 1. The video element is the clock. While playing, the timeline position is
 *    read *from* the element and never written back to it. Writing
 *    `currentTime` on a loop cancels the seek already in flight, so the element
 *    never finishes loading and playback sticks on a stale frame — pausing
 *    releases it, because the loop stops.
 *
 * 2. Playback is double buffered. Assigning a new `src` to a video element
 *    clears the frame it is showing, which flashes the background between
 *    clips. So there are two elements: one plays while the other loads and
 *    pre-seeks the next clip, and at the boundary they swap. The incoming
 *    element already has a decoded frame, so nothing blanks.
 */

/** Slack for float comparisons against clip boundaries. */
const EPSILON = 0.02;
const HAVE_METADATA = 1;
const HAVE_CURRENT_DATA = 2;
/** A stall this long during a transition gives up and shows the spinner. */
const PREPARE_TIMEOUT_MS = EDITOR_CONSTANTS.VIDEO_LOAD_TIMEOUT_MS;

type Slot = 0 | 1;

export function useEditorVideoPlayback(
  clips: Ref<readonly TimelineClip[]>,
  currentTime: Ref<number>,
  playing: Ref<boolean>,
  duration: Ref<number>
) {
  const videoA = shallowRef<HTMLVideoElement | null>(null);
  const videoB = shallowRef<HTMLVideoElement | null>(null);
  /** Which element is on screen and playing. */
  const activeSlot = ref<Slot>(0);
  const activeClip = shallowRef<TimelineClip | null>(null);
  const isBuffering = ref(false);

  let animationFrameId: number | null = null;
  let sortedClips: readonly TimelineClip[] = [];
  /** Clip each slot currently holds, and the src assigned to it. */
  const slotClipId: [string | null, string | null] = [null, null];
  const slotSrc: [string, string] = ['', ''];
  /** Invalidates a load whose events arrive after we moved on. */
  const slotToken: [number, number] = [0, 0];
  /** Stops the frame loop from firing a transition repeatedly while it runs. */
  let transitioning = false;
  /** Identifies the newest goToClip, so a superseded one cannot clear the spinner. */
  let transitionSeq = 0;

  const elementFor = (slot: Slot) => (slot === 0 ? videoA.value : videoB.value);
  const otherSlot = (slot: Slot): Slot => (slot === 0 ? 1 : 0);
  const activeElement = () => elementFor(activeSlot.value);

  function updateSortedClips(): void {
    sortedClips = [...clips.value].sort((a, b) => a.startTime - b.startTime);
  }

  function findClipAtTime(time: number): TimelineClip | null {
    let left = 0;
    let right = sortedClips.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const clip = sortedClips[mid];

      if (time >= clip.startTime && time < clip.startTime + clip.duration) return clip;
      if (time < clip.startTime) right = mid - 1;
      else left = mid + 1;
    }

    return null;
  }

  function clipAfter(clip: TimelineClip): TimelineClip | null {
    const index = sortedClips.findIndex((c) => c.id === clip.id);
    return index === -1 ? null : sortedClips[index + 1] ?? null;
  }

  function applyVolume(video: HTMLVideoElement, clip: TimelineClip): void {
    const target = clip.muted ? 0 : clip.volume;
    if (Math.abs(video.volume - target) > 0.01) video.volume = target;
    video.muted = clip.muted;
  }

  /** Resolves false if the load was superseded, errored, or stalled. */
  function waitFor(
    video: HTMLVideoElement,
    event: 'loadedmetadata' | 'seeked' | 'canplay',
    slot: Slot,
    token: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        video.removeEventListener(event, onEvent);
        video.removeEventListener('error', onError);
        resolve(ok && token === slotToken[slot]);
      };

      const onEvent = () => finish(true);
      const onError = () => finish(false);
      const timer = window.setTimeout(() => finish(false), PREPARE_TIMEOUT_MS);

      video.addEventListener(event, onEvent, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  /**
   * Get `slot` showing `clip` at `offset`, decoded and ready to play.
   * Never touches the active element unless `slot` is the active one.
   */
  async function prepare(slot: Slot, clip: TimelineClip, offset: number): Promise<boolean> {
    const video = elementFor(slot);
    if (!video) return false;

    const token = ++slotToken[slot];

    if (slotSrc[slot] !== clip.videoUrl) {
      slotSrc[slot] = clip.videoUrl;
      slotClipId[slot] = null;
      video.src = clip.videoUrl;
      video.load();
      if (!(await waitFor(video, 'loadedmetadata', slot, token))) return false;
    } else if (video.readyState < HAVE_METADATA) {
      if (!(await waitFor(video, 'loadedmetadata', slot, token))) return false;
    }

    const target = Math.min(Math.max(offset, clip.trimStart), clip.trimEnd);
    if (Math.abs(video.currentTime - target) > EPSILON) {
      video.currentTime = target;
      if (!(await waitFor(video, 'seeked', slot, token))) return false;
    }

    // Wait for an actual decoded frame, or the swap would still show a blank.
    if (video.readyState < HAVE_CURRENT_DATA) {
      if (!(await waitFor(video, 'canplay', slot, token))) return false;
    }

    if (token !== slotToken[slot]) return false;

    applyVolume(video, clip);
    slotClipId[slot] = clip.id;
    return true;
  }

  /** Put `slot` on screen. The outgoing element keeps its frame, so no blank. */
  function swapTo(slot: Slot, clip: TimelineClip): void {
    const outgoing = activeElement();

    activeSlot.value = slot;
    activeClip.value = clip;

    const incoming = elementFor(slot);
    if (outgoing && outgoing !== incoming) outgoing.pause();
    if (incoming && playing.value) incoming.play().catch(() => {});

    isBuffering.value = false;
  }

  /** Warm the idle element with whatever comes next, so the swap is instant. */
  async function stageNext(): Promise<void> {
    const clip = activeClip.value;
    if (!clip) return;

    const next = clipAfter(clip);
    if (!next) return;

    const slot = otherSlot(activeSlot.value);
    if (slotClipId[slot] === next.id) return;

    await prepare(slot, next, next.trimStart);
  }

  /** Show `clip` at `timelineTime`, swapping elements so nothing blanks. */
  async function goToClip(clip: TimelineClip, timelineTime: number): Promise<void> {
    const offset = clip.trimStart + (timelineTime - clip.startTime);
    const idle = otherSlot(activeSlot.value);

    // Already staged and decoded — swap immediately.
    const staged = elementFor(idle);
    if (
      slotClipId[idle] === clip.id &&
      staged &&
      staged.readyState >= HAVE_CURRENT_DATA &&
      Math.abs(staged.currentTime - offset) <= EPSILON
    ) {
      swapTo(idle, clip);
      void stageNext();
      return;
    }

    // First clip of the session: nothing is on screen yet, so load in place.
    const target: Slot = activeClip.value === null ? activeSlot.value : idle;
    const seq = ++transitionSeq;

    isBuffering.value = true;
    const ready = await prepare(target, clip, offset);

    // A newer transition owns the spinner now; leave it alone.
    if (seq !== transitionSeq) return;

    if (ready) {
      swapTo(target, clip);
      void stageNext();
    } else {
      // Superseded, errored or timed out — do not strand the spinner.
      isBuffering.value = false;
    }
  }

  function handlePlaybackFrame(): void {
    if (!playing.value) return;

    const video = activeElement();
    const clip = activeClip.value;

    if (video && clip && !transitioning && slotClipId[activeSlot.value] === clip.id) {
      if (video.ended || video.currentTime >= clip.trimEnd - EPSILON) {
        const next = clipAfter(clip);

        if (!next) {
          currentTime.value = duration.value;
          playing.value = false;
          return;
        }

        transitioning = true;
        currentTime.value = next.startTime;
        void goToClip(next, next.startTime).finally(() => {
          transitioning = false;
        });
      } else {
        const elapsed = Math.max(0, video.currentTime - clip.trimStart);
        currentTime.value = Math.min(clip.startTime + elapsed, duration.value);

        isBuffering.value = video.readyState < HAVE_CURRENT_DATA;
        if (video.paused) video.play().catch(() => {});
        applyVolume(video, clip);
      }
    }

    animationFrameId = requestAnimationFrame(handlePlaybackFrame);
  }

  /** Scrubbing while paused. Playback drives currentTime itself. */
  function handleSeek(): void {
    if (playing.value || transitioning) return;

    const clip = findClipAtTime(currentTime.value);
    if (!clip) return;

    if (!activeClip.value || activeClip.value.id !== clip.id) {
      void goToClip(clip, currentTime.value);
      return;
    }

    const video = activeElement();
    if (!video || video.readyState < HAVE_METADATA) return;

    const target = clip.trimStart + (currentTime.value - clip.startTime);
    if (Math.abs(video.currentTime - target) > EDITOR_CONSTANTS.PLAYBACK_SYNC_THRESHOLD) {
      video.currentTime = Math.min(Math.max(target, clip.trimStart), clip.trimEnd);
    }
    applyVolume(video, clip);
  }

  function togglePlayback(): void {
    playing.value = !playing.value;
  }

  function skipForward(seconds: number = EDITOR_CONSTANTS.SKIP_SECONDS): void {
    currentTime.value = Math.min(currentTime.value + seconds, duration.value);
  }

  function skipBackward(seconds: number = EDITOR_CONSTANTS.SKIP_SECONDS): void {
    currentTime.value = Math.max(currentTime.value - seconds, 0);
  }

  watch(playing, (isPlaying) => {
    if (isPlaying) {
      const clip = findClipAtTime(currentTime.value);

      if (clip && (!activeClip.value || activeClip.value.id !== clip.id)) {
        void goToClip(clip, currentTime.value);
      } else {
        activeElement()?.play().catch(() => {});
        void stageNext();
      }

      animationFrameId = requestAnimationFrame(handlePlaybackFrame);
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      activeElement()?.pause();
      isBuffering.value = false;
    }
  });

  watch(currentTime, handleSeek);

  watch(
    clips,
    () => {
      updateSortedClips();

      // Trimming or moving replaces clip objects, so a held reference goes
      // stale. Re-resolve by id rather than reloading the source.
      const current = activeClip.value;
      if (current) {
        const fresh = sortedClips.find((c) => c.id === current.id) ?? null;
        activeClip.value = fresh;
        if (!fresh) {
          slotClipId[activeSlot.value] = null;
          slotSrc[activeSlot.value] = '';
        }
      }

      // What comes next may have changed; let it be staged again.
      const idle = otherSlot(activeSlot.value);
      slotClipId[idle] = null;

      if (clips.value.length && !playing.value) handleSeek();
    },
    { immediate: true }
  );

  function resetSlot(slot: Slot): void {
    slotToken[slot]++;
    slotClipId[slot] = null;
    slotSrc[slot] = '';

    const video = elementFor(slot);
    if (!video) return;
    video.pause();
    // Setting src to '' makes the browser request the page URL as media.
    video.removeAttribute('src');
    video.load();
  }

  watch([videoA, videoB], () => {
    if (!videoA.value || !videoB.value) return;
    if (activeClip.value) void goToClip(activeClip.value, currentTime.value);
    else if (clips.value.length && !playing.value) handleSeek();
  });

  onBeforeUnmount(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resetSlot(0);
    resetSlot(1);
  });

  return {
    videoA,
    videoB,
    activeSlot,
    activeClip,
    isBuffering,
    togglePlayback,
    skipForward,
    skipBackward,
  };
}
