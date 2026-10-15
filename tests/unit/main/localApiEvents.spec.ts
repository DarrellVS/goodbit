import { describe, expect, it, vi } from 'vitest';
import {
  clipToApi,
  gameRef,
  gameSlug,
  gameToApi,
  hoursLeft,
  jobsToApi,
  publisherSection,
  savingActive,
  sessionOf,
  totalOf,
  weekOf,
} from '../../../src/main/services/localApi/snapshotShape.js';
import { ProgressThrottle, isBackedUp, needsPing, throttleDelay } from '../../../src/main/services/localApi/streamShape.js';
import { createJob, onJobsChange, setJobProgress, completeJob, cancelJob, failJob } from '../../../src/main/services/jobs.js';

describe('gameSlug', () => {
  it('turns a folder name into a path-safe id', () => {
    expect(gameSlug('Battlefield 6')).toBe('battlefield-6');
    expect(gameSlug('Headliners-Win64-Shipping')).toBe('headliners-win64-shipping');
    expect(gameSlug('Cafe [Beta]!')).toBe('cafe-beta');
    expect(gameSlug('Café')).toBe('cafe');
  });
  it('never returns an empty id', () => {
    expect(gameSlug('!!!')).toBe('game');
  });
});

describe('clipToApi', () => {
  const row = {
    id: 7,
    game: 'Battlefield 6',
    filename: 'a.mp4',
    displayName: null,
    durationSec: 30,
    recordedAt: new Date('2026-10-14T10:00:00Z'),
    fileModifiedAt: new Date('2026-10-14T10:00:30Z'),
    starred: true,
    published: false,
    publisherViews: null,
    tags: [{ name: 'clutch' }],
  };
  it('maps a row to the wire shape', () => {
    const clip = clipToApi(row, gameRef('Battlefield 6', { name: 'Battlefield 6', displayName: 'BF6', steamAppId: '2807960' }), 2);
    expect(clip).toEqual({
      id: 7,
      name: 'a.mp4',
      game: { id: 'battlefield-6', name: 'BF6', steamAppId: '2807960' },
      lengthSec: 30,
      recordedAt: '2026-10-14T10:00:00.000Z',
      modifiedAt: Date.parse('2026-10-14T10:00:30Z'),
      starred: true,
      published: false,
      views: 0,
      goodBits: 2,
      tags: ['clutch'],
    });
  });
  it('prefers the display name and tolerates a missing recordedAt', () => {
    const clip = clipToApi({ ...row, displayName: 'Ace', recordedAt: null }, null, 0);
    expect(clip.name).toBe('Ace');
    expect(clip.recordedAt).toBeNull();
    expect(clip.game).toBeNull();
  });
});

describe('gameToApi', () => {
  it('is launchable only with a numeric appid', () => {
    expect(gameToApi({ name: 'a', displayName: null, steamAppId: '10' }).launchable).toBe(true);
    expect(gameToApi({ name: 'a', displayName: null, steamAppId: 'x' }).launchable).toBe(false);
    expect(gameToApi({ name: 'a', displayName: null, steamAppId: null }).launchable).toBe(false);
  });
});

describe('sections from rows', () => {
  const at = (hour: number) => new Date(Date.UTC(2026, 9, 14, hour));
  const rows = [
    { id: 1, game: 'A', durationSec: 30, recordedAt: at(8) },
    { id: 2, game: 'B', durationSec: 20, recordedAt: at(9) },
    { id: 3, game: 'A', durationSec: 10.4, recordedAt: at(10) },
    { id: 4, game: 'A', durationSec: null, recordedAt: at(10) },
  ];
  it('totals', () => {
    expect(totalOf(rows)).toEqual({ count: 4, totalSec: 60 });
    expect(totalOf([])).toEqual({ count: 0, totalSec: 0 });
  });
  it('a session is the latest game, newest first, ties by id', () => {
    const session = sessionOf(rows, 'A', (id) => (id === 3 ? 2 : 0));
    expect(session).toEqual({ game: 'a', clipIds: [4, 3, 1], count: 3, goodBits: 2 });
  });
  it('a session is null with nothing played', () => {
    expect(sessionOf(rows, 'Z', () => 0)).toBeNull();
    expect(sessionOf(rows, null, () => 0)).toBeNull();
  });
  it('caps the id list and not the count', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, game: 'A', recordedAt: at(8) }));
    const session = sessionOf(many, 'A', () => 0)!;
    expect(session.clipIds).toHaveLength(50);
    expect(session.count).toBe(80);
    expect(session.clipIds[0]).toBe(80);
  });
  it('the week lists games by clips, most first', () => {
    expect(weekOf(rows)).toEqual({ count: 4, totalSec: 60, games: [['a', 3], ['b', 1]] });
  });
});

describe('small rules', () => {
  it('publisher exposes the host and nothing after it', () => {
    expect(publisherSection('https://clips.example.com:8443/secret/path?token=x')).toEqual({
      configured: true,
      host: 'clips.example.com:8443',
    });
    expect(publisherSection('')).toEqual({ configured: false, host: null });
    expect(publisherSection(undefined)).toEqual({ configured: false, host: null });
    expect(publisherSection('not a url')).toEqual({ configured: true, host: null });
  });
  it('hours left from the library own rate', () => {
    expect(hoursLeft(3600 * 100, 1000, 10)).toBe(1);
    expect(hoursLeft(100, null, null)).toBeNull();
    expect(hoursLeft(100, 0, 10)).toBeNull();
  });
  it('saving is believed for the fallback window only', () => {
    expect(savingActive(null, 100, 45_000)).toBe(false);
    expect(savingActive(0, 44_999, 45_000)).toBe(true);
    expect(savingActive(0, 45_000, 45_000)).toBe(false);
  });
  it('jobs on the wire are the running ones, labelled', () => {
    const base = { kind: 'export' as const, message: '', progress: 10, startedAt: Date.now() };
    const out = jobsToApi([
      { ...base, id: 'a', label: 'Movie', status: 'running' },
      { ...base, id: 'b', label: '', message: 'Cutting', status: 'running' },
      { ...base, id: 'c', label: 'Done', status: 'done' },
    ]);
    expect(out.map((job) => [job.id, job.label])).toEqual([['a', 'Movie'], ['b', 'Cutting']]);
  });
});

describe('stream rules', () => {
  it('drops a subscriber past the limit and not at it', () => {
    expect(isBackedUp(1024 * 1024, 1024 * 1024)).toBe(false);
    expect(isBackedUp(1024 * 1024 + 1, 1024 * 1024)).toBe(true);
  });
  it('throttles to the minimum gap', () => {
    expect(throttleDelay(null, 1000, 250)).toBe(0);
    expect(throttleDelay(1000, 1100, 250)).toBe(150);
    expect(throttleDelay(1000, 1250, 250)).toBe(0);
    expect(throttleDelay(1000, 5000, 250)).toBe(0);
  });
  it('pings a quiet subscriber', () => {
    expect(needsPing(0, 14_999, 15_000)).toBe(false);
    expect(needsPing(0, 15_000, 15_000)).toBe(true);
  });
  it('lets publish progress through on stage changes and edges, thins the rest', () => {
    const throttle = new ProgressThrottle(500);
    expect(throttle.allow(1, 'uploading', 0, 0)).toBe(true);
    expect(throttle.allow(1, 'uploading', 10, 100)).toBe(false);
    expect(throttle.allow(1, 'uploading', 11, 600)).toBe(true);
    expect(throttle.allow(1, 'uploading', 12, 700)).toBe(false);
    expect(throttle.allow(1, 'uploading', 100, 710)).toBe(true);
    expect(throttle.allow(1, 'done', 100, 720)).toBe(true);
    expect(throttle.allow(2, 'compressing', 5, 720)).toBe(true);
    expect(throttle.allow(2, 'uploading', 5, 721)).toBe(true);
  });
});

describe('onJobsChange', () => {
  it('fires on create, progress, settle, fail and cancel, and detaches', () => {
    const listener = vi.fn();
    const off = onJobsChange(listener);
    const a = createJob('export', 'a');
    setJobProgress(a.id, 50);
    completeJob(a.id);
    const b = createJob('trim', 'b');
    failJob(b.id, 'boom');
    const c = createJob('trim', 'c');
    cancelJob(c.id);
    expect(listener).toHaveBeenCalledTimes(7);
    off();
    createJob('trim', 'd');
    expect(listener).toHaveBeenCalledTimes(7);
  });
  it('a listener that throws does not stop the job', () => {
    const off = onJobsChange(() => {
      throw new Error('x');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => createJob('trim', 'e')).not.toThrow();
    spy.mockRestore();
    off();
  });
});
