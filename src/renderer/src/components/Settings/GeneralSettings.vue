<script setup lang="ts">
import { computed } from 'vue';
import { useConfiguration } from '../../composables/useConfiguration';
import { useTheme, type ThemeChoice } from '../../composables/useTheme';
import SettingToggle from './SettingToggle.vue';
import SettingSelect from './SettingSelect.vue';

const config = useConfiguration();

const { theme: themeChoice, setTheme } = useTheme();

// SettingSelect speaks in strings and numbers; the theme is a narrower union.
const theme = computed({
  get: () => themeChoice.value as string,
  set: (value: string | number) => setTheme(String(value) as ThemeChoice),
});

/*
 * The icons are new, and they are the reason `BaseComboBox` exists rather than
 * a styled `<select>`: an `<option>` can hold text and nothing else.
 */
const themeOptions = [
  { value: 'system', label: 'Match my system', icon: 'material-symbols:computer' },
  { value: 'light', label: 'Light', icon: 'material-symbols:light-mode' },
  { value: 'dark', label: 'Dark', icon: 'material-symbols:dark-mode' },
];

const pageSizeOptions = [
  { value: 10, label: '10' },
  { value: 15, label: '15' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 200, label: '200' },
];

/*
 * The icons and the words come from `Base/BaseViewModeToggle.vue`, which drew
 * this choice as two buttons over the clips and no longer exists.
 *
 * Both are load-bearing. The obvious pair of icons was read backwards by every
 * tester, because a grid icon reads as "more, smaller" and this one gives four
 * columns under day headings while the agenda icon gives two wide ones; these
 * are the ones that matched what each mode produces. The names and the second
 * lines were the toggle's tooltips, which said what you get and what you lose,
 * and "Grouped" and "Grid" said neither.
 */
const viewModeOptions = [
  {
    value: 'grouped',
    label: 'By day',
    icon: 'material-symbols:grid-view',
    description: 'More clips per row, grouped under the day they were recorded',
  },
  {
    value: 'grid',
    label: 'Big',
    icon: 'material-symbols:view-agenda',
    description: 'Fewer, larger clips in one run, with no day headings',
  },
];

const dateFormatOptions = [
  { value: 'relative', label: 'Relative (Today, Yesterday)' },
  { value: 'absolute', label: 'Absolute (MM/DD/YYYY)' },
];
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">General Settings</h2>
      <p class="text-sm text-muted-500">General application settings and preferences</p>
    </div>

    <div class="space-y-4">
      <SettingSelect
        v-model="theme"
        label="Appearance"
        description="Follow the system, or pick a side"
        :options="themeOptions"
      />

      <!--
        Not a default, which is what it used to call itself. There is one stored
        value and this is it, which is why changing it here changes the library
        immediately. It is also the only control for it now: the toggle that
        floated over the clips is gone, and this, the `L` key and the command
        palette are what is left, neither of the last two occupying any screen.
      -->
      <SettingSelect
        v-model="config.public.value.viewMode"
        label="How clips are laid out"
        description="Takes effect straight away, on the library and in a collection. The L key switches it too."
        :options="viewModeOptions"
      />

      <SettingSelect
        v-model="config.public.value.dateFormat"
        label="Date Format"
        description="How dates should be displayed"
        :options="dateFormatOptions"
      />

      <SettingToggle
        v-model="config.public.value.showMetadata"
        label="Show Clip Metadata"
        description="Display file size, resolution, and other details"
      />

      <SettingToggle
        v-model="config.public.value.compactMode"
        label="Compact Mode"
        description="Reduce spacing and show more content"
      />

      <!--
        No `.number` on this one any more. A modifier on a component's `v-model`
        only arrives as a `modelModifiers` prop for the component to apply, and
        this one never declared it, so it did nothing here except fall through
        to the row's own `<div>` as an attribute. The dropdown emits the
        option's own value, and these options are numbers.
      -->
      <SettingSelect
        v-model="config.public.value.pageSize"
        label="Items Per Page"
        description="Number of clips to load at once (lower = faster)"
        :options="pageSizeOptions"
      />

      <SettingToggle
        v-model="config.public.value.confirmBeforeDelete"
        label="Confirm Before Delete"
        description="Ask for confirmation when deleting clips"
      />
    </div>
  </section>
</template>

