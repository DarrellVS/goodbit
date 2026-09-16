<script setup lang="ts">
import { Icon } from '@iconify/vue';
import NotesDisplay from '../Base/NotesDisplay.vue';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  /** Inside the modal, where an empty state has no business being 300px tall. */
  compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), { compact: false });
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'timestamp-click', seconds: number): void;
}>();
</script>

<template>
  <div class="bg-gradient-to-br from-card to-orange-500/4 rounded-2xl p-5 border border-border">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
        <Icon icon="material-symbols:note-rounded" class="text-lg text-card" />
      </div>
      <h2 class="font-semibold text-foreground">Notes &amp; Annotations</h2>
    </div>

    <NotesDisplay
      :compact="compact"
      :notes="clip.notes || null"
      @edit="emit('edit')"
      @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
    />
  </div>
</template>

