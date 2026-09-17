import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue';
import { useToastStore } from '@renderer/stores/toast';
import { SETTINGS_CATALOG, type SettingEntry } from '@renderer/utils/settingsCatalog';
import { searchSettings } from '@renderer/utils/settingsSearch';

/**
 * The one query, shared by the field and by every row that might be its answer.
 *
 * Module-level, like `useAppSettings`, because the field is in the sidebar and
 * the row it points at is somewhere inside whichever section is on screen.
 * Threading a string and a highlight down through `SettingsPage`, a section and
 * a card to reach a `SettingToggle` would put two props on every settings
 * component for the benefit of one of them at a time.
 */
const query = ref('');

/**
 * The label of the row a result just pointed at, or nothing.
 *
 * A label rather than an index: the catalogue's labels are unique and each row
 * already carries its own as `data-setting`, so this needs no second identifier
 * to keep in step with the first.
 */
const highlighted = ref<string | null>(null);

/**
 * Which result Enter would open.
 *
 * Here rather than in the field, because the field owns the arrow keys and the
 * list has to draw the answer, and they are two components with the sidebar
 * between them.
 */
const activeIndex = ref(0);

/** So a second result cancels the first one's fade rather than racing it. */
let fadeTimer: number | undefined;
/** So a section that has not drawn the row yet is not chased for ever. */
let findTimer: number | undefined;

/** How long the ring stays after landing on the row. */
const FADE_MS = 4000;

/**
 * A row can be behind a switch that is off (the chime volume is only drawn once
 * the clip card is on) or behind a fetch that has not answered (the MCP client
 * list). The scroll is tried again a few times rather than once, and then given
 * up on: the result still moved to the right section, which is the part the
 * search promised.
 */
const FIND_ATTEMPTS = [0, 150, 400, 900];

export interface SettingsSearch {
  query: Ref<string>;
  results: ComputedRef<SettingEntry[]>;
  /** True while somebody is typing, which is when the results replace the page. */
  searching: ComputedRef<boolean>;
  highlighted: Ref<string | null>;
  /** Which result the arrow keys are on, and Enter would open. */
  activeIndex: Ref<number>;
  active: ComputedRef<SettingEntry | null>;
  /** Walk the results, stopping at each end rather than wrapping. */
  move: (delta: number) => void;
  /** The ring a row wears when it is the one that was searched for. */
  settingRing: (label: string) => string;
  /** Point at a row: ring it, and scroll to it once its section has drawn. */
  reveal: (entry: SettingEntry) => void;
  /** Leave the search behind, on the way out of Settings. */
  reset: () => void;
}

function clearTimers(): void {
  window.clearTimeout(fadeTimer);
  window.clearTimeout(findTimer);
  fadeTimer = undefined;
  findTimer = undefined;
}

/**
 * Scroll to a row, and say when there is no row to scroll to.
 *
 * `onMissing` is the whole point of the change: this used to run out of
 * attempts and return, so a search result for a row that is behind a `v-if`
 * navigated you to its section and then did nothing at all.
 */
function scrollToSetting(label: string, onMissing: () => void, attempt = 0): void {
  const target = document.querySelector(`[data-setting="${CSS.escape(label)}"]`);

  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const next = FIND_ATTEMPTS[attempt + 1];
  if (next === undefined) {
    onMissing();
    return;
  }
  findTimer = window.setTimeout(() => scrollToSetting(label, onMissing, attempt + 1), next);
}

export function useSettingsSearch(): SettingsSearch {
  const results = computed(() => searchSettings(query.value, SETTINGS_CATALOG));
  const searching = computed(() => query.value.trim() !== '');
  const active = computed(() => results.value[activeIndex.value] ?? null);

  function move(delta: number): void {
    const last = results.value.length - 1;
    if (last < 0) return;
    activeIndex.value = Math.min(Math.max(activeIndex.value + delta, 0), last);
  }

  function settingRing(label: string): string {
    return highlighted.value === label
      ? 'ring-2 ring-accent ring-offset-2 ring-offset-background rounded-lg'
      : '';
  }

  function reveal(entry: SettingEntry): void {
    clearTimers();
    highlighted.value = entry.label;

    // The results panel is what is on screen; the section has to replace it
    // before there is anything to scroll to.
    void nextTick(() =>
      scrollToSetting(entry.label, () => {
        highlighted.value = null;
        useToastStore().info(
          entry.shownWhen
            ? `${entry.label} appears once ${entry.shownWhen}.`
            : `${entry.label} is not on this screen at the moment.`,
          'Not shown right now',
        );
      }),
    );

    /*
     * The ring goes on its own.
     *
     * It is there to answer "which of these ten rows did I ask for", which is a
     * question somebody has stopped asking a few seconds after they can see the
     * answer. Left on, it reads as a state the row is in.
     */
    fadeTimer = window.setTimeout(() => {
      highlighted.value = null;
    }, FADE_MS);
  }

  function reset(): void {
    clearTimers();
    query.value = '';
    highlighted.value = null;
    activeIndex.value = 0;
  }

  return {
    query,
    results,
    searching,
    highlighted,
    activeIndex,
    active,
    move,
    settingRing,
    reveal,
    reset,
  };
}
