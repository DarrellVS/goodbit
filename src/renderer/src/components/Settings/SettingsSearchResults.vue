<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import type { SettingEntry } from '@renderer/utils/settingsCatalog';
import { SETTING_SECTIONS, sectionLabel } from '@renderer/utils/settingsSections';

/**
 * What the search found, in place of the section that was on screen.
 *
 * Every result is a pointer rather than the control itself. The control is
 * bound to the state its own section loads, so drawing a live switch here would
 * mean a second binding for every setting in the app, which is the drift the
 * catalogue already has one test holding off. What this buys instead is the map
 * that Settings never had: the thing you named, what it does, and which room it
 * is in, for every room at once.
 */
interface Emits {
  (e: 'select', entry: SettingEntry): void;
}

const emit = defineEmits<Emits>();

const { query, results, activeIndex } = useSettingsSearch();

function sectionIcon(entry: SettingEntry): string {
  return (
    SETTING_SECTIONS.find((section) => section.id === entry.section)?.icon ??
    'material-symbols:settings'
  );
}
</script>

<template>
  <section class="space-y-4">
    <div>
      <h2 class="text-xl font-semibold mb-1">Search</h2>
      <p class="text-sm text-muted-500">
        Every setting in GoodBit, whichever section it is in. Pick one to go to it.
      </p>
    </div>

    <ul v-if="results.length" class="space-y-2">
      <li v-for="(entry, index) in results" :key="entry.label">
        <button
          class="w-full text-left flex items-start gap-3 p-4 rounded-lg border transition-colors"
          :class="
            index === activeIndex
              ? 'bg-card border-accent/50 ring-2 ring-accent/20'
              : 'bg-card border-border hover:border-line-strong'
          "
          @click="emit('select', entry)"
          @mouseenter="activeIndex = index"
        >
          <Icon :icon="sectionIcon(entry)" class="text-xl text-muted-400 shrink-0 mt-0.5" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium text-foreground">{{ entry.label }}</span>
              <!--
                The section, on every row. This is the answer to the question
                the sidebar could not answer, so it is said rather than implied
                by where the row happens to sit.
              -->
              <span
                class="px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wide bg-muted-100 text-muted-600"
              >
                {{ sectionLabel(entry.section) }}
              </span>
            </div>
            <p class="text-sm text-muted-500 mt-1 line-clamp-2">{{ entry.description }}</p>
            <!--
              Two of these rows are behind a switch, so the list says which one
              rather than letting somebody press a result that goes nowhere.
            -->
            <p v-if="entry.shownWhen" class="text-xs text-muted-400 mt-1">
              Appears once {{ entry.shownWhen }}.
            </p>
          </div>
          <Icon
            icon="material-symbols:chevron-right"
            class="text-xl text-muted-400 shrink-0 mt-0.5"
          />
        </button>
      </li>
    </ul>

    <!--
      Say what was searched for, not just that it failed. A field that answers
      "No results" to a typo reads as an app that has no such setting.
    -->
    <div v-else class="p-6 rounded-lg border border-border bg-card text-center">
      <p class="text-sm text-foreground">Nothing in Settings matches "{{ query.trim() }}".</p>
      <p class="text-sm text-muted-500 mt-1">
        Try one word instead of two: every word you add has to match.
      </p>
    </div>
  </section>
</template>
