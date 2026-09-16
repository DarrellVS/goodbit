<script setup lang="ts">
import { EditableArea, EditableInput, EditablePreview, EditableRoot } from 'reka-ui';
import { useToastStore } from '../../stores/toast';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  videoUrl: string;
  posterUrl: string;
  isActive: boolean;
}

interface Emits {
  (e: 'rename', name: string): void;
  (e: 'delete'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
const toastStore = useToastStore();

function handleRename(name: string): void {
  emit('rename', name);
}

function handleDelete(): void {
  toastStore.confirm(
    'It goes to the Recycle Bin, so you can still get it back from there.',
    () => emit('delete'),
    'Move this clip to the Recycle Bin?',
  );
}
</script>

<template>
  <div 
    class="embla__slide" 
    :class="{ 'is-active': isActive }"
  >
    <div class="relative rounded-2xl overflow-hidden shadow-xl">
      <video 
        :src="videoUrl" 
        :poster="posterUrl"
        class="w-full aspect-21/9 object-cover" 
        controls
      />
    </div>
    
    <div class="mt-3 px-1 flex items-center justify-between">
      <EditableRoot 
        :default-value="clip.displayName || clip.filename" 
        @update:model-value="handleRename"
      >
        <EditableArea class="text-lg font-semibold text-foreground">
          <EditablePreview />
          <EditableInput class="bg-transparent outline-hidden border-b border-border" />
        </EditableArea>
      </EditableRoot>
      
      <button 
        class="text-red-500 hover:text-red-400 transition-colors"
        @click="handleDelete"
      >
        Delete
      </button>
    </div>
  </div>
</template>

