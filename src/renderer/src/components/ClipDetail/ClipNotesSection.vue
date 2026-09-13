<script setup lang="ts">
import { Icon } from '@iconify/vue';
import NotesDisplay from '../Base/NotesDisplay.vue';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'timestamp-click', seconds: number): void;
}>();
</script>

<template>
  <div class="bg-gradient-to-br from-card to-orange-500/4 rounded-2xl p-6 border border-border">
    <div class="flex items-center gap-2 mb-6">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
        <Icon icon="material-symbols:note-rounded" class="text-xl text-card" />
      </div>
      <h2 class="text-lg font-bold text-foreground">Notes & Annotations</h2>
    </div>
    
    <NotesDisplay
      :notes="clip.notes || null"
      @edit="emit('edit')"
      @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
    />
  </div>
</template>

