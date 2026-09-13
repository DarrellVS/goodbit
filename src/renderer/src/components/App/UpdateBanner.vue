<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useUpdater } from '../../composables/useUpdater';

const { state, install } = useUpdater();

/** Only the two states worth interrupting for. */
const show = computed(() => state.value.status === 'downloading' || state.value.status === 'ready');
const ready = computed(() => state.value.status === 'ready');
const percent = computed(() =>
  state.value.status === 'downloading' ? state.value.percent : 100,
);
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="show"
      class="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2 rounded-full bg-gray-900 text-white shadow-lg text-sm"
    >
      <Icon icon="material-symbols:rocket-launch" class="text-base text-orange-400" />

      <template v-if="ready">
        <span>A new version is ready</span>
        <button
          class="font-semibold text-orange-300 hover:text-orange-200 transition-colors"
          @click="install"
        >
          Restart to update
        </button>
      </template>

      <template v-else>
        <span>Downloading an update… {{ percent }}%</span>
      </template>
    </div>
  </Transition>
</template>
