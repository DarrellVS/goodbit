<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import type { Collection } from '../../types/collection';

interface Props {
  collection: Collection;
  isEditing: boolean;
  editingName: string;
  isDragOver: boolean;
}

interface Emits {
  (e: 'update:editing-name', value: string): void;
  (e: 'save-edit'): void;
  (e: 'cancel-edit'): void;
  (e: 'start-edit'): void;
  (e: 'delete'): void;
  (e: 'dragover', event: DragEvent): void;
  (e: 'dragenter', event: DragEvent): void;
  (e: 'dragleave', event: DragEvent): void;
  (e: 'drop', event: DragEvent): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <RouterLink
    :to="`/collections/${collection.id}`"
    class="group w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors"
    :class="{ 'bg-orange-500/20 ring-2 ring-orange-500': isDragOver }"
    active-class="bg-card/10 text-orange-500"
    @dragover.prevent="emit('dragover', $event)"
    @dragenter="emit('dragenter', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
  >
    <div v-if="isEditing" class="flex-1 mr-2" @click.prevent.stop>
      <input
        :data-collection-edit="collection.id"
        :value="editingName"
        class="w-full px-2 py-1 text-sm rounded border border-border bg-card/5 outline-none focus:ring-2 focus:ring-orange-500/50"
        @input="emit('update:editing-name', ($event.target as HTMLInputElement).value)"
        @keyup.enter="emit('save-edit')"
        @keyup.esc="emit('cancel-edit')"
        @click.stop
      />
    </div>
    <div v-else class="flex items-center gap-3 min-w-0 flex-1">
      <Icon icon="material-symbols:folder" class="text-lg flex-shrink-0" />
      <span class="font-medium truncate" :title="collection.name">{{ collection.name }}</span>
    </div>
    
    <div class="flex items-center justify-end gap-1 flex-shrink-0 ml-auto min-w-[60px]">
      <span class="text-xs text-muted-400 opacity-100 group-hover:opacity-0 transition-opacity absolute right-6">
        {{ collection.clipCount }}
      </span>
      <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          v-if="!isEditing"
          class="p-1 rounded hover:bg-orange-500/20 transition-colors"
          @click.prevent="emit('start-edit')"
          title="Rename"
        >
          <Icon icon="material-symbols:edit" class="text-xs" />
        </button>
        <button
          class="p-1 rounded hover:bg-red-500/20 transition-colors"
          @click.prevent="emit('delete')"
          title="Delete"
        >
          <Icon icon="material-symbols:delete" class="text-xs" />
        </button>
      </div>
    </div>
  </RouterLink>
</template>

