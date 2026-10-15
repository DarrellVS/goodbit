import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  LATEST_CLIP_ORDER,
  LOCAL_API_ERRORS,
  LOCAL_API_LIMITS,
  ROUTES,
  SECTION_NAMES,
  SHOW_IN_APP_VIEWS,
  SessionSeen,
  applySet,
  capabilitiesFor,
  clipIdsInState,
  encodeLine,
  errorBody,
  isLocalApiDiscovery,
  isLocalApiPipeName,
  localApiPipeName,
  matchRoute,
  parseClipIdParam,
  parseDiscardBody,
  parseLine,
  parseShowBody,
  parseStarBatchBody,
  parseTagsBody,
  parseThumbnailWidth,
  pickLatest,
  sectionsChanged,
  showInAppPath,
  stateDelta,
  tagNamesInState,
  type ApiClip,
  type LocalApiLine,
  type LocalApiState,
} from '@shared/localApi';

/**
 * The contract of the local API, over the parts that are values in and values out.
 *
 * None of this opens a pipe. What it owns is the set of rules a client and the
 * server must agree on and that nobody would notice drifting: which sections a
 * state line carries, what a session was told, which clip is the latest and
 * which route a view opens.
 */

function clip(id: number, over: Partial<ApiClip> = {}): ApiClip {
  return {
    id,
    name: `Clip ${id}`,
    game: null,
    lengthSec: 30,
    recordedAt: '2026-10-15T19:42:07.000Z',
    modifiedAt: 1760557327000,
    starred: false,
    published: false,
    views: 0,
    goodBits: 0,
    tags: [],
    ...over,
  };
}

function state(over: Partial<LocalApiState> = {}): LocalApiState {
  return {
    saving: { active: false },
    obs: { installed: true, running: true, replayKey: 'F8' },
    drive: { drive: 'D:', used: 0.82, freeBytes: 335007449088, hoursLeft: 14 },
    today: { count: 7, totalSec: 210 },
    latest: clip(1482, { tags: ['clutch'] }),
    session: { game: 'battlefield-6', clipIds: [1482, 1481], count: 7, goodBits: 9 },
    recent: [1481, 1480],
    found: { goodBits: 9, clipIds: [1482, 1479] },
    tags: { top: ['clutch', 'funny'] },
    week: { count: 31, totalSec: 1120, games: [['battlefield-6', 22]] },
    views: { total: 1284, published: 18, top: 1311 },
    jobs: [],
    clips: { '1481': clip(1481, { tags: ['revive'] }) },
    games: {},
    publisher: { configured: true, host: 'clips.example.com' },
    ...over,
  };
}

describe('sectionsChanged', () => {
  it('names every section when nobody has been told anything', () => {
    expect(sectionsChanged(null, state())).toEqual([...SECTION_NAMES]);
  });

  it('names nothing for an equal state, whatever the key order', () => {
    const a = state();
    const b = state({ obs: { replayKey: 'F8', running: true, installed: true } });
    expect(sectionsChanged(a, b)).toEqual([]);
    expect(stateDelta(a, b)).toBeNull();
  });

  it('names only the sections that differ, and compares them as wholes', () => {
    const a = state();
    const b = state({ saving: { active: true }, today: { count: 8, totalSec: 240 } });
    expect(sectionsChanged(a, b)).toEqual(['saving', 'today']);
    expect(stateDelta(a, b)).toEqual({ saving: { active: true }, today: { count: 8, totalSec: 240 } });
  });

  it('sees a change inside a nested section and inside array order', () => {
    const a = state();
    expect(sectionsChanged(a, state({ latest: clip(1482, { starred: true, tags: ['clutch'] }) }))).toEqual(['latest']);
    expect(sectionsChanged(a, state({ recent: [1480, 1481] }))).toEqual(['recent']);
    expect(sectionsChanged(a, state({ clips: { '1481': clip(1481, { tags: ['revive', 'x'] }) } }))).toEqual(['clips']);
  });

  it('treats null and an object as different', () => {
    expect(sectionsChanged(state({ drive: null }), state())).toEqual(['drive']);
  });

  it('asserts its own instrument: the section list is the whole state', () => {
    expect(SECTION_NAMES.length).toBe(Object.keys(state()).length);
    expect([...SECTION_NAMES].sort()).toEqual(Object.keys(state()).sort());
  });
});

describe('applySet', () => {
  it('replaces the named sections outright and keeps the rest', () => {
    const before = state();
    const after = applySet(before, { saving: { active: true }, recent: [] });
    expect(after.saving).toEqual({ active: true });
    expect(after.recent).toEqual([]);
    expect(after.today).toBe(before.today);
    expect(before.saving).toEqual({ active: false });
  });

  it('ignores keys that are not sections', () => {
    const after = applySet(state(), { nonsense: 1 } as never);
    expect('nonsense' in after).toBe(false);
  });
});

describe('what a state names', () => {
  it('collects every clip id from every section that carries one', () => {
    expect(clipIdsInState(state()).sort((a, b) => a - b)).toEqual([1480, 1479, 1481, 1482].sort((a, b) => a - b));
  });

  it('collects tag names from top tags, the latest and the clip map', () => {
    expect(tagNamesInState(state()).sort()).toEqual(['clutch', 'funny', 'revive']);
  });

  it('copes with a partial state, which is what a state line carries', () => {
    expect(clipIdsInState({ recent: [5] })).toEqual([5]);
    expect(tagNamesInState({})).toEqual([]);
  });
});

describe('SessionSeen', () => {
  const T0 = 1_000_000;
  const TTL = LOCAL_API_LIMITS.sessionTtlMs;

  it('knows only what it was sent', () => {
    const seen = new SessionSeen(T0);
    seen.rememberClips([1, 2]);
    seen.rememberTags(['clutch']);
    expect(seen.knowsClip(1, T0)).toBe(true);
    expect(seen.knowsClip(3, T0)).toBe(false);
    expect(seen.knowsTag('clutch', T0)).toBe(true);
    expect(seen.knowsTag('funny', T0)).toBe(false);
  });

  it('refuses an empty list, a partly known list and a bad id', () => {
    const seen = new SessionSeen(T0);
    seen.rememberClips([1, 2, -4, 1.5, Number.NaN]);
    expect(seen.clipCount).toBe(2);
    expect(seen.knowsAllClips([], T0)).toBe(false);
    expect(seen.knowsAllClips([1, 2], T0)).toBe(true);
    expect(seen.knowsAllClips([1, 3], T0)).toBe(false);
    expect(seen.knowsAllTags([], T0)).toBe(false);
  });

  it('matches a tag name exactly after trimming, not by case', () => {
    const seen = new SessionSeen(T0);
    seen.rememberTags([' clutch ']);
    expect(seen.knowsTag('clutch', T0)).toBe(true);
    expect(seen.knowsTag('Clutch', T0)).toBe(false);
  });

  it('expires ttl after the last use, and checking is not use', () => {
    const seen = new SessionSeen(T0);
    seen.rememberClips([1]);
    expect(seen.knowsClip(1, T0 + TTL - 1)).toBe(true);
    expect(seen.knowsClip(1, T0 + TTL)).toBe(false);
    expect(seen.isExpired(T0 + TTL)).toBe(true);
  });

  it('is kept alive by touch, and a dead session is not revived by one', () => {
    const seen = new SessionSeen(T0);
    seen.rememberClips([1]);
    seen.touch(T0 + TTL - 1);
    expect(seen.knowsClip(1, T0 + TTL + 5)).toBe(true);
    expect(seen.isExpired(T0 + 2 * TTL)).toBe(true);
    seen.touch(T0 + 2 * TTL);
    expect(seen.isExpired(T0 + 2 * TTL)).toBe(true);
    expect(seen.knowsClip(1, T0 + 2 * TTL)).toBe(false);
  });

  it('expire() forgets everything for good', () => {
    const seen = new SessionSeen(T0);
    seen.rememberClips([1]);
    seen.rememberTags(['a']);
    seen.expire();
    expect(seen.clipCount).toBe(0);
    expect(seen.tagCount).toBe(0);
    seen.touch(T0);
    expect(seen.isExpired(T0)).toBe(true);
  });

  it('remembers what each line carries', () => {
    const seen = new SessionSeen(T0);
    const lines: LocalApiLine[] = [
      { type: 'snapshot', rev: 1, session: 's_x', state: state() },
      { type: 'state', rev: 2, set: { recent: [900], tags: { top: ['new'] } } },
      { type: 'event', rev: 3, event: 'clip.saved', at: 'x', clip: clip(901, { tags: ['t901'] }) },
      { type: 'event', rev: 4, event: 'sweep.finished', at: 'x', found: 2, clips: 3, clipIds: [902] },
      { type: 'event', rev: 5, event: 'publish.progress', at: 'x', clipId: 903, name: 'n', stage: 'upload', percent: 5 },
      { type: 'event', rev: 6, event: 'clip.saving', at: 'x' },
      { type: 'ping', rev: 6, at: 'x' },
    ];
    for (const line of lines) seen.rememberLine(line);
    for (const id of [1482, 1481, 900, 901, 902, 903]) expect(seen.knowsClip(id, T0)).toBe(true);
    for (const name of ['clutch', 'funny', 'revive', 'new', 't901']) expect(seen.knowsTag(name, T0)).toBe(true);
    expect(seen.knowsClip(1, T0)).toBe(false);
  });
});

describe('the one latest clip', () => {
  const base = { isExport: false, fileModifiedAt: '2026-10-15T10:00:00.000Z' };

  it('is the data the SQL is built from', () => {
    expect(LATEST_CLIP_ORDER.excludeExports).toBe(true);
    expect(LATEST_CLIP_ORDER.sql.primary).toBe('COALESCE(clip.recordedAt, clip.fileModifiedAt)');
  });

  it('prefers recordedAt, and falls back to the file date', () => {
    const recorded = { ...base, id: 1, recordedAt: '2026-10-15T12:00:00.000Z' };
    const filed = { ...base, id: 2, recordedAt: null, fileModifiedAt: '2026-10-15T11:00:00.000Z' };
    expect(pickLatest([filed, recorded])?.id).toBe(1);
    expect(pickLatest([recorded, { ...filed, fileModifiedAt: '2026-10-15T13:00:00.000Z' }])?.id).toBe(2);
  });

  it('breaks a tie by the higher id', () => {
    const at = '2026-10-15T12:00:00.000Z';
    expect(pickLatest([{ ...base, id: 4, recordedAt: at }, { ...base, id: 9, recordedAt: at }])?.id).toBe(9);
  });

  it('never picks an export, however new', () => {
    const rec = { ...base, id: 1, recordedAt: '2026-10-15T09:00:00.000Z' };
    const exp = { ...base, id: 2, isExport: true, recordedAt: '2026-10-15T23:00:00.000Z' };
    expect(pickLatest([rec, exp])?.id).toBe(1);
    expect(pickLatest([exp])).toBeNull();
    expect(pickLatest([])).toBeNull();
  });

  it('accepts dates and milliseconds as well as strings', () => {
    const a = { id: 1, isExport: false, recordedAt: new Date(2000), fileModifiedAt: 0 };
    const b = { id: 2, isExport: false, recordedAt: null, fileModifiedAt: 3000 };
    expect(pickLatest([a, b])?.id).toBe(2);
  });
});

describe('showInAppPath', () => {
  it('builds the route itself for each view', () => {
    expect(showInAppPath('library')).toBe('/');
    expect(showInAppPath('clip', 7)).toBe('/clips/7');
    expect(showInAppPath('trim', 7)).toBe('/trim/7');
    expect(showInAppPath('editor-highlights', undefined, [3, 4])).toBe('/editor?clips=3,4&highlights=1');
    expect(showInAppPath('storage')).toBe('/storage');
    expect(showInAppPath('publisher')).toBe('/publisher');
    expect(showInAppPath('stats')).toBe('/stats');
    expect(showInAppPath('settings')).toBe('/settings');
  });

  it('answers null for a view that needs a clip and has none', () => {
    expect(showInAppPath('clip')).toBeNull();
    expect(showInAppPath('trim', 0)).toBeNull();
    expect(showInAppPath('trim', 1.5)).toBeNull();
    expect(showInAppPath('editor-highlights', undefined, [])).toBeNull();
  });

  it('covers every view in the enum', () => {
    for (const view of SHOW_IN_APP_VIEWS) {
      expect(showInAppPath(view, 1, [1])).toMatch(/^\//);
    }
  });

  it('never lets a caller put a path in', () => {
    expect(parseShowBody({ view: '/settings' }).ok).toBe(false);
    expect(parseShowBody({ view: 'trim', clipId: '../x' }).ok).toBe(false);
    expect(parseShowBody({ view: 'trim', clipId: 4 })).toEqual({ ok: true, value: { view: 'trim', clipId: 4 } });
    expect(parseShowBody({ view: 'trim' }).ok).toBe(false);
  });
});

describe('capabilities', () => {
  it('drops publish without a publisher and discard unless allowed', () => {
    const none = capabilitiesFor({ publisherConfigured: false, allowDiscard: false });
    expect(none).not.toContain('clips.publish');
    expect(none).not.toContain('publisher.refresh');
    expect(none).not.toContain('clips.discard');
    expect(none).toContain('clips.star');
    const all = capabilitiesFor({ publisherConfigured: true, allowDiscard: true });
    expect(all).toEqual([...CAPABILITIES]);
  });
});

describe('the route table', () => {
  it('has a unique key for every route, and a capability that exists', () => {
    const keys = ROUTES.map((route) => route.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBeGreaterThanOrEqual(20);
    for (const route of ROUTES) {
      if (route.capability !== null) expect(CAPABILITIES).toContain(route.capability);
      expect(route.key.startsWith(`${route.method} /v1/`)).toBe(true);
    }
  });

  it('matches a parameterised path and decodes it', () => {
    const hit = matchRoute('POST', '/v1/clips/42/star');
    expect(hit?.route.key).toBe('POST /v1/clips/:id/star');
    expect(hit?.params).toEqual({ id: '42' });
    expect(matchRoute('GET', '/v1/games/battlefield-6/art/hero')?.params).toEqual({
      id: 'battlefield-6',
      kind: 'hero',
    });
    expect(matchRoute('GET', '/v1/games/a%20b/art/hero')?.params.id).toBe('a b');
  });

  it('lets a literal segment beat a parameter', () => {
    expect(matchRoute('POST', '/v1/clips/star')?.route.key).toBe('POST /v1/clips/star');
  });

  it('keeps the legacy Stream Deck paths', () => {
    expect(matchRoute('POST', '/v1/latest/tag')?.route.group).toBe('streamdeck');
    expect(matchRoute('GET', '/v1/health')?.route.group).toBe('streamdeck');
  });

  it('answers null for the wrong method, an unknown path and a bad escape', () => {
    expect(matchRoute('GET', '/v1/clips/42/star')).toBeNull();
    expect(matchRoute('POST', '/v1/nothing')).toBeNull();
    expect(matchRoute('GET', '/v2/hello')).toBeNull();
    expect(matchRoute('GET', '/v1/games/%E0%A4%A/art/hero')).toBeNull();
    expect(matchRoute('GET', '/v1/clips//thumbnail')).toBeNull();
  });

  it('requires a session for every write that names a clip', () => {
    for (const route of ROUTES) {
      if (route.group === 'core' && route.method === 'POST' && route.key.includes('/clips/')) {
        expect(route.session).toBe(true);
      }
    }
    expect(ROUTES.find((route) => route.key === 'POST /v1/clips/:id/publish')?.status).toBe(202);
  });
});

describe('errors', () => {
  it('maps each code to the documented status', () => {
    expect(LOCAL_API_ERRORS.bad_request).toBe(400);
    expect(LOCAL_API_ERRORS.session_required).toBe(401);
    expect(LOCAL_API_ERRORS.capability_off).toBe(403);
    expect(LOCAL_API_ERRORS.not_found).toBe(404);
    expect(LOCAL_API_ERRORS.latest_changed).toBe(409);
    expect(LOCAL_API_ERRORS.saving).toBe(409);
    expect(LOCAL_API_ERRORS.payload_too_large).toBe(413);
    expect(LOCAL_API_ERRORS.starting).toBe(503);
  });

  it('builds the one body shape', () => {
    expect(errorBody('saving', 'Still saving.')).toEqual({ error: 'saving', message: 'Still saving.' });
  });
});

describe('NDJSON lines', () => {
  it('encodes one line ending in a newline, with no other newline in it', () => {
    const text = encodeLine({ type: 'event', rev: 2, event: 'clip.saving', at: 'a\nb' });
    expect(text.endsWith('\n')).toBe(true);
    expect(text.slice(0, -1).includes('\n')).toBe(false);
  });

  it('round trips each of the four line types', () => {
    const lines: LocalApiLine[] = [
      { type: 'snapshot', rev: 1, session: 's_1', state: state() },
      { type: 'state', rev: 2, set: { saving: { active: true } } },
      { type: 'event', rev: 3, event: 'sweep.dismissed', at: 'x' },
      { type: 'ping', rev: 3, at: 'x' },
    ];
    for (const line of lines) expect(parseLine(encodeLine(line).trim())).toEqual(line);
  });

  it('refuses what is not a line, without throwing', () => {
    for (const bad of ['', 'nope', '[]', '{"type":"x","rev":1}', '{"type":"ping"}', '{"type":"state","rev":1}', '{"type":"snapshot","rev":1}']) {
      expect(parseLine(bad)).toBeNull();
    }
  });
});

describe('discovery', () => {
  const pipe = localApiPipeName('6f1c2e9a-1b2c-4d3e-8f90-a1b2c3d4e5f6');
  const file = { api: 1, pipe, pid: 18244, app: 'GoodBit', version: '3.11.0', startedAt: '2026-10-15T19:02:11.408Z' };

  it('formats and recognises a pipe name', () => {
    expect(pipe).toBe('\\\\.\\pipe\\goodbit-api-6f1c2e9a-1b2c-4d3e-8f90-a1b2c3d4e5f6');
    expect(isLocalApiPipeName(pipe)).toBe(true);
    expect(isLocalApiPipeName('\\\\.\\pipe\\goodbit-streamdeck')).toBe(false);
    expect(isLocalApiPipeName('\\\\.\\pipe\\goodbit-api-..\\evil')).toBe(false);
  });

  it('accepts a whole file and refuses a damaged one', () => {
    expect(isLocalApiDiscovery(file)).toBe(true);
    expect(isLocalApiDiscovery({ ...file, pid: 0 })).toBe(false);
    expect(isLocalApiDiscovery({ ...file, pipe: 'x' })).toBe(false);
    expect(isLocalApiDiscovery({ ...file, app: 'Other' })).toBe(false);
    expect(isLocalApiDiscovery({ ...file, startedAt: 'yesterday-ish' })).toBe(false);
    expect(isLocalApiDiscovery(null)).toBe(false);
  });
});

describe('request bodies', () => {
  it('takes batch ids that are whole positive numbers, de-duplicated, within the cap', () => {
    expect(parseStarBatchBody({ clipIds: [1, 1, 2], starred: true })).toEqual({
      ok: true,
      value: { clipIds: [1, 2], starred: true },
    });
    expect(parseStarBatchBody({ clipIds: [], starred: true }).ok).toBe(false);
    expect(parseStarBatchBody({ clipIds: ['1'], starred: true }).ok).toBe(false);
    expect(parseStarBatchBody({ clipIds: [1], starred: 'yes' }).ok).toBe(false);
    const tooMany = Array.from({ length: LOCAL_API_LIMITS.maxBatchClips + 1 }, (_, i) => i + 1);
    expect(parseStarBatchBody({ clipIds: tooMany, starred: true }).ok).toBe(false);
  });

  it('takes tag names to add, trimmed and unique, and nothing else', () => {
    expect(parseTagsBody({ add: [' clutch ', 'clutch', 'funny'] })).toEqual({ ok: true, value: { add: ['clutch', 'funny'] } });
    expect(parseTagsBody({ add: [] }).ok).toBe(false);
    expect(parseTagsBody({ add: [''] }).ok).toBe(false);
    expect(parseTagsBody({ add: [3] }).ok).toBe(false);
    expect(parseTagsBody({ remove: ['x'] }).ok).toBe(false);
  });

  it('wants a literal true to discard', () => {
    expect(parseDiscardBody({ confirm: true }).ok).toBe(true);
    expect(parseDiscardBody({ confirm: 'true' }).ok).toBe(false);
    expect(parseDiscardBody({}).ok).toBe(false);
  });

  it('reads path and query values strictly', () => {
    expect(parseClipIdParam('42')).toBe(42);
    for (const bad of ['0', '-1', '1e3', '0x10', '01', '1.5', '', undefined, '99999999999999999999']) {
      expect(parseClipIdParam(bad)).toBeNull();
    }
    expect(parseThumbnailWidth(undefined)).toBe(320);
    expect(parseThumbnailWidth('160')).toBe(160);
    expect(parseThumbnailWidth('1280')).toBeNull();
    expect(parseThumbnailWidth('abc')).toBeNull();
  });
});
