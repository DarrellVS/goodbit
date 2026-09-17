<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { ObsSetupTile } from '@renderer/utils/obsSetupWizard';

/**
 * The quick route's answer, at a glance.
 *
 * Four lines saying what was decided, over the full list of every file and key,
 * which is still a click away underneath. `quickSummaryTiles` builds them.
 */

interface Props {
  tiles: ObsSetupTile[];
}

defineProps<Props>();
</script>

<template>
  <div class="grid sm:grid-cols-2 gap-2">
    <div
      v-for="tile in tiles"
      :key="tile.label"
      class="p-3 rounded-md border border-border flex items-start gap-2.5"
    >
      <Icon :icon="tile.icon" class="text-base text-muted-500 shrink-0 mt-0.5" />
      <div class="min-w-0">
        <p class="text-xs text-muted-500">{{ tile.label }}</p>
        <p class="text-sm text-foreground">
          {{ tile.value }}
          <span
            v-if="tile.badge"
            class="ml-1 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold tracking-wide bg-accent/15 text-accent-ink border border-accent/30"
          >
            {{ tile.badge }}
          </span>
        </p>
      </div>
    </div>
  </div>

  <p class="text-xs text-muted-500">
    Into a profile and scene of its own. Yours are not touched.
  </p>
</template>
