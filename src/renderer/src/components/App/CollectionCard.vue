<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { pluralize } from '../../utils/pluralize';
import type { Collection } from '../../types/collection';

/**
 * One collection, as a card above the clips rather than a row in the sidebar.
 *
 * It keeps everything the sidebar row could do, because the sidebar no longer
 * lists collections and this is the only place left that can: open it, rename
 * it, delete it, and take a clip dropped on it. The drop target is the part
 * that would be easy to miss and impossible to work around, since dragging a
 * clip onto a collection is how clips get into one.
 */
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

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <RouterLink
    :to="`/collections/${collection.id}`"
    data-collection-card
    class="group flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 transition-colors"
    :class="isDragOver
      ? 'border-orange-500 bg-orange-500/10'
      : 'border-border hover:border-muted-300 hover:bg-muted-50'"
    active-class="border-orange-500/40"
    @dragover.prevent="emit('dragover', $event)"
    @dragenter="emit('dragenter', $event)"
    @dragleave="emit('dragleave', $event)"
    @drop="emit('drop', $event)"
  >
    <!--
      `data-collection-edit` is what `useCollectionManagement` looks for to put
      the caret in the field it just opened, so the attribute is load-bearing
      rather than a hook for tests.
    -->
    <div v-if="isEditing" @click.prevent.stop>
      <input
        :data-collection-edit="collection.id"
        :value="editingName"
        class="w-full rounded border border-border bg-card px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-orange-500/50"
        @input="emit('update:editing-name', ($event.target as HTMLInputElement).value)"
        @keyup.enter="emit('save-edit')"
        @keyup.esc="emit('cancel-edit')"
        @click.stop
      />
    </div>
    <div v-else class="flex min-w-0 items-center gap-2">
      <Icon icon="material-symbols:folder" class="flex-shrink-0 text-lg text-muted-500" />
      <span class="truncate font-medium text-foreground" :title="collection.name">
        {{ collection.name }}
      </span>
    </div>

    <!--
      The count and the two buttons share the bottom line rather than sitting
      over the name: a rename button on top of the thing it renames hides the
      only way to tell which card you are on.
    -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs text-muted-400">
        {{ collection.clipCount }} {{ pluralize(collection.clipCount, 'clip') }}
      </span>
      <div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          v-if="!isEditing"
          class="rounded p-1 transition-colors hover:bg-orange-500/20"
          title="Rename"
          @click.prevent="emit('start-edit')"
        >
          <Icon icon="material-symbols:edit" class="text-sm text-muted-500" />
        </button>
        <button
          class="rounded p-1 transition-colors hover:bg-red-500/20"
          title="Delete"
          @click.prevent="emit('delete')"
        >
          <Icon icon="material-symbols:delete" class="text-sm text-muted-500" />
        </button>
      </div>
    </div>
  </RouterLink>
</template>
