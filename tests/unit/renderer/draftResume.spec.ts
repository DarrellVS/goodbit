import { describe, expect, it } from 'vitest';
import {
  draftAsResumable,
  pickResumable,
} from '../../../src/renderer/src/utils/draftResume';
import type { StoredDraftRecord } from '../../../src/renderer/src/services/editorDraftsDb';
import type { DraftClip, EditorDraft } from '../../../src/renderer/src/types/editor';

/**
 * What the resume banner offers, which is the one place two stores still meet.
 *
 * After 3.2 a named draft is a row in the library and IndexedDB keeps one
 * scratch record of what this window was last doing. They are different
 * things, so they cannot disagree about what a draft *is*, but they both have
 * an answer to "what were you in the middle of", and this is the rule that
 * turns two answers into one offer.
 *
 * `persist` writes the scratch record first and the row second, so the row is
 * normally the newer of the two. The scratch copy winning means the write to
 * the library failed, which is exactly the case 1.x noticed too late.
 */

const clip: DraftClip = {
  clipId: 7,
  startTime: 0,
  duration: 8.3,
  trimStart: 4.5,
  trimEnd: 12.8,
  originalDuration: 30,
  volume: 1,
  muted: false,
};

function scratch(over: Partial<StoredDraftRecord> = {}): StoredDraftRecord {
  return {
    id: '__autosave__',
    name: 'Autosave',
    updatedAt: '2025-08-14T09:00:00.000Z',
    clips: [clip],
    audio: [],
    ...over,
  };
}

function named(over: Partial<EditorDraft> = {}): EditorDraft {
  return {
    id: 41,
    name: 'Montage',
    updatedAt: '2025-08-14T09:00:01.000Z',
    clips: [{ ...clip, trimEnd: 20 }],
    audio: [],
    ...over,
  };
}

describe('when there is nothing to resume', () => {
  it('offers nothing without a scratch record', () => {
    expect(pickResumable(null, [named()])).toBeNull();
  });

  it('offers nothing for an empty scratch record, even with drafts in the library', () => {
    /*
     * The banner answers "you were in the middle of something", and the drafts
     * dialog answers "what have I kept". A draft saved and closed weeks ago
     * belongs in the second; putting it in front of somebody opening the
     * editor to start something new is nagging, not resuming.
     */
    expect(pickResumable(scratch({ clips: [], audio: [] }), [named()])).toBeNull();
  });

  it('treats a scratch record with no timeline fields as empty', () => {
    expect(pickResumable({ id: '__autosave__' }, [named()])).toBeNull();
  });
});

describe('a scratch record belonging to no draft', () => {
  it('is offered as itself, with no draft to reattach to', () => {
    const offer = pickResumable(scratch(), []);

    expect(offer).toEqual({
      projectId: null,
      name: 'Autosave',
      updatedAt: '2025-08-14T09:00:00.000Z',
      clips: [clip],
      audio: [],
    });
  });
});

describe('a scratch record belonging to a draft', () => {
  it('is offered as that draft, with the row s timeline, when the row is newer', () => {
    // The ordinary case: both writes landed, and the row is the copy of record.
    const offer = pickResumable(scratch({ projectId: 41 }), [named()]);

    expect(offer).toEqual({
      projectId: 41,
      name: 'Montage',
      updatedAt: '2025-08-14T09:00:01.000Z',
      clips: [{ ...clip, trimEnd: 20 }],
      audio: [],
    });
  });

  it('is offered with the scratch timeline when the library write did not land', () => {
    // The whole reason the scratch record is still written while a draft is
    // open: without it, the edits made during an outage are simply gone.
    const offer = pickResumable(scratch({ projectId: 41, updatedAt: '2025-08-14T12:00:00.000Z' }), [
      named(),
    ]);

    expect(offer).toMatchObject({
      projectId: 41,
      name: 'Montage',
      updatedAt: '2025-08-14T12:00:00.000Z',
      clips: [clip],
    });
  });

  it('prefers the row when the two are the same age', () => {
    const offer = pickResumable(
      scratch({ projectId: 41, updatedAt: '2025-08-14T09:00:01.000Z' }),
      [named()],
    );

    expect(offer?.clips).toEqual([{ ...clip, trimEnd: 20 }]);
  });

  it('is offered unnamed when the draft it belonged to has gone', () => {
    /*
     * Deleted while the editor was closed, or absent from a restored backup.
     * The timeline is still real work so it is still offered, and it is
     * offered as a scratch timeline: calling it by the name of something that
     * no longer exists would be a lie, and reattaching to a row that is not
     * there would fail on the next autosave beat.
     */
    const offer = pickResumable(scratch({ projectId: 41 }), [named({ id: 42, name: 'Other' })]);

    expect(offer).toMatchObject({ projectId: null, name: 'Autosave', clips: [clip] });
  });

  it('is offered unnamed when the library list could not be read', () => {
    // `loadDrafts` logs and leaves the list alone on a failure, so an empty
    // list has to mean "no draft to name" rather than "no work to offer".
    expect(pickResumable(scratch({ projectId: 41 }), [])).toMatchObject({ projectId: null });
  });
});

describe('a stamp that will not parse', () => {
  it('does not let the scratch record win on nonsense', () => {
    // As text, `'yesterday' > '2025-08-14T...'`. The store has no schema, so
    // the comparison is a parse and not a string compare.
    const offer = pickResumable(scratch({ projectId: 41, updatedAt: 'yesterday' }), [named()]);

    expect(offer?.clips).toEqual([{ ...clip, trimEnd: 20 }]);
  });

  it('lets a real stamp win over a row with a broken one', () => {
    const offer = pickResumable(scratch({ projectId: 41 }), [named({ updatedAt: 'whenever' })]);

    expect(offer?.clips).toEqual([clip]);
  });
});

describe('opening a draft from the list', () => {
  it('carries the row id, so editing reattaches to it rather than forking', () => {
    // 1.x's drafts dialog handed over a record whose `serverId` was optional,
    // and an autosave into a draft with no id went to the scratch record
    // instead: the shadow copy the composable's comments warn about.
    expect(draftAsResumable(named())).toEqual({
      projectId: 41,
      name: 'Montage',
      updatedAt: '2025-08-14T09:00:01.000Z',
      clips: [{ ...clip, trimEnd: 20 }],
      audio: [],
    });
  });
});
