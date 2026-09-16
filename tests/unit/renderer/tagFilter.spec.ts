import { describe, expect, it } from 'vitest';
import {
  tagFilterOptions,
  tagFilterSelection,
  tagFilterSummary,
} from '../../../src/renderer/src/utils/tagFilter';

const TAGS = [
  { id: 1, name: 'clutch' },
  { id: 2, name: 'funny' },
  { id: 3, name: 'headshot' },
];

describe('the rows the tag filter offers', () => {
  it('offers every tag the library knows', () => {
    expect(tagFilterOptions(TAGS)).toEqual([
      { value: 'clutch', label: 'clutch' },
      { value: 'funny', label: 'funny' },
      { value: 'headshot', label: 'headshot' },
    ]);
  });

  it('keeps a chosen tag the store has not got', () => {
    /*
     * The dropdown drops a chosen value its options do not mention, which is
     * right for a tag that was deleted and wrong for one the store has not
     * loaded yet: the control would show "Any tag" over a list that is being
     * filtered by something. A filter has to admit what it is filtering by.
     */
    const options = tagFilterOptions(TAGS, ['headshot', 'sniper']);

    expect(options.map((option) => option.value)).toEqual([
      'clutch',
      'funny',
      'headshot',
      'sniper',
    ]);
  });

  it('never offers the empty string', () => {
    // Reka reserves it for "nothing is selected" and throws on an option that
    // uses it, which would take the whole filter row down with it.
    const options = tagFilterOptions([{ name: '' }, { name: 'funny' }], ['']);

    expect(options).toEqual([{ value: 'funny', label: 'funny' }]);
  });
});

describe('what the tag filter turns into a query', () => {
  it('hands back the chosen names, in the order they were chosen', () => {
    expect(tagFilterSelection(['clutch', 'headshot'])).toEqual(['clutch', 'headshot']);
  });

  it('is a comma separated list by the time it reaches the API', () => {
    // `GET /clips?tags=` requires all of them, which is why two tags narrow.
    expect(tagFilterSelection(['clutch', 'headshot']).join(',')).toBe('clutch,headshot');
  });

  it('reads nothing chosen as no filter at all', () => {
    expect(tagFilterSelection(null)).toEqual([]);
    expect(tagFilterSelection([])).toEqual([]);
  });

  it('takes a bare value as well as a list', () => {
    // The component's own type allows one, since the same control is used
    // without `multiple` elsewhere.
    expect(tagFilterSelection('funny')).toEqual(['funny']);
  });

  it('names the count rather than counting it anonymously', () => {
    // The component's default is "2 selected", which is true of anything.
    expect(tagFilterSummary([
      { value: 'clutch', label: 'clutch' },
      { value: 'funny', label: 'funny' },
    ])).toBe('2 tags');
  });
});
