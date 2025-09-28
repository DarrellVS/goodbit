<script lang="ts" setup>
import { computed } from 'vue';
import BasePill from '../Base/BasePill.vue';
import { useQueuedHover } from '../../composables/useQueuedHover';

type GameRow = { game: string; count: number };

const props = defineProps<{ items: GameRow[]; active: string }>();
const emit = defineEmits<{ (e: 'select', value: string): void }>();

const { open, onEnter, onLeave, onTransitionEnd } = useQueuedHover();

const activeLabel = computed(() => props.active || 'All');

function select(value: string) {
  emit('select', value);
}
</script>

<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[720px] max-w-[92vw] px-4 pointer-events-none">
    <div class="w-full pointer-events-auto" @mouseenter="onEnter" @mouseleave="onLeave">
      <div
        class="bg-white/90 dark:bg-black/70 text-foreground border border-border/80 ring-1 ring-border/60 backdrop-blur-lg shadow-card overflow-hidden transition-all duration-300 ease-out rounded-2xl mx-auto"
        :class="open ? 'w-full' : 'w-[320px]'"
      >
        <div class="flex items-center justify-between px-4 py-2 select-none cursor-pointer mx-auto transition-[width] duration-300"
          :class="open ? 'w-full' : 'w-[320px]'"
        >
          <div class="flex items-center gap-2">
            <span class="text-sm text-white">Filter</span>
            <span class="font-bold truncate max-w-[16ch] sm:max-w-[22ch] text-white">{{ activeLabel }}</span>
          </div>
        </div>

        <div
          class="px-4 overflow-hidden transition-[max-height,opacity,padding] duration-300 ease-in-out"
          :class="open ? 'max-h-[60vh] opacity-100 py-3' : 'max-h-0 opacity-0 py-0'"
          @transitionend="onTransitionEnd"
        >
          <div class="flex flex-wrap gap-2">
            <BasePill :active="active === ''" @click="select('')">All</BasePill>
            <BasePill
              v-for="g in items"
              :key="g.game"
              :active="active === g.game"
              @click="select(g.game)"
            >
              <span class="truncate max-w-[16ch] sm:max-w-[22ch]">{{ g.game || 'Unknown' }}</span>
              <span class="text-muted-500 ml-2">{{ g.count }}</span>
            </BasePill>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>


