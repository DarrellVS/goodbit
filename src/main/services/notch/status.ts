/**
 * What the notch says: the colour of the line, and the island's contents.
 *
 * Everything here is read from something that already exists. The notch is a
 * new place to look, not a new source: whether OBS is running, today's clips
 * out of the same query the tray menu makes, and how full the library's drive
 * is. Nothing is guessed. Whether OBS is *running* is not whether its replay
 * buffer is, and without obs-websocket nothing here can know the second, so the
 * words say "recording" only in the sense the rest of the app does.
 */
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { MoreThanOrEqual } from 'typeorm';
import type { NotchIsland, NotchLine } from '@shared/notch';
import { loadSettings } from '../../settings.js';

/** From here the island mentions the drive at all. */
export const DISK_WARN = 0.75;
/** From here the line turns red, because the next recording may not fit. */
export const DISK_DANGER = 0.9;

export interface Disk {
  fraction: number;
  freeBytes: number;
  drive: string;
}

export async function libraryDisk(): Promise<Disk | null> {
  const root = loadSettings().videosRoot;
  if (!root) return null;
  try {
    const stats = await statfs(root);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    if (!total) return null;
    return {
      fraction: 1 - free / total,
      freeBytes: free,
      drive: path.parse(path.resolve(root)).root.replace(/[\\/]+$/, ''),
    };
  } catch {
    return null;
  }
}

/**
 * The colour of the line, most urgent first.
 *
 * A full drive outranks OBS, since a recording that cannot be written is the
 * worse surprise. With OBS not installed the line says nothing at all: a line
 * that warns every day about software somebody chose not to use is noise.
 */
export function lineState(input: {
  saving: boolean;
  obsInstalled: boolean;
  obsRunning: boolean;
  disk: Disk | null;
}): NotchLine {
  if (input.saving) return 'busy';
  if (input.disk && input.disk.fraction >= DISK_DANGER) return 'danger';
  if (!input.obsInstalled) return 'none';
  return input.obsRunning ? 'ready' : 'warn';
}

/** "0:30", which is how long a replay reads on every other screen in the app. */
export function clipLength(seconds: number): string {
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** The time for a clip from today, and the day instead for one that is not. */
function recordedWhen(date: Date): string {
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function gigabytes(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  return gb >= 100 ? `${Math.round(gb)} GB` : `${gb.toFixed(1)} GB`;
}

export async function islandData(input: {
  obsInstalled: boolean;
  obsRunning: boolean;
  disk: Disk | null;
}): Promise<NotchIsland> {
  const { AppDataSource } = await import('../../data-source.js');
  const { Clip } = await import('../../entity/Clip.js');

  type Row = InstanceType<typeof Clip>;
  let today: Row[] = [];
  let latest: Row | null = null;

  if (AppDataSource.isInitialized) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const repo = AppDataSource.getRepository(Clip);
    // `recordedAt`, the date the library groups by, so the island and the
    // library agree on what "today" holds. Same query the tray makes.
    today = await repo.find({
      where: { recordedAt: MoreThanOrEqual(start) },
      order: { recordedAt: 'DESC', createdAt: 'DESC' },
    });
    latest =
      today[0] ??
      (await repo.findOne({ where: {}, order: { recordedAt: 'DESC', createdAt: 'DESC' } }));
  }

  const total = today.reduce((sum, clip) => sum + (clip.durationSec ?? 0), 0);

  return {
    recording: !input.obsInstalled ? 'missing' : input.obsRunning ? 'running' : 'closed',
    today: { count: today.length, total: clipLength(total) },
    latest: latest
      ? {
          id: latest.id,
          modifiedAt: new Date(latest.fileModifiedAt).toISOString(),
          name: latest.displayName || latest.filename,
          meta: [
            latest.game,
            latest.durationSec ? clipLength(latest.durationSec) : '',
            latest.recordedAt ? recordedWhen(new Date(latest.recordedAt)) : '',
          ]
            .filter(Boolean)
            .join(' · '),
          moments: latest.suggestedCount ?? null,
        }
      : null,
    disk:
      input.disk && input.disk.fraction >= DISK_WARN
        ? {
            percent: Math.round(input.disk.fraction * 100),
            free: gigabytes(input.disk.freeBytes),
            drive: input.disk.drive,
            danger: input.disk.fraction >= DISK_DANGER,
          }
        : null,
  };
}
