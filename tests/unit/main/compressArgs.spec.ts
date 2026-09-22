import { describe, expect, it } from 'vitest';
import {
  MIN_SAVING_FRACTION,
  planCompression,
  sameLength,
  worthKeeping,
} from '../../../src/main/services/compress.js';
import { TONEMAP_FILTER, type ProbeInfo } from '../../../src/main/services/encoders.js';

/**
 * What a compression asks ffmpeg for.
 *
 * This replaces the only copy of a moment, so every one of these is a thing
 * that cannot be undone by re-running it: a missing tone map bakes grey into
 * the recording, and `-c:a copy` missing turns a six track recording into a
 * one track one with nothing on screen to say so.
 *
 * `scripts/compress-check.mjs` proves ffmpeg accepts the arguments and that
 * the file that lands is the one that was asked for. This owns which
 * arguments are asked for at all.
 */

/** What `shareEncoderArgs` hands back on this machine, as a fixture. */
const SHARE = ['-c:v', 'h264_nvenc', '-cq', '23', '-maxrate 26000k', '-bufsize 52000k'];

function probe(overrides: Partial<ProbeInfo> = {}): ProbeInfo {
  return {
    durationSec: 30,
    width: 3440,
    height: 1440,
    kbps: 90_000,
    videoCodec: 'av1',
    pixFmt: 'yuv420p10le',
    colorTransfer: 'smpte2084',
    colorPrimaries: 'bt2020',
    audioStreams: 6,
    isHdr: true,
    ...overrides,
  };
}

const plan = (overrides: Partial<ProbeInfo> = {}, decode: string[] = ['-hwaccel cuda']) =>
  planCompression({ info: probe(overrides), decode, encoder: SHARE });

describe('planCompression', () => {
  it('tone maps an HDR source', () => {
    // OBS writes PQ/bt2020 and reading it as sRGB is what made every export
    // grey. Here the grey would be baked into the recording, with no original
    // left to redo it from.
    const { outputOptions } = plan();
    expect(outputOptions).toContain(`-vf ${TONEMAP_FILTER}`);
  });

  it('leaves an SDR source alone', () => {
    // The tone map converts every pixel to float32 and back, on the CPU. It is
    // the most expensive thing in the chain and it is not a no-op on a picture
    // that is already bt709.
    const { outputOptions, filters } = plan({ isHdr: false });
    expect(filters).toEqual([]);
    expect(outputOptions.some((option) => option.startsWith('-vf'))).toBe(false);
  });

  it('keeps every audio track, copied', () => {
    /*
     * The rule this file exists for.
     *
     * A recording made through GoodBit's own OBS setup carries one track per
     * source, which is the whole point of that setup: the clutch is fine, the
     * friend chewing on voice chat is not, and one press fixes it later.
     * Flattening them here destroys that silently, and nothing says so until
     * somebody tries to mute a track next month.
     */
    const { outputOptions } = plan();
    expect(outputOptions).toContain('-map 0:a?');
    expect(outputOptions).toContain('-c:a copy');
    expect(outputOptions).toContain('-map 0:v:0');
  });

  it('takes its decode arguments from the caller rather than the encoder', () => {
    // `decodeArgs` probes the file: NVDEC refuses files it looks like it
    // should take, and it refuses a source carrying a discard-flagged pre-roll
    // from an old lossless cut. Those files are still on disk.
    expect(plan({}, []).inputOptions).toEqual([]);
    expect(plan({}, ['-hwaccel cuda']).inputOptions).toEqual(['-hwaccel cuda']);
  });

  it('writes a file that can start playing before it has finished downloading', () => {
    expect(plan().outputOptions).toContain('-movflags +faststart');
  });

  it('takes the share preset as it is, rather than rebuilding it', () => {
    // One place in the app decides what "share size" means. Reading a ceiling
    // back out of that list to recompute it here would be a second answer to
    // the same question, one rename away from disagreeing with the first.
    for (const argument of SHARE) expect(plan().outputOptions).toContain(argument);
  });
});

describe('worthKeeping', () => {
  it('refuses a result that is not meaningfully smaller', () => {
    // A clip already smaller than the preset aims for, a short 720p import, or
    // something squeezed once already. Replacing the original would spend
    // quality to gain nothing.
    expect(worthKeeping(1000, 1000)).toBe(false);
    expect(worthKeeping(1000, 1200)).toBe(false);
    expect(worthKeeping(1000, 980)).toBe(false);
  });

  it('accepts a real saving', () => {
    expect(worthKeeping(1000, 200)).toBe(true);
    expect(worthKeeping(1000, 1000 * (1 - MIN_SAVING_FRACTION))).toBe(true);
  });

  it('refuses nonsense rather than dividing by it', () => {
    expect(worthKeeping(0, 100)).toBe(false);
    expect(worthKeeping(100, 0)).toBe(false);
  });
});

describe('sameLength', () => {
  it('catches a truncated encode, which is what a full disk leaves behind', () => {
    // The failure that would otherwise look like a spectacular saving: a file
    // that plays, opens on the right frame and stops early.
    expect(sameLength(30, 12)).toBe(false);
    expect(sameLength(30, 0)).toBe(false);
  });

  it('allows a frame of slack, because a container rounds', () => {
    expect(sameLength(30, 30)).toBe(true);
    expect(sameLength(30, 30.4)).toBe(true);
    expect(sameLength(30, 29.6)).toBe(true);
    expect(sameLength(30, 30.9)).toBe(false);
  });
});
