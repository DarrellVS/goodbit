import { onBeforeUnmount, watch, type Ref } from 'vue';
import type { TimelineAudio, TimelineClip } from '@renderer/types/editor';

/**
 * Preview playback for the music lane.
 *
 * Wherever a video clip sits under the playhead the video element owns the
 * clock, and this only parks one `<audio>` element per placement at the right
 * offset and gain. Where no clip covers the playhead, music-only stretches,
 * or a timeline with no video at all. The video engine has nothing to drive
 * `currentTime` with, so this advances it off wall-clock instead. Without that
 * the music plays while the playhead stands still.
 */

/** While playing, seeking on small drift would stutter; only correct real slips. */
const PLAYING_DRIFT_SEC = 0.35;
const PAUSED_DRIFT_SEC = 0.05;
const HAVE_METADATA = 1;

export function useEditorAudioPlayback(
  audio: Ref<readonly TimelineAudio[]>,
  clips: Ref<readonly TimelineClip[]>,
  currentTime: Ref<number>,
  playing: Ref<boolean>,
  duration: Ref<number>
) {
  const elements = new Map<string, HTMLAudioElement>();

  let frameId: number | null = null;
  let lastTimestamp = 0;

  function elementFor(item: TimelineAudio): HTMLAudioElement {
    let element = elements.get(item.id);

    if (!element) {
      element = new Audio();
      element.preload = 'auto';
      element.src = item.url;
      elements.set(item.id, element);
    } else if (!element.src.endsWith(item.url) && element.src !== item.url) {
      element.src = item.url;
    }

    return element;
  }

  /** Volume at `local` seconds into the placement, fades applied. */
  function gainAt(item: TimelineAudio, local: number): number {
    let gain = item.volume;

    if (item.fadeIn > 0 && local < item.fadeIn) {
      gain *= local / item.fadeIn;
    }

    const fadeOutStart = item.duration - item.fadeOut;
    if (item.fadeOut > 0 && local > fadeOutStart) {
      gain *= (item.duration - local) / item.fadeOut;
    }

    return Math.max(0, Math.min(1, gain));
  }

  function release(element: HTMLAudioElement): void {
    element.pause();
    // Setting src to '' makes the browser request the page URL as media.
    element.removeAttribute('src');
    element.load();
  }

  function prune(): void {
    const live = new Set(audio.value.map((item) => item.id));

    for (const [id, element] of elements) {
      if (live.has(id)) continue;
      release(element);
      elements.delete(id);
    }
  }

  function sync(): void {
    const time = currentTime.value;
    const drift = playing.value ? PLAYING_DRIFT_SEC : PAUSED_DRIFT_SEC;

    for (const item of audio.value) {
      const element = elementFor(item);
      const local = time - item.startTime;
      const inside = local >= 0 && local < item.duration;

      if (!inside || item.muted) {
        if (!element.paused) element.pause();
        continue;
      }

      element.volume = gainAt(item, local);

      const target = item.trimStart + local;
      if (element.readyState >= HAVE_METADATA && Math.abs(element.currentTime - target) > drift) {
        element.currentTime = target;
      }

      if (playing.value) {
        if (element.paused) element.play().catch(() => {});
      } else if (!element.paused) {
        element.pause();
      }
    }
  }

  function coveredByVideo(time: number): boolean {
    return clips.value.some(
      (clip) => time >= clip.startTime && time < clip.startTime + clip.duration
    );
  }

  function stopClock(): void {
    if (frameId === null) return;
    cancelAnimationFrame(frameId);
    frameId = null;
  }

  function tick(timestamp: number): void {
    if (!playing.value) {
      frameId = null;
      return;
    }

    const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
    lastTimestamp = timestamp;

    // Hand the clock straight back whenever a clip is under the playhead: two
    // writers would fight, and the video element is the more accurate one.
    if (!coveredByVideo(currentTime.value)) {
      const next = currentTime.value + delta;

      if (next >= duration.value) {
        currentTime.value = duration.value;
        playing.value = false;
        frameId = null;
        return;
      }

      currentTime.value = next;
    }

    frameId = requestAnimationFrame(tick);
  }

  watch(currentTime, sync);

  watch(playing, (isPlaying) => {
    sync();

    if (!isPlaying) {
      stopClock();
      return;
    }

    lastTimestamp = 0;
    if (frameId === null) frameId = requestAnimationFrame(tick);
  });
  watch(
    audio,
    () => {
      prune();
      sync();
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    stopClock();
    for (const element of elements.values()) release(element);
    elements.clear();
  });

  return { sync };
}
