<script setup lang="ts">
import { computed } from 'vue';
import BatchOperationsToolbar from './BatchOperationsToolbar.vue';
import type { Clip } from '@renderer/types/clip';

/**
 * A bar that floats over the clips only while there is a selection.
 *
 * It used to be permanent furniture: `fixed bottom-6`, on screen the whole time
 * you were looking at the library, holding a view toggle and a *Select*
 * button, with `ClipsPage.vue` paying a `pb-16` so the last row of clips was
 * not underneath it.
 *
 * The view toggle was the fifth copy of one stored value, and it is now in
 * Settings, on the `L` key and in the command palette, none of which occupy
 * screen. *Select* moved into the filter row, which already describes the list
 * you are looking at. What is left is what a floating bar is actually for: it
 * appears when there is a selection, it is about the clips on screen, and it
 * goes when the selection does.
 */
interface Props {
  hasSelection: boolean;
  selectedCount?: number;
  selectedClips?: Clip[];
  collectionId?: number;
}

interface Emits {
  (e: 'deselect-all'): void;
  (e: 'delete'): void;
  (e: 'add-to-collection'): void;
  (e: 'remove-from-collection'): void;
  (e: 'publish'): void;
  (e: 'unpublish'): void;
  (e: 'star'): void;
  (e: 'unstar'): void;
  (e: 'add-tags'): void;
  (e: 'open-in-editor'): void;
  (e: 'compress'): void;
}

const props = withDefaults(defineProps<Props>(), {
  selectedCount: 0,
  selectedClips: () => [],
});

const emit = defineEmits<Emits>();

const showSelectionToolbar = computed(() => props.hasSelection);
</script>

<template>
  <div data-batch-bar class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
    <Transition name="floating-bar">
      <BatchOperationsToolbar
        v-if="showSelectionToolbar"
        :selected-count="selectedCount"
        :selected-clips="selectedClips"
        :collection-id="collectionId"
        @deselect-all="emit('deselect-all')"
        @delete="emit('delete')"
        @compress="emit('compress')"
        @add-to-collection="emit('add-to-collection')"
        @remove-from-collection="emit('remove-from-collection')"
        @publish="emit('publish')"
        @unpublish="emit('unpublish')"
        @star="emit('star')"
        @unstar="emit('unstar')"
        @add-tags="emit('add-tags')"
        @open-in-editor="emit('open-in-editor')"
      />
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
