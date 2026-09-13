import { computed, watch } from 'vue';
import { useLocalStorage, usePreferredDark } from '@vueuse/core';
import { carryOverKey } from '../utils/storageKey';

export type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * Light, dark, or whatever the machine is set to.
 *
 * The choice is stored rather than kept in a store because it has to be applied
 * before anything renders — a store would settle a frame late and flash the
 * wrong palette. `styles.css` holds the two token sets; all this does is decide
 * which one is on the root element.
 */
const THEME_KEY = 'goodbit-theme';
carryOverKey('filmpje-theme', THEME_KEY);

const choice = useLocalStorage<ThemeChoice>(THEME_KEY, 'system');

export function useTheme() {
  const prefersDark = usePreferredDark();

  const isDark = computed(() =>
    choice.value === 'system' ? prefersDark.value : choice.value === 'dark',
  );

  function apply(): void {
    document.documentElement.classList.toggle('dark', isDark.value);
    // Native controls — scrollbars, form widgets — follow this rather than the
    // class, and look wrong against a dark page without it.
    document.documentElement.style.colorScheme = isDark.value ? 'dark' : 'light';
  }

  watch(isDark, apply, { immediate: true });

  function setTheme(value: ThemeChoice): void {
    choice.value = value;
  }

  return { theme: choice, isDark, setTheme };
}

/** Called once at start-up, before the app mounts, so there is no flash. */
export function initTheme(): void {
  carryOverKey('filmpje-theme', THEME_KEY);
  const stored = (localStorage.getItem(THEME_KEY) ?? '"system"').replace(/"/g, '');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = stored === 'dark' || (stored !== 'light' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
