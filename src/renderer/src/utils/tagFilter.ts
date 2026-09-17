import type { ComboBoxOption, ComboBoxValue } from '@renderer/components/Base/types';

/**
 * The library's tag filter, as values rather than as a control.
 *
 * Filtering by tag used to be a button in the header that opened a popover,
 * one row above and one click away from the filters it belongs with. It is a
 * multi-select `Base/BaseComboBox.vue` in the filter row now, and what it hands
 * back goes straight to `clipsStore.setTags`, which joins it with commas for
 * `GET /clips?tags=`. That endpoint requires *all* of them, which is why
 * choosing two narrows rather than widens.
 */

/**
 * Every tag the library knows, plus anything already being filtered by.
 *
 * The dropdown drops a chosen value its options do not mention, which is right
 * for a deleted tag and wrong for one the store has not loaded yet: the list
 * would be filtered by a tag the control did not admit to. A filter has to be
 * able to show what it is filtering by, so a selected name that is not in the
 * store is carried as an option of its own.
 *
 * A tag with no name is dropped outright. Reka reserves the empty string for
 * "nothing is selected" and throws on an option that uses it, and `TagDTO`
 * refuses one anyway, so this is a guard rather than a case.
 */
export function tagFilterOptions(
  tags: ReadonlyArray<{ name: string }>,
  selected: readonly string[] = [],
): ComboBoxOption[] {
  const known = tags.map((tag) => tag.name).filter((name) => name !== '');
  const unknown = selected.filter((name) => name !== '' && !known.includes(name));

  return [...known, ...unknown].map((name) => ({ value: name, label: name }));
}

/**
 * What came back out of the dropdown, as the store's `selectedTags`.
 *
 * `multiple` makes the value an array, but the component's type allows a bare
 * value and `null`, so both are folded in here rather than at the call site.
 */
export function tagFilterSelection(value: ComboBoxValue | ComboBoxValue[] | null): string[] {
  if (value === null || value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((entry) => String(entry)).filter((name) => name !== '');
}

/**
 * What the closed control reads once more than one tag is chosen.
 *
 * The component's own default counts them as "2 selected", which is true of
 * anything. A filter row has a word for its own plural.
 */
export function tagFilterSummary(selected: ComboBoxOption[]): string {
  return `${selected.length} tags`;
}
