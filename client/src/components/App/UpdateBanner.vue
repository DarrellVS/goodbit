<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { applyUpdate, dismissUpdate, updateAvailable } from '../../utils/serviceWorker';
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-2"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-2"
  >
    <div
      v-if="updateAvailable"
      class="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-2 rounded-full bg-gray-900 text-white shadow-lg text-sm"
    >
      <Icon icon="material-symbols:rocket-launch" class="text-base text-orange-400" />
      <span>A new version is ready</span>

      <button
        class="font-semibold text-orange-300 hover:text-orange-200 transition-colors"
        @click="applyUpdate"
      >
        Reload
      </button>

      <button
        class="text-gray-400 hover:text-white transition-colors"
        title="Later"
        @click="dismissUpdate"
      >
        <Icon icon="material-symbols:close" class="text-base" />
      </button>
    </div>
  </Transition>
</template>
