<script setup lang="ts">
import { updateClipName } from '../../services/clips';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

async function handleNameChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <input 
      class="w-full bg-transparent border-0 outline-none px-0 py-0 font-medium text-sm truncate hover:bg-card/5 focus:bg-card/5 rounded" 
      :value="clip.displayName ?? clip.filename" 
      :title="clip.displayName ?? clip.filename"
      @change="handleNameChange"
    />
    <div class="text-xs text-muted-400 mt-1 line-clamp-1">
      {{ clip.game }}
    </div>
  </div>
</template>

