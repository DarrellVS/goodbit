<script lang="ts" setup>
import { Icon } from '@iconify/vue';

/**
 * The title of the screen, and the search field. Nothing else.
 *
 * It held two more things and neither belonged here. **Rescan** was solid
 * orange, the colour this app keeps for the thing it wants you to press, for an
 * operation that is a backstop: the watcher, the incoming folder and a six
 * hourly sweep have already done it. It is in Settings now, next to the folder
 * it scans. **Tags** was a button that opened a filter, one row above the
 * filters, so filtering by tag was in a different place from filtering by
 * everything else; it is a dropdown in the filter row now.
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
  <header class="bg-card/5 backdrop-blur-sm">
    <div class="px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold">{{ title || 'My Library' }}</h2>
          <p
            v-if="subtitle"
            class="text-sm mt-1 text-muted-500"
          >
            {{ subtitle }}
          </p>
        </div>
        <div class="relative">
          <Icon icon="material-symbols:search" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-400" />
          <input
            id="global-search-input"
            type="text"
            :value="search"
            placeholder="Search names, dates and tags"
            class="pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-400 outline-hidden focus:ring-2 focus:ring-accent/50 transition w-96"
            @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </div>
  </header>
</template>
