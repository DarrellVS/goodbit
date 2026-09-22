import { describe, expect, it } from 'vitest';
import {
  andList,
  batchDeleteQuestion,
  clipDeleteQuestion,
  clipTitle,
} from '../../../src/renderer/src/utils/clipDeleteQuestion';

/**
 * What the trimmer's delete asks before it moves a recording to the bin.
 *
 * The rules here are not cosmetic. A delete is reversible for the file and not
 * for the row, and the sentence is the only place that difference is ever
 * stated: the file can be dragged back out of the Recycle Bin, and the tags,
 * notes, marks and chosen name cannot be dragged back with it. So what the
 * question claims has to follow what the clip actually carries, or it is
 * either a lie or a warning about nothing, and a warning about nothing is what
 * trains somebody to press Confirm without reading.
 */
describe('clipDeleteQuestion', () => {
  it('says the file is recoverable, and nothing else, for a clip carrying nothing', () => {
    const question = clipDeleteQuestion({});

    expect(question).toBe(
      'The file goes to the Recycle Bin, so you can still get it back from there.',
    );
    expect(question).not.toContain('only in GoodBit');
  });

  it('treats absent, zero and whitespace as carrying nothing', () => {
    // Whitespace is the one that can arrive from a real row: a notes field
    // emptied by hand leaves a newline behind, and warning about "your notes"
    // over a blank one is the noise this is here to prevent.
    expect(clipDeleteQuestion({ markCount: 0, tagCount: 0, notes: '   \n', displayName: '' })).toBe(
      clipDeleteQuestion({}),
    );
  });

  it('names one loss in the singular, and refers back to it as "it"', () => {
    const question = clipDeleteQuestion({ markCount: 1 });

    expect(question).toContain('1 mark live only in GoodBit');
    expect(question).toContain('does not bring it.');
  });

  it('counts marks and tags, and pluralises each on its own count', () => {
    const question = clipDeleteQuestion({ markCount: 3, tagCount: 1 });

    expect(question).toContain('3 marks');
    expect(question).toContain('1 tag');
    expect(question).toContain('does not bring them.');
  });

  it('lists what it has in one fixed order, marks first and the name last', () => {
    const question = clipDeleteQuestion({
      markCount: 2,
      notes: 'the sniper one',
      tagCount: 4,
      displayName: 'Best shot all week',
    });

    expect(question).toContain(
      '2 marks, your notes, 4 tags and the name you gave it live only in GoodBit',
    );
  });

  it('always says the file itself comes back', () => {
    // The half that is reversible is stated whatever else is true. A question
    // that only listed what is lost would read as though the recording went
    // with it.
    for (const facts of [{}, { markCount: 1 }, { notes: 'x', tagCount: 9 }]) {
      expect(clipDeleteQuestion(facts)).toContain('Recycle Bin');
    }
  });
});

describe('andList', () => {
  it('joins nothing, one, two and three', () => {
    expect(andList([])).toBe('');
    expect(andList(['a'])).toBe('a');
    expect(andList(['a', 'b'])).toBe('a and b');
    expect(andList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('clipTitle', () => {
  it('prefers the name a person chose over the name OBS wrote', () => {
    expect(clipTitle({ displayName: 'Triple', filename: '2026-09-18 21-04-11.mp4' })).toBe('Triple');
  });

  it('falls back to the filename, which is the only name most clips have', () => {
    expect(clipTitle({ displayName: null, filename: 'clip.mp4' })).toBe('clip.mp4');
    expect(clipTitle({ displayName: '  ', filename: 'clip.mp4' })).toBe('clip.mp4');
  });

  it('has something to say about a clip that has not loaded yet', () => {
    expect(clipTitle(null)).toBe('this clip');
  });
});

describe('batchDeleteQuestion', () => {
  it('leads with the number and the space, which is why somebody is here', () => {
    const question = batchDeleteQuestion({ clipCount: 47, freedLabel: '48.2 GB' });

    expect(question).toContain('47 clips');
    expect(question).toContain('48.2 GB');
    expect(question).toContain('Recycle Bin');
  });

  it('counts what is about to be lost rather than hedging about it', () => {
    // "Some of them have tags" is not checkable and 1 against 40 is the whole
    // decision, so the number is stated.
    const question = batchDeleteQuestion({
      clipCount: 47,
      freedLabel: '48.2 GB',
      withMetadataCount: 12,
    });

    expect(question).toContain('12 of the 47 clips');
    expect(question).toContain('have a name, tags, notes or marks');
  });

  it('says nothing about metadata when none of them carries any', () => {
    // The same rule as the single-clip question: a warning that does not apply
    // is what teaches somebody to press Confirm without reading.
    const question = batchDeleteQuestion({ clipCount: 9, freedLabel: '2 GB' });

    expect(question).not.toContain('tags');
    expect(question).not.toContain('notes');
  });

  it('names the one consequence no Recycle Bin covers', () => {
    // A published clip has a link somebody may already have shared, and
    // deleting it locally takes that link down for everybody.
    const question = batchDeleteQuestion({ clipCount: 4, publishedCount: 2 });

    expect(question).toContain('2 of them are published');
    expect(question).toContain('their links will stop working');
  });

  it('reads correctly for one of everything', () => {
    const question = batchDeleteQuestion({
      clipCount: 1,
      freedLabel: '900 MB',
      withMetadataCount: 1,
      publishedCount: 1,
    });

    expect(question).toContain('1 clip,');
    expect(question).toContain('1 of them has a name');
    expect(question).toContain('putting the file back');
    expect(question).toContain('its link will stop working');
  });
});
