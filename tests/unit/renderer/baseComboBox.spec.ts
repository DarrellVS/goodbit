// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, reactive, type App } from 'vue';
import BaseComboBox from '../../../src/renderer/src/components/Base/BaseComboBox.vue';
import type { ComboBoxOption, ComboBoxValue } from '../../../src/renderer/src/components/Base/types';

/**
 * The one dropdown, checked where checking is cheap.
 *
 * This is a component and not a pure function, so it is in the unit suite under
 * protest: it needs a window, which `// @vitest-environment happy-dom` buys,
 * and it does not need ffmpeg, a database or a GPU, which is the line the suite
 * actually draws. What is asserted here is the part that is ours rather than
 * Reka UI's: which options get drawn, what a search term does to them, and what
 * value comes back out on a choice. Reka's keyboard handling and focus
 * management are not retested here, and the open list's *appearance* cannot be
 * checked without a screen.
 */

/**
 * Iconify fetches an icon it has not seen from `api.iconify.design`, which a
 * unit test must not do. The stub keeps the name in an attribute, which is the
 * only thing worth asserting anyway.
 */
vi.mock('@iconify/vue', async () => {
  const { h: createElement } = await import('vue');
  return {
    Icon: {
      props: { icon: String },
      setup: (props: { icon?: string }) => () => createElement('i', { 'data-icon': props.icon }),
    },
  };
});

const SORTS: ComboBoxOption[] = [
  { value: 'newest', label: 'Newest first', icon: 'material-symbols:schedule' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest first' },
];

const TAGS: ComboBoxOption[] = [
  { value: 'clutch', label: 'Clutch', count: 12, description: 'Won it on the last life' },
  { value: 'funny', label: 'Funny', count: 3 },
  { value: 'headshot', label: 'Headshot', count: 41 },
];

type Props = {
  modelValue: ComboBoxValue | ComboBoxValue[] | null;
  label: string;
  options: ComboBoxOption[];
  placeholder?: string;
  searchable?: boolean;
  multiple?: boolean;
  summary?: (selected: ComboBoxOption[]) => string;
};

type Harness = {
  /** Every value the dropdown has emitted, oldest first. */
  emitted: (ComboBoxValue | ComboBoxValue[] | null)[];
  /** The closed control. */
  trigger: () => HTMLButtonElement;
  /** Every row the open list is drawing, in order. */
  rows: () => HTMLElement[];
  /** The search field, when the list has one. */
  search: () => HTMLInputElement | null;
  open: () => Promise<void>;
  /** Types into the search field the way a person does, one whole term. */
  type: (term: string) => Promise<void>;
  click: (label: string) => Promise<void>;
  set: (patch: Partial<Props>) => Promise<void>;
};

let mounted: App | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = '';
});

function mount(props: Props): Harness {
  const state = reactive<Props>({ ...props });
  const emitted: Harness['emitted'] = [];

  const host = document.createElement('div');
  document.body.appendChild(host);

  mounted = createApp({
    render: () =>
      h(BaseComboBox, {
        ...state,
        'onUpdate:modelValue': (value: ComboBoxValue | ComboBoxValue[] | null) => {
          emitted.push(value);
          state.modelValue = value;
        },
      }),
  });
  mounted.mount(host);

  const trigger = (): HTMLButtonElement => {
    const element = document.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    if (!element) throw new Error('the dropdown drew no closed control');
    return element;
  };

  // The list is portalled to the body, so it is found from the document and
  // not from the host element.
  const rows = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

  const search = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('input[role="combobox"]:not(.sr-only)');

  async function settle(): Promise<void> {
    // Two turns: one for the state change, one for the popper's own reaction to
    // the content it was given.
    await nextTick();
    await nextTick();
  }

  return {
    emitted,
    trigger,
    rows,
    search,
    async open() {
      trigger().click();
      await settle();
    },
    async type(term: string) {
      const field = search();
      if (!field) throw new Error('the list has no search field');
      field.value = term;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },
    async click(label: string) {
      const row = rows().find((element) => element.textContent?.includes(label));
      if (!row) throw new Error(`no row reads "${label}"`);
      row.click();
      await settle();
    },
    async set(patch: Partial<Props>) {
      Object.assign(state, patch);
      await settle();
    },
  };
}

describe('the closed control', () => {
  it('reads the chosen option, and is reachable by keyboard', () => {
    const box = mount({ modelValue: 'oldest', label: 'Order the clips', options: SORTS });

    expect(box.trigger().textContent).toContain('Oldest first');
    /*
     * Reka puts `tabindex="-1"` on `ComboboxTrigger`, because in its own layout
     * the trigger is a chevron beside an input that holds the tab stop. Here
     * the trigger is the whole closed control, so `-1` would mean the dropdown
     * could not be reached at all. If this ever reads `-1` again, the override
     * in the component stopped landing.
     */
    expect(box.trigger().getAttribute('tabindex')).toBe('0');
    expect(box.trigger().getAttribute('aria-label')).toBe('Order the clips');
    expect(box.trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('reads the placeholder when nothing is chosen', () => {
    const box = mount({
      modelValue: null,
      label: 'Tags',
      options: TAGS,
      placeholder: 'Any tag',
    });

    expect(box.trigger().textContent).toContain('Any tag');
  });

  it('draws the chosen option icon', () => {
    const box = mount({ modelValue: 'newest', label: 'Order', options: SORTS });

    expect(box.trigger().querySelector('[data-icon="material-symbols:schedule"]')).not.toBeNull();
  });

  it('never draws the chosen option count or its second line', () => {
    const box = mount({ modelValue: 'clutch', label: 'Tags', options: TAGS });

    /*
     * Twelve clips carry Clutch and it has a sentence explaining it. Neither
     * belongs on the closed control: a count is a fact about the list rather
     * than about the choice, a second line is a second line, and this control
     * has one height.
     */
    expect(box.trigger().textContent).toContain('Clutch');
    expect(box.trigger().textContent).not.toContain('12');
    expect(box.trigger().textContent).not.toContain('last life');
  });

  it('finds the option for a value that was stored as a string', () => {
    /*
     * The `<select>` this replaces round-tripped every value through the DOM,
     * so a page size written as `'25'` by an earlier version and the option
     * `25` were one choice. Matching strictly would show the placeholder over a
     * setting the user had picked.
     */
    const sizes: ComboBoxOption[] = [
      { value: 25, label: '25' },
      { value: 50, label: '50' },
    ];
    const box = mount({ modelValue: '25', label: 'Items per page', options: sizes });

    expect(box.trigger().textContent).toContain('25');
  });
});

describe('the open list', () => {
  it('draws every option, with its count and its second line', async () => {
    const box = mount({ modelValue: null, label: 'Tags', options: TAGS });
    await box.open();

    expect(box.rows().map((row) => row.textContent?.trim())).toEqual([
      'ClutchWon it on the last life12',
      'Funny3',
      'Headshot41',
    ]);
    expect(box.trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('marks the chosen row and only that row', async () => {
    const box = mount({ modelValue: 'oldest', label: 'Order', options: SORTS });
    await box.open();

    const checked = box.rows().filter((row) => row.dataset.state === 'checked');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain('Oldest first');
  });

  it('refuses a disabled row', async () => {
    const box = mount({
      modelValue: null,
      label: 'Order',
      options: [...SORTS, { value: 'shortest', label: 'Shortest first', disabled: true }],
    });
    await box.open();
    await box.click('Shortest first');

    expect(box.emitted).toEqual([]);
  });
});

describe('searching', () => {
  it('is off unless asked for', async () => {
    const box = mount({ modelValue: null, label: 'Tags', options: TAGS });
    await box.open();

    expect(box.search()).toBeNull();
    /*
     * There is still an input, screen reader only and read only: it is where
     * Reka's arrow keys, Enter and `aria-activedescendant` come from. If this
     * ever disappears, the keyboard behaviour went with it.
     */
    const hidden = document.querySelector<HTMLInputElement>('input[role="combobox"].sr-only');
    expect(hidden).not.toBeNull();
    expect(hidden?.readOnly).toBe(true);
  });

  it('drops the rows that do not match', async () => {
    const box = mount({ modelValue: null, label: 'Tags', options: TAGS, searchable: true });
    await box.open();

    expect(box.rows()).toHaveLength(3);

    await box.type('head');
    expect(box.rows().map((row) => row.textContent?.trim())).toEqual(['Headshot41']);
  });

  it('matches a label and not a second line', async () => {
    const box = mount({ modelValue: null, label: 'Tags', options: TAGS, searchable: true });
    await box.open();

    /*
     * Clutch is the tag whose description reads "Won it on the last life". A
     * row that appears because of text the search box cannot see is a row that
     * appeared for no reason, so each option is registered under its label
     * alone.
     */
    await box.type('last life');
    expect(box.rows()).toHaveLength(0);
  });

  it('says so when nothing matches', async () => {
    const box = mount({ modelValue: null, label: 'Tags', options: TAGS, searchable: true });
    await box.open();
    await box.type('sniper');

    expect(box.rows()).toHaveLength(0);
    expect(document.body.textContent).toContain('Nothing matches');
  });
});

describe('choosing', () => {
  it('emits the option own value, with its own type', async () => {
    const sizes: ComboBoxOption[] = [
      { value: 25, label: '25' },
      { value: 50, label: '50' },
    ];
    const box = mount({ modelValue: 25, label: 'Items per page', options: sizes });
    await box.open();
    await box.click('50');

    expect(box.emitted).toEqual([50]);
    expect(typeof box.emitted[0]).toBe('number');
  });

  it('closes on a choice, and the closed control reads the new one', async () => {
    const box = mount({ modelValue: 'newest', label: 'Order', options: SORTS });
    await box.open();
    await box.click('Longest first');

    expect(box.emitted).toEqual(['longest']);
    expect(box.rows()).toHaveLength(0);
    expect(box.trigger().textContent).toContain('Longest first');
  });

  it('follows a value changed from outside', async () => {
    const box = mount({ modelValue: 'newest', label: 'Order', options: SORTS });
    await box.set({ modelValue: 'oldest' });

    expect(box.trigger().textContent).toContain('Oldest first');
    expect(box.emitted).toEqual([]);
  });
});

describe('more than one at a time', () => {
  it('emits an array and keeps the list open', async () => {
    const box = mount({ modelValue: [], label: 'Tags', options: TAGS, multiple: true });
    await box.open();

    await box.click('Clutch');
    expect(box.emitted.at(-1)).toEqual(['clutch']);
    // A tag filter is built one tag at a time, so the list must not shut after
    // the first one.
    expect(box.rows()).toHaveLength(3);

    await box.click('Headshot');
    expect(box.emitted.at(-1)).toEqual(['clutch', 'headshot']);
  });

  it('takes a chosen one back off', async () => {
    const box = mount({
      modelValue: ['clutch', 'funny'],
      label: 'Tags',
      options: TAGS,
      multiple: true,
    });
    await box.open();
    await box.click('Funny');

    expect(box.emitted.at(-1)).toEqual(['clutch']);
  });

  it('counts the choices by default', () => {
    const box = mount({
      modelValue: ['clutch', 'funny'],
      label: 'Tags',
      options: TAGS,
      multiple: true,
    });

    expect(box.trigger().textContent).toContain('2 selected');
  });

  it('lets a caller name them instead', () => {
    const box = mount({
      modelValue: ['clutch', 'funny'],
      label: 'Tags',
      options: TAGS,
      multiple: true,
      summary: (selected) => `${selected.length} tags`,
    });

    expect(box.trigger().textContent).toContain('2 tags');
  });

  it('reads the one chosen thing by name, not as a number', () => {
    const box = mount({
      modelValue: ['headshot'],
      label: 'Tags',
      options: TAGS,
      multiple: true,
    });

    expect(box.trigger().textContent).toContain('Headshot');
  });
});
