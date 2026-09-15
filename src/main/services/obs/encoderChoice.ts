import { iniValue, readIni } from './ini.js';
import { profileFolders, profilesDir } from './paths.js';
import { detectEncoders } from '../encoders.js';
import path from 'node:path';

/**
 * Which encoder the profile should ask for, and whether it can do HDR.
 *
 * This exists because of a failure with no useful error. An HDR capable
 * profile was written, with `ColorFormat=P010`, and OBS then refused to start
 * the replay buffer at all:
 *
 *     Starting the output failed. Please check the log for details.
 *
 * The cause was the encoder. OBS had filled the new profile's Simple mode
 * defaults with `RecEncoder=nvenc`, which is H.264 NVENC, and **H.264 NVENC
 * cannot encode 10 bit**. Ten bit needs HEVC or AV1. So the colour setting and
 * the encoder are one decision, not two, and writing the first without the
 * second produces a profile that looks right in every settings screen and
 * records nothing.
 *
 * The best evidence for what this machine's hardware can do is what its own
 * OBS profiles already ask for, so those are read first. The GPU probe GoodBit
 * already runs is the fallback, and plain x264 with SDR is the floor: a clip in
 * standard colour is worth having, an output that will not start is not.
 */

/** Simple mode takes an alias, which OBS resolves at runtime and repairs. */
export type SimpleEncoder =
  | 'x264'
  | 'nvenc'
  | 'nvenc_hevc'
  | 'nvenc_av1'
  | 'qsv'
  | 'qsv_hevc'
  | 'qsv_av1'
  | 'amd'
  | 'amd_hevc'
  | 'amd_av1';

export interface EncoderChoice {
  encoder: SimpleEncoder;
  /** False when nothing here can encode 10 bit, so HDR has to be dropped. */
  tenBit: boolean;
  /** Where this came from, for the plan to say. */
  reason: string;
}

/** Ten bit capable aliases, by vendor, best first. */
const TEN_BIT: SimpleEncoder[] = [
  'nvenc_av1',
  'nvenc_hevc',
  'amd_av1',
  'amd_hevc',
  'qsv_av1',
  'qsv_hevc',
];

/**
 * What the profiles on this machine already ask for.
 *
 * Both halves are read: Advanced mode holds a real encoder id in
 * `[AdvOut] RecEncoder`, Simple mode holds an alias in `[SimpleOutput]`.
 */
function encodersInUse(): string[] {
  const found: string[] = [];

  for (const folder of profileFolders()) {
    // Not GoodBit's own: it would be reading back whatever was written last
    // time, which proves nothing about the hardware.
    if (folder === 'GoodBit') continue;

    const ini = readIni(path.join(profilesDir(), folder, 'basic.ini'));
    for (const value of [
      iniValue(ini, 'AdvOut', 'RecEncoder'),
      iniValue(ini, 'AdvOut', 'Encoder'),
      iniValue(ini, 'SimpleOutput', 'RecEncoder'),
    ]) {
      if (value && value !== 'none') found.push(value.toLowerCase());
    }
  }

  return found;
}

/** A real encoder id, or an alias, mapped to the alias Simple mode wants. */
function aliasFor(id: string): SimpleEncoder | null {
  const nvenc = /nvenc/.test(id);
  const amf = /amf|_amd|^amd/.test(id);
  const qsv = /qsv/.test(id);
  const av1 = /av1/.test(id);
  const hevc = /hevc|h265|h\.265/.test(id);

  if (nvenc && av1) return 'nvenc_av1';
  if (nvenc && hevc) return 'nvenc_hevc';
  if (amf && av1) return 'amd_av1';
  if (amf && hevc) return 'amd_hevc';
  if (qsv && av1) return 'qsv_av1';
  if (qsv && hevc) return 'qsv_hevc';
  if (nvenc) return 'nvenc';
  if (amf) return 'amd';
  if (qsv) return 'qsv';
  return null;
}

export async function chooseEncoder(wantHdr: boolean): Promise<EncoderChoice> {
  const inUse = encodersInUse();
  const aliases = inUse.map(aliasFor).filter((alias): alias is SimpleEncoder => alias !== null);

  if (!wantHdr) {
    const hardware = aliases.find((alias) => alias !== 'x264');
    if (hardware) {
      return {
        encoder: hardware,
        tenBit: TEN_BIT.includes(hardware),
        reason: 'the encoder your own OBS profiles already use',
      };
    }

    const probe = await detectEncoders().catch(() => null);
    if (probe?.hardware) {
      const vendor = aliasFor(probe.h264);
      if (vendor) return { encoder: vendor, tenBit: false, reason: `${probe.h264}, which this machine can run` };
    }
    return { encoder: 'x264', tenBit: false, reason: 'the processor, since no graphics encoder answered' };
  }

  // HDR: it has to be one of the ten bit families, or the colour has to go.
  const provenTenBit = aliases.find((alias) => TEN_BIT.includes(alias));
  if (provenTenBit) {
    return {
      encoder: provenTenBit,
      tenBit: true,
      reason: 'the encoder your own OBS profiles already use, which handles 10 bit',
    };
  }

  const probe = await detectEncoders().catch(() => null);
  if (probe?.hardware) {
    // A vendor is known but not which codecs it has. HEVC rather than AV1:
    // every NVENC card since Maxwell encodes 10 bit HEVC, while AV1 needs a
    // 40 series or newer, and guessing wrong here is an output that refuses
    // to start.
    if (/nvenc/.test(probe.h264)) {
      return { encoder: 'nvenc_hevc', tenBit: true, reason: 'HEVC on your graphics card, which 10 bit needs' };
    }
    if (/amf|amd/.test(probe.h264)) {
      return { encoder: 'amd_hevc', tenBit: true, reason: 'HEVC on your graphics card, which 10 bit needs' };
    }
    if (/qsv/.test(probe.h264)) {
      return { encoder: 'qsv_hevc', tenBit: true, reason: 'HEVC on your graphics card, which 10 bit needs' };
    }
  }

  return {
    encoder: 'x264',
    tenBit: false,
    reason: 'the processor, which cannot encode 10 bit, so this records in standard colour',
  };
}
