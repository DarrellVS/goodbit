import type { NotchChime } from '@shared/notch';

/**
 * The chimes, unchanged from the corner card the notch replaced, so somebody
 * who has heard them a hundred times hears the same thing.
 *
 * The clip pair: C5 quietly the moment it starts, then C6 into E6 once it is
 * safe. The same note an octave up and then a third above it, so the two read
 * as one gesture split in two. The sweep: a rising G major triad an octave
 * below, three notes against two, round rather than bright because it only
 * plays once a game has closed.
 *
 * Synthesised: nothing to ship, nothing to decode, and the exponential tail is
 * what stops a sine from clicking at both ends.
 */
const VOICES: Record<NotchChime, Array<{ hz: number; at: number; peak: number; tail: number }>> = {
  saving: [{ hz: 523.25, at: 0, peak: 0.3, tail: 0.13 }],
  saved: [
    { hz: 1046.5, at: 0, peak: 0.6, tail: 0.2 },
    { hz: 1318.5, at: 0.085, peak: 0.6, tail: 0.2 },
  ],
  found: [
    { hz: 392.0, at: 0, peak: 0.45, tail: 0.26 },
    { hz: 493.88, at: 0.075, peak: 0.45, tail: 0.26 },
    { hz: 587.33, at: 0.15, peak: 0.45, tail: 0.3 },
  ],
};

/**
 * Squared, because loudness is not heard linearly: half the slider is a
 * quarter of the amplitude, which is close to half as loud.
 */
function level(volume: number): number {
  const v = Math.max(0, Math.min(100, volume)) / 100;
  return v * v;
}

export function chime(kind: NotchChime, volume: number): void {
  const notes = VOICES[kind];
  const scale = level(volume);
  if (!notes || scale <= 0) return;

  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    for (const { hz, at, peak, tail } of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(peak * scale, now + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + tail);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + tail + 0.02);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    // No audio device. The picture is the point; the sound was the trimming.
  }
}
