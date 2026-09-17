<script setup lang="ts">
import { computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useTheme, type ThemeChoice } from '@renderer/composables/ui/useTheme';
import SettingToggle from './SettingToggle.vue';
import SettingSelect from './SettingSelect.vue';
import HiddenGamesCard from './HiddenGamesCard.vue';

/**
 * How the library looks, how a clip plays, and what is in it at all.
 *
 * Three rooms became one. General was appearance, layout and paging with a
 * delete confirmation dropped in; Playback was three switches about what a card
 * does under the pointer, with a section of its own; Games was a list with no
 * settings in it. None of the three was a category: all of them were answers to
 * "what do I see when I open GoodBit", which is a thing somebody actually comes
 * here to change.
 */
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
  <section>
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Watching</h2>
      <p class="mt-2 text-muted-500">
        How your library looks, how clips play, and which games you see
      </p>
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
        v-model="config.public.value.showMetadata"
        label="Show Clip Metadata"
        description="Display file size, resolution, and other details"
      />

      <SettingToggle
        v-model="config.public.value.compactMode"
        label="Compact Mode"
        description="Reduce spacing and show more content"
      />
    </div>

    <!--
      What a card does under the pointer. Three switches, which had a section of
      their own called Playback and now sit under a rule, because they are the
      same question as the six above: what happens when you look at the library.
    -->
    <div class="space-y-4 pt-2 border-t border-border">
      <h3 class="font-medium text-foreground pt-4">While the pointer is over a clip</h3>

      <SettingToggle
        v-model="config.public.value.autoPlayOnHover"
        label="Auto-play on Hover"
        description="Automatically play clips when hovering over them"
      />

      <SettingToggle
        v-model="config.public.value.hoverScrub"
        label="Scrub on Hover"
        description="Move the pointer across the bottom third of a clip to seek through it"
      />

      <SettingToggle
        v-model="config.public.value.muteVideosByDefault"
        label="Mute Videos by Default"
        description="Start videos muted (can be unmuted manually)"
      />
    </div>

    <!--
      Hiding a game is not a setting about games, it is a setting about what the
      library shows, which is why it is the last thing on this page rather than
      a section of its own holding no settings at all.
    -->
    <HiddenGamesCard />
  </section>
</template>
