<script setup lang="ts">
import { computed } from 'vue';
import { AnimatePresence, motion } from 'motion-v';
import type { NotchPeek } from '@shared/notch';

/**
 * What the corner card used to say, in one line: a promise, then its receipt.
 *
 * The badge holds both halves and crossfades between them, so nothing jumps
 * when the spinner becomes a tick, and the words swap in place rather than the
 * shape closing and reopening.
 */
const props = defineProps<{ peek: NotchPeek }>();

const done = computed(() => props.peek.state === 'saved' || props.peek.state === 'found');
</script>

<template>
  <div class="flex h-full items-center gap-2.5 pl-4 pr-5 whitespace-nowrap">
    <div class="relative size-5 shrink-0">
      <AnimatePresence>
        <motion.svg
          v-if="!done"
          key="spinner"
          class="absolute inset-0 text-accent"
          viewBox="0 0 20 20"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1, rotate: 360 }"
          :exit="{ opacity: 0, scale: 0.6 }"
          :transition="{ rotate: { duration: 0.9, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.15 } }"
        >
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2.4" />
          <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
        </motion.svg>
        <motion.div
          v-else
          key="tick"
          class="absolute inset-0 flex items-center justify-center rounded-full bg-accent text-accent-fg"
          :initial="{ scale: 0.4, opacity: 0 }"
          :animate="{ scale: 1, opacity: 1 }"
          :transition="{ type: 'spring', visualDuration: 0.3, bounce: 0.35 }"
        >
          <svg viewBox="0 0 24 24" class="size-3" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
            <motion.path
              d="M20 6 9 17l-5-5"
              :initial="{ pathLength: 0 }"
              :animate="{ pathLength: 1 }"
              :transition="{ delay: 0.08, duration: 0.25, ease: 'easeOut' }"
            />
          </svg>
        </motion.div>
      </AnimatePresence>
    </div>

    <AnimatePresence mode="popLayout">
      <motion.div
        :key="peek.title"
        class="flex min-w-0 items-baseline gap-2"
        :initial="{ opacity: 0, y: 4 }"
        :animate="{ opacity: 1, y: 0 }"
        :exit="{ opacity: 0, y: -4 }"
        :transition="{ duration: 0.2 }"
      >
        <span class="text-[13px] font-semibold text-muted-900">{{ peek.title }}</span>
        <span class="min-w-0 truncate text-[12.5px] text-muted-400">{{ peek.subtitle }}</span>
      </motion.div>
    </AnimatePresence>
  </div>
</template>
