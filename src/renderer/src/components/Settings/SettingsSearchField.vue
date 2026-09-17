<script setup lang="ts">
import { ref } from 'vue';
import { Icon } from '@iconify/vue';
import BaseField from '@renderer/components/Base/BaseField.vue';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import type { SettingEntry } from '@renderer/utils/settingsCatalog';

/**
 * The field, above the list of rooms it makes optional.
 *
 * It sits in the sidebar rather than over the panel because it answers the
 * sidebar's question. The seven names were the only way to find a setting, and
 * where a given one lives is not guessable from any of them; this is the same
 * question asked the other way round, by typing what the thing is called.
 *
 * The keyboard is here and the list is elsewhere, which is why the active
 * result lives in `useSettingsSearch` rather than in either of them.
 */
interface Emits {
  (e: 'select', entry: SettingEntry): void;
}

const emit = defineEmits<Emits>();

const { query, results, active, activeIndex, move, reset } = useSettingsSearch();
const field = ref<HTMLInputElement | null>(null);

function onInput(): void {
  // Every keystroke changes the list under the cursor, so the cursor goes back
  // to the top of it rather than staying on whatever row that position now is.
  activeIndex.value = 0;
}

function onEnter(): void {
  if (active.value) emit('select', active.value);
}

/**
 * Escape empties the field, and only then gives the key back.
 *
 * A dialog or a route change on the first press would take somebody out of
 * Settings while they were in the middle of looking for something in it.
 */
function onEscape(event: KeyboardEvent): void {
  if (!query.value) return;
  event.stopPropagation();
  reset();
}

function clear(): void {
  reset();
  field.value?.focus();
}
</script>

<template>
  <div class="px-4 pt-5 pb-3">
    <!--
      The same field the library's search is, because they are the same kind
      of thing: a rule under the text, not a filled pill. It was a bordered box
      on its own ground, sitting in a column that has no ground, which made it
      the only object on that column rather than the first line of it.
    -->
    <BaseField icon="material-symbols:search">
      <input
        ref="field"
        v-model="query"
        type="search"
        aria-label="Search settings"
        placeholder="Search settings"
        autocomplete="off"
        spellcheck="false"
        class="text-sm"
        @input="onInput"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="onEnter"
        @keydown.esc="onEscape"
      />
      <template #trailing>
        <button
          v-if="query"
          type="button"
          class="size-6 inline-flex items-center justify-center shrink-0 rounded-sm text-muted-400 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
          aria-label="Clear the search"
          @click="clear"
        >
          <Icon icon="material-symbols:close" class="size-4 shrink-0 block" />
        </button>
      </template>
    </BaseField>

    <p v-if="query" class="pt-2 text-xs text-muted-500">
      {{ results.length }}
      {{ results.length === 1 ? 'setting' : 'settings' }}
      across every section
    </p>
  </div>
</template>
