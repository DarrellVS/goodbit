<script setup lang="ts">
import type { NotchAction, NotchResult } from '@shared/notch';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

/**
 * The found peek, opened: what the sweep found, and the one thing to do next.
 *
 * The peek says "Found 4 GoodBits" and folds away, which leaves somebody who
 * wants them hunting through the library. Resting the pointer on it opens this,
 * and the button puts every clip that held a moment in the editor, each cut to
 * what was found in it.
 */
defineProps<{ result: NotchResult }>();
const emit = defineEmits<{ act: [action: NotchAction] }>();
</script>

<template>
  <div class="flex h-full flex-col px-5 pb-[18px] pt-4">
    <div class="flex items-center gap-2.5">
      <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
        <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <span class="text-[14px] font-semibold text-muted-900">
        Found {{ result.found }} {{ result.found === 1 ? 'GoodBit' : 'GoodBits' }}
      </span>
      <span class="text-[13px] text-muted-400">
        in {{ result.clipIds.length }} {{ result.clipIds.length === 1 ? 'clip' : 'clips' }}
      </span>
    </div>

    <p class="mt-1.5 pl-[30px] text-[12.5px] text-muted-400">
      Each clip opens cut to its highlights.
    </p>

    <div class="mt-auto">
      <BaseButton tone="strong" class="w-full" @click="emit('act', 'edit-highlights')">
        Open in the editor
      </BaseButton>
    </div>
  </div>
</template>
