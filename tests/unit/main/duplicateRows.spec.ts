import { describe, expect, it } from 'vitest';
import { planDuplicateRows, type DuplicateCandidate } from '../../../src/main/services/duplicateRows';

const row = (over: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  id: 1,
  filePath: 'D:/Clips/Exports/Edited.mp4',
  displayName: null,
  notes: null,
  starred: false,
  published: false,
  openCount: 0,
  tags: 0,
  marks: 0,
  collections: 0,
  ...over,
});

const BACKSLASH_PATH = String.raw`D:\Clips\Exports\Edited.mp4`;

describe('planDuplicateRows', () => {
  it('retires the empty twin of a published clip, the case found in a real library', () => {
    const plan = planDuplicateRows([
      row({ id: 1150, published: true, openCount: 1, displayName: 'Edited' }),
      row({ id: 1158, filePath: BACKSLASH_PATH, displayName: 'Edited' }),
    ]);
    expect(plan.remove).toEqual([1158]);
    expect(plan.kept).toEqual([]);
  });

  it('treats the two slash spellings and the case of the path as one file', () => {
    const plan = planDuplicateRows([
      row({ id: 1, filePath: 'd:/clips/exports/edited.mp4', starred: true }),
      row({ id: 2, filePath: BACKSLASH_PATH }),
    ]);
    expect(plan.remove).toEqual([2]);
  });

  it('keeps whichever row holds the tags, even when it is the newer one', () => {
    const plan = planDuplicateRows([row({ id: 1 }), row({ id: 2, filePath: BACKSLASH_PATH, tags: 2 })]);
    expect(plan.remove).toEqual([1]);
  });

  it('removes nothing when both rows carry something of their own', () => {
    const plan = planDuplicateRows([
      row({ id: 1, tags: 1 }),
      row({ id: 2, filePath: BACKSLASH_PATH, notes: 'the good one' }),
    ]);
    expect(plan.remove).toEqual([]);
    expect(plan.kept).toHaveLength(1);
  });

  it('keeps a twin whose name differs from the keeper, because the name is the only copy', () => {
    const plan = planDuplicateRows([
      row({ id: 1, published: true, displayName: 'One name' }),
      row({ id: 2, filePath: BACKSLASH_PATH, displayName: 'Another name' }),
    ]);
    expect(plan.remove).toEqual([]);
  });

  it('leaves files that only have one row alone', () => {
    expect(planDuplicateRows([row({ id: 1 }), row({ id: 2, filePath: 'D:/Clips/Other.mp4' })]).remove).toEqual([]);
  });
});
