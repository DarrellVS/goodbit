<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import BaseViewModeToggle from '../Base/BaseViewModeToggle.vue';
import BatchOperationsToolbar from './BatchOperationsToolbar.vue';
import type { ViewMode } from './ClipFilters.vue';
import type { Clip } from '../../types/clip';

interface Props {
  viewMode: ViewMode;
  isSelectionMode: boolean;
  hasSelection: boolean;
  clipsCount: number;
  selectedCount?: number;
  selectedClips?: Clip[];
  collectionId?: number;
}

interface Emits {
  (e: 'update:view-mode', mode: ViewMode): void;
  (e: 'enter-selection'): void;
  (e: 'exit-selection'): void;
  (e: 'deselect-all'): void;
  (e: 'delete'): void;
  (e: 'add-to-collection'): void;
  (e: 'remove-from-collection'): void;
  (e: 'publish'): void;
  (e: 'unpublish'): void;
  (e: 'star'): void;
  (e: 'unstar'): void;
  (e: 'add-tags'): void;
}

const props = withDefaults(defineProps<Props>(), {
  selectedCount: 0,
  selectedClips: () => [],
});

const emit = defineEmits<Emits>();

const showNormalControls = computed(() => !props.isSelectionMode && props.clipsCount > 0);
const showSelectionToolbar = computed(() => props.hasSelection);
const showSelectionModeEmpty = computed(() => props.isSelectionMode && !props.hasSelection);
</script>

<template>
  <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
    <Transition
      name="floating-bar"
      mode="out-in"
    >
      <!-- Normal Controls (View Mode + Select Button) -->
      <div
        v-if="showNormalControls"
        key="normal"
        class="bg-white rounded-xl shadow-2xl border border-gray-300 px-4 py-3 flex items-center gap-4"
      >
        <BaseViewModeToggle 
          :model-value="viewMode" 
          @update:model-value="emit('update:view-mode', $event)" 
        />
        
        <div class="w-px h-6 bg-gray-300"></div>
        
        <button
          class="px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center gap-2 text-sm font-medium"
          @click="emit('enter-selection')"
          title="Select clips (Ctrl+A to select all)"
        >
          <Icon icon="material-symbols:check-box-outline-blank" class="text-base" />
          <span>Select</span>
        </button>
      </div>

      <!-- Selection Toolbar -->
      <BatchOperationsToolbar
        v-else-if="showSelectionToolbar"
        key="selection"
        :selected-count="selectedCount"
        :selected-clips="selectedClips"
        :collection-id="collectionId"
        @deselect-all="emit('deselect-all')"
        @delete="emit('delete')"
        @add-to-collection="emit('add-to-collection')"
        @remove-from-collection="emit('remove-from-collection')"
        @publish="emit('publish')"
        @unpublish="emit('unpublish')"
        @star="emit('star')"
        @unstar="emit('unstar')"
        @add-tags="emit('add-tags')"
      />

      <!-- Selection Mode Empty State (shows cancel button) -->
      <div
        v-else-if="showSelectionModeEmpty"
        key="selection-empty"
        class="bg-white rounded-xl shadow-2xl border border-gray-300 px-4 py-3 flex items-center gap-4"
      >
        <span class="text-sm text-gray-500">Select clips to perform actions</span>
        <div class="flex-1"></div>
        <button
          class="px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-2 text-sm font-medium text-gray-700"
          @click="emit('exit-selection')"
          title="Exit selection mode (Esc)"
        >
          <Icon icon="material-symbols:close" class="text-base" />
          <span>Cancel</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.floating-bar-enter-active,
.floating-bar-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.floating-bar-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.floating-bar-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

.floating-bar-enter-to,
.floating-bar-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
}
</style>

