<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Emits {
  (e: 'insert', prefix: string, suffix?: string): void;
  (e: 'toggle-preview'): void;
}

interface Props {
  showPreview: boolean;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex items-center gap-1 p-2 border-b border-border bg-muted-50/50 rounded-t-lg">
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Bold (Ctrl+B)"
      @click="emit('insert', '**', '**')"
    >
      <Icon icon="material-symbols:format-bold" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Italic (Ctrl+I)"
      @click="emit('insert', '*', '*')"
    >
      <Icon icon="material-symbols:format-italic" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Heading"
      @click="emit('insert', '## ')"
    >
      <Icon icon="material-symbols:format-h2" class="text-lg" />
    </button>
    
    <div class="w-px h-6 bg-muted-300 mx-1" />
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Link"
      @click="emit('insert', '[', '](url)')"
    >
      <Icon icon="material-symbols:link" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Bullet List"
      @click="emit('insert', '- ')"
    >
      <Icon icon="material-symbols:format-list-bulleted" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Code"
      @click="emit('insert', '`', '`')"
    >
      <Icon icon="material-symbols:code" class="text-lg" />
    </button>
    
    <button
      type="button"
      class="p-2 rounded hover:bg-muted-200 transition-colors"
      title="Quote"
      @click="emit('insert', '> ')"
    >
      <Icon icon="material-symbols:format-quote" class="text-lg" />
    </button>
    
    <div class="flex-1" />
    
    <button
      type="button"
      class="px-3 py-1.5 rounded hover:bg-muted-200 transition-colors flex items-center gap-2 text-sm font-medium"
      :class="{ 'bg-orange-500/16 text-orange-600': showPreview }"
      @click="emit('toggle-preview')"
    >
      <Icon :icon="showPreview ? 'material-symbols:edit' : 'material-symbols:visibility'" class="text-lg" />
      <span>{{ showPreview ? 'Edit' : 'Preview' }}</span>
    </button>
  </div>
</template>

