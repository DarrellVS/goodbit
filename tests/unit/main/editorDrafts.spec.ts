import { describe, expect, it } from 'vitest';
import {
  MAX_TIMELINE_UNITS,
  isNewer,
  planDraftImport,
  readIncomingDrafts,
  toSqliteUtc,
  type IncomingDraft,
  type StoredDraftStamp,
} from '../../../src/main/services/editorDrafts.js';

/**
 * The 2.0 first-run draft migration, which only gets to run once.
 *
 * Item 3.2 of the brainstorm: a named editor draft used to be written to the
 * renderer's IndexedDB *and* mirrored into `project`, each write in its own
 * `try`, so a failed mirror left two copies of one draft and nothing to decide
 * between them. `project` is the only store now, and this is the pass that
 * gets the leftover local records there.
 *
 * Every case below is somebody's unsaved timeline, and the whole point of
 * testing it here rather than by launching the app is that the interesting
 * inputs are the ones a real machine is unlikely to produce on demand: a row
 * that is newer than its mirror, a row that has been deleted since, a record
 * that never had a row at all. There is one chance to get each right, because
 * the second run has nothing left to read.
 */

function draft(over: Partial<IncomingDraft> = {}): IncomingDraft {
  return {
    localId: 'local-1',
    name: 'Montage',
    updatedAt: '2025-08-14T09:12:33.906Z',
    clips: [
      {
        clipId: 7,
        startTime: 0,
        duration: 8.3,
        trimStart: 4.5,
        trimEnd: 12.8,
        originalDuration: 30,
        volume: 1,
        muted: false,
      },
    ],
    audio: [],
    ...over,
  };
}

function row(over: Partial<StoredDraftStamp> = {}): StoredDraftStamp {
  return { id: 41, updatedAt: '2025-08-14T09:12:33.906Z', ...over };
}

describe('what happens to a local draft record', () => {
  it('makes a row out of one that never reached the library', () => {
    // An imported draft, which 1.x never pushed at all, and a saved draft
    // whose `createProject` failed. Both look like this.
    const plan = planDraftImport([draft({ projectId: null })], []);

    expect(plan).toEqual([
      {
        step: 'create',
        localId: 'local-1',
        name: 'Montage',
        updatedAt: '2025-08-14T09:12:33.906Z',
        timeline: { clips: draft().clips, audio: [] },
      },
    ]);
  });

  it('leaves the row alone when the row is newer', () => {
    const plan = planDraftImport(
      [draft({ projectId: 41, updatedAt: '2025-08-14T09:00:00.000Z' })],
      [row({ id: 41, updatedAt: '2025-08-14T10:00:00.000Z' })],
    );

    expect(plan).toEqual([{ step: 'keep', localId: 'local-1', projectId: 41 }]);
  });

  it('leaves the row alone when the two are the same age', () => {
    // The mirror working as intended: the local write and the row's write are
    // one autosave beat apart at most, and "not older" is not a reason to
    // rewrite a row.
    const plan = planDraftImport([draft({ projectId: 41 })], [row({ id: 41 })]);

    expect(plan).toEqual([{ step: 'keep', localId: 'local-1', projectId: 41 }]);
  });

  it('overwrites a row that is older, carrying the name as well as the timeline', () => {
    // The divergence 3.2 is about: the local write succeeded and the mirror
    // did not, so the library has been holding a stale copy ever since.
    const plan = planDraftImport(
      [draft({ projectId: 41, name: '  Renamed  ', updatedAt: '2025-08-14T11:00:00.000Z' })],
      [row({ id: 41, updatedAt: '2025-08-14T10:00:00.000Z' })],
    );

    expect(plan).toEqual([
      {
        step: 'overwrite',
        localId: 'local-1',
        projectId: 41,
        name: 'Renamed',
        updatedAt: '2025-08-14T11:00:00.000Z',
        timeline: { clips: draft().clips, audio: [] },
      },
    ]);
  });

  it('keeps a record whose row has gone, as a row of its own', () => {
    // The row was deleted while this record sat in the browser, or the library
    // was restored from a backup taken before the draft was saved. Either way
    // this record is now the only copy of that timeline in existence, and the
    // one thing that must not happen is it being read as "already migrated".
    const plan = planDraftImport([draft({ projectId: 41 })], [row({ id: 99 })]);

    expect(plan[0].step).toBe('create');
  });
});

describe('a record with nothing in it, or too much', () => {
  it('skips one holding neither a clip nor a track', () => {
    const plan = planDraftImport([draft({ clips: [], audio: [] })], []);
    expect(plan).toEqual([{ step: 'skip', localId: 'local-1', reason: 'empty' }]);
  });

  it('skips a timeline too large for the column rather than cutting it down', () => {
    // Left where it is, because a local record that cannot be stored as a row
    // is then the only copy there is. `localIdsToDrop` in the renderer keeps
    // it for the same reason.
    const many = Array.from({ length: 20000 }, () => draft().clips[0]);
    const plan = planDraftImport([draft({ clips: many })], []);

    expect(JSON.stringify({ clips: many, audio: [] }).length).toBeGreaterThan(MAX_TIMELINE_UNITS);
    expect(plan).toEqual([{ step: 'skip', localId: 'local-1', reason: 'too-large' }]);
  });

  it('counts a record with only music as worth carrying', () => {
    const plan = planDraftImport(
      [
        draft({
          clips: [],
          audio: [
            {
              trackId: 'bed.mp3',
              name: 'bed.mp3',
              startTime: 0,
              duration: 10,
              trimStart: 0,
              trimEnd: 10,
              originalDuration: 120,
              volume: 0.4,
              muted: false,
              fadeIn: 1,
              fadeOut: 1,
            },
          ],
        }),
      ],
      [],
    );

    expect(plan[0].step).toBe('create');
  });
});

describe('two records naming one row', () => {
  it('gives the row to the newest and keeps the other beside it', () => {
    // Nothing in the app writes `serverId` twice, and the cost of being wrong
    // about that is one of the two timelines disappearing under the other.
    const plan = planDraftImport(
      [
        draft({ localId: 'older', projectId: 41, updatedAt: '2025-08-14T09:00:00.000Z' }),
        draft({ localId: 'newer', projectId: 41, updatedAt: '2025-08-14T12:00:00.000Z' }),
      ],
      [row({ id: 41, updatedAt: '2025-08-14T10:00:00.000Z' })],
    );

    expect(plan.map((step) => [step.localId, step.step])).toEqual([
      ['older', 'create'],
      ['newer', 'overwrite'],
    ]);
  });
});

describe('comparing two stamps', () => {
  it('takes the later of two ISO stamps', () => {
    expect(isNewer('2025-08-14T10:00:00.000Z', '2025-08-14T09:00:00.000Z')).toBe(true);
    expect(isNewer('2025-08-14T09:00:00.000Z', '2025-08-14T10:00:00.000Z')).toBe(false);
    expect(isNewer('2025-08-14T09:00:00.000Z', '2025-08-14T09:00:00.000Z')).toBe(false);
  });

  it('never lets a stamp that will not parse win', () => {
    // The local store has no schema. As text, `'yesterday' > '2025-...'` is
    // true, and believing it would overwrite a real row's timeline with
    // whatever a record written by hand happened to hold.
    for (const nonsense of ['yesterday', '', undefined, null, 'Invalid Date']) {
      expect(isNewer(nonsense, '2025-08-14T09:00:00.000Z')).toBe(false);
    }
  });

  it('lets a real stamp beat one that will not parse', () => {
    expect(isNewer('2025-08-14T09:00:00.000Z', 'not a date')).toBe(true);
  });

  it('keeps the row when neither stamp parses', () => {
    const plan = planDraftImport(
      [draft({ projectId: 41, updatedAt: 'whenever' })],
      [row({ id: 41, updatedAt: 'also whenever' })],
    );

    expect(plan).toEqual([{ step: 'keep', localId: 'local-1', projectId: 41 }]);
  });
});

describe('the date a migrated draft keeps', () => {
  it('writes the format TypeORM stores a datetime in', () => {
    // UTC, a space rather than a `T`, three decimal places, no zone suffix.
    // `AbstractSqliteDriver.preparePersistentValue` produces exactly this via
    // `DateUtils.mixedDateToUtcDatetimeString`, and the column is only read
    // back correctly because it does.
    expect(toSqliteUtc('2025-08-14T09:12:33.906Z')).toBe('2025-08-14 09:12:33.906');
  });

  it('normalises an offset to UTC, because the column has no zone', () => {
    expect(toSqliteUtc('2025-08-14T11:12:33.906+02:00')).toBe('2025-08-14 09:12:33.906');
  });

  it('reads back as the same instant through the driver s own hydration', () => {
    /*
     * The two rewrites `AbstractSqliteDriver.prepareHydratedValue` performs on
     * the way out, copied here rather than imported: this is the contract the
     * format has to satisfy, and a TypeORM upgrade that changed it should fail
     * a test rather than quietly turn every migrated draft's date into
     * `Invalid Date`. That is what a bare `toISOString()` in the column does,
     * because the second pattern only appends `Z` to a string with no `T` and
     * no suffix already on it.
     */
    const stored = toSqliteUtc('2025-08-14T09:12:33.906Z');

    let hydrated = stored;
    if (/^\d\d\d\d-\d\d-\d\d \d\d:\d\d/.test(hydrated)) hydrated = hydrated.replace(' ', 'T');
    if (/^\d\d\d\d-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d\d\d)?)?$/.test(hydrated)) hydrated += 'Z';

    expect(new Date(hydrated).toISOString()).toBe('2025-08-14T09:12:33.906Z');
  });
});

describe('reading the request body', () => {
  it('drops an entry with no local id, which nothing could be reported about', () => {
    expect(readIncomingDrafts([{ name: 'Montage' }, { localId: 'local-1' }])).toHaveLength(1);
  });

  it('takes a timeline that is not an array as an empty one', () => {
    // `String.length` on `'abc'` is 3, so an unchecked body would pass the
    // emptiness test and land in the column as a timeline no editor can open.
    const [entry] = readIncomingDrafts([{ localId: 'local-1', clips: 'abc', audio: 7 }]);

    expect(entry.clips).toEqual([]);
    expect(entry.audio).toEqual([]);
    expect(planDraftImport([entry], [])).toEqual([
      { step: 'skip', localId: 'local-1', reason: 'empty' },
    ]);
  });

  it('only accepts a row id that could be one', () => {
    for (const projectId of [0, -3, 1.5, 'nine', null, undefined]) {
      expect(readIncomingDrafts([{ localId: 'local-1', projectId }])[0].projectId).toBeNull();
    }

    expect(readIncomingDrafts([{ localId: 'local-1', projectId: 41 }])[0].projectId).toBe(41);
  });

  it('takes a body that is not a list at all as nothing to do', () => {
    for (const body of [undefined, null, 'drafts', { drafts: 1 }]) {
      expect(readIncomingDrafts(body)).toEqual([]);
    }
  });
});

describe('a real machine s worth of leftovers', () => {
  it('carries every kind at once, and moves only what needs moving', () => {
    const plan = planDraftImport(
      [
        draft({ localId: 'mirrored', projectId: 41, updatedAt: '2025-08-01T09:00:00.000Z' }),
        draft({ localId: 'diverged', projectId: 42, updatedAt: '2025-08-02T09:00:00.000Z' }),
        draft({ localId: 'imported', projectId: null }),
        draft({ localId: 'orphaned', projectId: 404 }),
        draft({ localId: 'blank', projectId: null, clips: [], audio: [] }),
      ],
      [
        row({ id: 41, updatedAt: '2025-08-01T09:00:01.000Z' }),
        row({ id: 42, updatedAt: '2025-07-20T09:00:00.000Z' }),
      ],
    );

    expect(plan.map((step) => [step.localId, step.step])).toEqual([
      ['mirrored', 'keep'],
      ['diverged', 'overwrite'],
      ['imported', 'create'],
      ['orphaned', 'create'],
      ['blank', 'skip'],
    ]);

    // Three timelines were at risk and three are accounted for; the fourth was
    // already safe and the fifth was empty.
    expect(plan.filter((step) => step.step === 'create' || step.step === 'overwrite')).toHaveLength(
      3,
    );
  });
});
