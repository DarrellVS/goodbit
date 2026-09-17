<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { PlannedChange } from '@renderer/services/obs';

/**
 * One file the setup would write, in OBS's own vocabulary.
 *
 * A change is a sentence before it is a key. The summary is what it means, and
 * `details` is exactly what lands: the section and key OBS reads, the value
 * going in, and the value that is there now beside it. `setup.ts` builds all of
 * it; nothing here decides anything.
 *
 * This is the whole reason the wizard has a page called What changes. GoodBit
 * is editing another program's configuration, and the honest version of that is
 * showing the edit before making it.
 */

interface Props {
  change: PlannedChange;
}

defineProps<Props>();
</script>

<template>
  <div class="rounded-md bg-muted-50 overflow-hidden">
    <div class="px-4 py-3 flex items-start gap-2.5 bg-muted-50">
      <Icon
        :icon="
          change.kind === 'create'
            ? 'material-symbols:add-circle'
            : change.kind === 'download'
              ? 'material-symbols:download'
              : 'material-symbols:edit'
        "
        class="text-base text-muted-500 shrink-0 mt-0.5"
      />
      <span class="text-sm font-medium text-foreground">{{ change.title }}</span>
    </div>

    <ul class="px-4 py-3 space-y-1.5">
      <li v-for="line in change.summary" :key="line" class="text-sm text-muted-500 flex gap-2">
        <span class="text-accent-ink/60 shrink-0">&middot;</span>
        <span>{{ line }}</span>
      </li>
    </ul>

    <details class="px-4 pb-3">
      <summary class="text-xs text-muted-500 cursor-pointer hover:text-foreground select-none">
        Exactly what gets written
      </summary>
      <p class="text-[11px] text-muted-500 font-mono break-all mt-2">{{ change.file }}</p>
      <div
        v-for="detail in change.details"
        :key="detail.key + detail.value"
        class="text-[11px] font-mono text-muted-500 flex gap-2 mt-0.5"
      >
        <span class="text-foreground">{{ detail.key }}</span>
        <span>=</span>
        <span class="text-accent-ink break-all">{{ detail.value }}</span>
        <span v-if="detail.was">(was {{ detail.was }})</span>
      </div>
    </details>
  </div>
</template>
