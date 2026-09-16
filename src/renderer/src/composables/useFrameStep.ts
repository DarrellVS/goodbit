import { computed, onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue';
import { useConfiguration } from './useConfiguration';
import type { TimeRange } from './useTrimRange';
import {
  TENTH_SEC,
  frameRateLabel,
  frameSpanLabel,
  formatTimecode,
  parseFrameRate,
  stepOnTenths,
  stepToFrameCentre,
  stepToFrameStart,
} from '../utils/frameRate';

/** Which of the three things on the timeline an arrow key is moving. */
export type StepSubject = 'start' | 'end' | 'playhead';

/** A handle, when one has keyboard focus. Null when neither has. */
export type ArmedHandle = 'start' | 'end' | null;

interface UseFrameStepOptions {
  /** ffprobe's own rational, straight off `ClipMeta.fps`. Null until it arrives. */
  frameRate: Ref<string | null | undefined> | ComputedRef<string | null | undefined>;
  durationSec: Ref<number>;
  range: Ref<TimeRange>;
  /** Where the preview is, as the player reports it. */
  playhead: Ref<number>;
  /** Move the preview anywhere in the clip. `useVideoPlayer`'s `scrubTo`. */
  seek: (sec: number) => void;
  /** False while the file is being rewritten, when nothing should move. */
  enabled: Ref<boolean> | ComputedRef<boolean>;
  /** Which handle has keyboard focus, reported by the component that draws them. */
  armed: Ref<ArmedHandle>;
}

/**
 * Stepping the trim page by one frame, and saying where it landed.
 *
 * The backend cuts to the frame. `TrimAndSwapClipAction` re-encodes in both
 * modes this page can reach precisely so that asking for 4.5s to 12.8s gets
 * 4.5s to 12.8s, and the slider above it was picking in tenths and printing
 * `12.3s`. This is the other half of that accuracy arriving at the input.
 *
 * ## Why these keys are not in `SHORTCUT_ACTIONS`
 *
 * The same two reasons `useSelectAllShortcut` gives, plus one of its own.
 * `useKeyboardShortcuts` matches on `event.code` with no notion of modifiers,
 * and these want Shift for a ten frame jump; one code carries three actions
 * here, chosen by what has focus, which a one-handler-per-key map cannot say;
 * and the arrows are already spoken for by the library underneath. That last
 * one is the reason for the capture phase, below.
 *
 * It is a composable with `onMounted` and `onBeforeUnmount` for the reason
 * `useSelectAllShortcut` exists: the library's Ctrl+A was registered during
 * setup and never removed, so after one visit it fired anywhere in the app.
 * These listeners live and die with the trim panel.
 *
 * ## Why the capture phase, and why it stops the event dead
 *
 * The trim panel is mounted inside `ClipDetailModal`, which opens *over*
 * `ClipsPage`, which is still mounted and still has `ArrowLeft` and
 * `ArrowRight` bound to its own paging through `useClipListKeyboardShortcuts`.
 * Both listeners sit on `document`, and the library's was registered first, so
 * it runs first: `stopImmediatePropagation` from a bubble listener would be too
 * late and `preventDefault` would not stop it at all. A capture listener on
 * `document` runs before every bubble listener on it, so that is where this
 * has to be, and it stops the event there rather than letting a frame step
 * also page the library behind the dialog.
 *
 * It only claims a key it actually acted on, so nothing else changes.
 */
export function useFrameStep(options: UseFrameStepOptions) {
  const config = useConfiguration();

  /** The rate, or null when nothing has told us one. Never a guess. */
  const fps = computed(() => parseFrameRate(options.frameRate.value));

  const hasFrameRate = computed(() => fps.value !== null);

  /** `60 fps`, or null, which the timeline turns into "frame rate unknown". */
  const frameRateText = computed(() => frameRateLabel(fps.value));

  /** How much one press moves, for the hint text beside the handles. */
  const stepLabel = computed(() => (fps.value === null ? 'a tenth of a second' : 'one frame'));

  /**
   * What we last asked the player for.
   *
   * This is the whole of the anti-drift, and it is about the element rather
   * than about the arithmetic. Adding `1/fps` to a float repeatedly barely
   * drifts at all: a hundred thousand presses at 60 fps come out 1.2
   * nanoseconds off, which is 7e-8 of a frame. What does drift is reading the
   * position back from `<video>` between presses, because each read is the
   * player's own snapped answer and the next step would start from it. So a
   * step starts from what was *requested*, not from where the player landed,
   * and N presses move exactly N frames.
   *
   * The player is still believed when it disagrees by more than three quarters
   * of a frame, which means playback ran, or the strip was scrubbed, or the
   * file genuinely could not land where it was asked. Re-anchoring on the truth
   * is right in all three: a model that quietly disagrees with the picture is
   * worse than one that gives up its history.
   */
  let requested: number | null = null;

  function anchor(): number {
    if (requested === null) return options.playhead.value;
    const tolerance = 0.75 * (fps.value === null ? TENTH_SEC : 1 / fps.value);
    return Math.abs(options.playhead.value - requested) <= tolerance
      ? requested
      : options.playhead.value;
  }

  /** Move the preview, by frames when the rate is known and by tenths when it is not. */
  function stepPlayhead(delta: number): void {
    if (!options.enabled.value || !(options.durationSec.value > 0)) return;

    const from = anchor();
    const to =
      fps.value === null
        ? stepOnTenths(from, delta, options.durationSec.value)
        : stepToFrameCentre(from, delta, fps.value, options.durationSec.value);

    requested = to;
    options.seek(to);
  }

  /**
   * Move one handle, and leave the other alone.
   *
   * No anchor bookkeeping here: a handle's time is a number this app owns
   * rather than one a decoder answers, so quantise, add the integer, convert
   * back, and it is exact every time.
   *
   * The handles are allowed to meet but not to cross. The range slider sorts
   * its two values, so a start pushed past an end would silently become the
   * end, which is a handle changing identity under the key that was moving it.
   *
   * **Nothing seeks the preview here, deliberately.** `useVideoPlayer` watches
   * the range and parks the playhead on its start whenever it changes, which is
   * exactly right for the start handle and puts the preview at the in point
   * rather than the out point for the end one. Seeking to the out frame instead
   * would land within `LOOP_THRESHOLD` of the end, and that branch resets to the
   * start *and starts playing* if the player is paused, so nudging the out point
   * would begin playback. Making that loop frame aware is a change to playback
   * rather than to stepping and it wants somebody who can watch it loop.
   */
  function stepHandle(which: 'start' | 'end', delta: number): void {
    if (!options.enabled.value || !(options.durationSec.value > 0)) return;

    const [start, end] = options.range.value;
    const from = which === 'start' ? start : end;
    const to =
      fps.value === null
        ? stepOnTenths(from, delta, options.durationSec.value)
        : stepToFrameStart(from, delta, fps.value, options.durationSec.value);

    if (which === 'start') options.range.value = [Math.min(to, end), end];
    else options.range.value = [start, Math.max(to, start)];
  }

  /** The arrows move whichever handle has focus, and the preview when neither has. */
  function subject(): StepSubject {
    return options.armed.value ?? 'playhead';
  }

  function step(delta: number): void {
    const target = subject();
    if (target === 'playhead') stepPlayhead(delta);
    else stepHandle(target, delta);
  }

  function handle(event: KeyboardEvent): void {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!config.public.value.enableKeyboardShortcuts) return;
    if (!options.enabled.value) return;

    // Whatever is being typed in owns its own arrow keys, and the GoodBit name
    // field sits on this screen.
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || /^(input|textarea|select)$/i.test(target?.tagName ?? '')) {
      return;
    }

    // So does an open dropdown, where the arrows move the highlighted option.
    // There is none on this screen today; this is one line against the day
    // there is, because taking the event before it reaches one would leave a
    // list that opens and cannot be walked.
    if (target?.closest?.('[role="listbox"], [role="combobox"]')) return;

    // Ten at a time with Shift, which is the multiplier the range slider uses
    // for the same gesture, so the two do not disagree.
    const size = event.shiftKey ? 10 : 1;
    const delta = event.code === 'ArrowRight' ? size : -size;

    event.preventDefault();
    // See the note above: the library underneath has these keys too, and it
    // registered first.
    event.stopImmediatePropagation();
    step(delta);
  }

  onMounted(() => document.addEventListener('keydown', handle, { capture: true }));
  onBeforeUnmount(() => document.removeEventListener('keydown', handle, { capture: true }));

  /** A time, written to the frame, or to hundredths when there is no rate. */
  function timecode(sec: number): string {
    return formatTimecode(sec, fps.value);
  }

  /** `492 frames`, or null when the rate is unknown and the count would be a guess. */
  function frameSpan(lengthSec: number): string | null {
    return frameSpanLabel(lengthSec, fps.value);
  }

  return {
    fps,
    hasFrameRate,
    frameRateText,
    stepLabel,
    stepPlayhead,
    stepHandle,
    timecode,
    frameSpan,
  };
}
