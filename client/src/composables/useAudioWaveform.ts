/**
 * Peak data for drawing a waveform on the editor's music lane.
 *
 * Decoding costs a full download plus a decode, so peaks are computed once per
 * URL and cached for the life of the page. Callers get a promise, which also
 * collapses the stampede when the same track is placed several times.
 */

const PEAK_BUCKETS = 900;

const cache = new Map<string, Promise<Float32Array | null>>();

let sharedContext: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (sharedContext) return sharedContext;

  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  sharedContext = new Ctor();
  return sharedContext;
}

async function computePeaks(url: string): Promise<Float32Array | null> {
  const context = audioContext();
  if (!context) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(samples.length / PEAK_BUCKETS));
    const peaks = new Float32Array(PEAK_BUCKETS);

    for (let bucket = 0; bucket < PEAK_BUCKETS; bucket++) {
      const start = bucket * bucketSize;
      const end = Math.min(start + bucketSize, samples.length);
      let peak = 0;

      for (let i = start; i < end; i++) {
        const value = Math.abs(samples[i]);
        if (value > peak) peak = value;
      }

      peaks[bucket] = peak;
    }

    return peaks;
  } catch (error) {
    console.error('Failed to build waveform peaks:', error);
    return null;
  }
}

export function loadWaveformPeaks(url: string): Promise<Float32Array | null> {
  let pending = cache.get(url);

  if (!pending) {
    pending = computePeaks(url);
    cache.set(url, pending);
  }

  return pending;
}
