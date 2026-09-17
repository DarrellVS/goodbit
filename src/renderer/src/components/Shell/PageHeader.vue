<script lang="ts" setup>
import BaseField from '@renderer/components/Base/BaseField.vue';

/**
 * The title of the screen, and the search field. Nothing else.
 *
 * It held two more things and neither belonged here. **Rescan** was solid
 * orange, the colour this app keeps for the thing it wants you to press, for an
 * operation that is a backstop: the watcher, the incoming folder and a six
 * hourly sweep have already done it. It is in Settings now, next to the folder
 * it scans. **Tags** was a button that opened a filter, one row above the
 * filters, so filtering by tag was in a different place from filtering by
 * everything else; it is in the Filter popover now, with the game and the
 * state.
 *
 * Editorial rather than chrome. The title is the display face at 34px and the
 * search is a rule under the placeholder, right-aligned and sitting on the
 * subtitle's baseline, which is what `items-end` is for: the two blocks are
 * different heights and the thing that should agree is where they stop, not
 * where they start.
 */
defineProps<{
  search: string;
  title?: string;
  subtitle?: string;
}>();
defineEmits<{
  (e: 'update:search', value: string): void;
}>();
</script>

<template>
  <header class="px-12 pt-8 pb-1">
    <div class="flex items-end gap-8">
      <div class="min-w-0">
        <h1 class="font-display text-hero font-medium tracking-tight text-foreground">
          {{ title || 'My Library' }}
        </h1>
        <p v-if="subtitle" class="mt-2 text-muted-500 max-w-[54ch]">
          {{ subtitle }}
        </p>
      </div>

      <BaseField icon="material-symbols:search" class="ml-auto w-[300px] shrink-0">
        <label class="sr-only" for="global-search-input">Search names, dates and tags</label>
        <input
          id="global-search-input"
          type="search"
          autocomplete="off"
          :value="search"
          placeholder="Search names, dates and tags"
          @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </BaseField>
    </div>
  </header>
</template>
