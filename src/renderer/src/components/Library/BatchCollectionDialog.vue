<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useCollectionsStore } from '@renderer/stores/collections';

interface Props {
  open: boolean;
  selectedCount: number;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'add-to-collection', collectionId: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const collectionsStore = useCollectionsStore();
const newCollectionName = ref('');
const showNewCollectionInput = ref(false);

function handleSelectCollection(collectionId: number): void {
  emit('add-to-collection', collectionId);
  emit('update:open', false);
}

async function handleCreateAndAdd(): Promise<void> {
  const name = newCollectionName.value.trim();
  if (!name) return;

  try {
    const collection = await collectionsStore.createCollection(name);
    newCollectionName.value = '';
    showNewCollectionInput.value = false;
    emit('add-to-collection', collection.id);
    emit('update:open', false);
  } catch (error) {
    console.error('Failed to create collection:', error);
  }
}

function handleCancel(): void {
  newCollectionName.value = '';
  showNewCollectionInput.value = false;
  emit('update:open', false);
}

onMounted(async () => {
  await collectionsStore.fetchCollections();
});
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-md shadow-pop border border-border w-full max-w-md max-h-[80vh] flex flex-col outline-hidden modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">
            Add to Collection
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-600">
            Add {{ selectedCount }} clip{{ selectedCount === 1 ? '' : 's' }} to a collection
          </DialogDescription>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <!-- Create New Collection -->
          <div v-if="showNewCollectionInput" class="space-y-2">
            <input
              v-model="newCollectionName"
              type="text"
              placeholder="Enter collection name..."
              class="w-full px-4 py-2 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent"
              @keydown.enter="handleCreateAndAdd"
              @keydown.esc="showNewCollectionInput = false"
              autofocus
            />
            <div class="flex items-center gap-2">
              <button
                class="flex-1 px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="!newCollectionName.trim()"
                @click="handleCreateAndAdd"
              >
                Create & Add
              </button>
              <button
                class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-muted-50 transition-colors"
                @click="showNewCollectionInput = false"
              >
                Cancel
              </button>
            </div>
          </div>

          <!-- New Collection Button -->
          <button
            v-else
            class="w-full px-4 py-3 rounded-lg border-2 border-dashed border-border text-muted-600 hover:border-accent hover:text-accent-ink transition-colors flex items-center justify-center gap-2 font-medium"
            @click="showNewCollectionInput = true"
          >
            <Icon icon="material-symbols:add" class="text-xl" />
            <span>Create New Collection</span>
          </button>

          <!-- Existing Collections -->
          <div v-if="collectionsStore.items.length > 0" class="space-y-2">
            <div class="text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Existing Collections
            </div>
            <div class="space-y-2">
              <button
                v-for="collection in collectionsStore.items"
                :key="collection.id"
                class="w-full px-4 py-3 rounded-lg bg-muted-50 hover:bg-muted-100 transition-colors flex items-center justify-between group"
                @click="handleSelectCollection(collection.id)"
              >
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-accent flex items-center justify-center">
                    <Icon icon="material-symbols:folder" class="text-accent-fg text-xl" />
                  </div>
                  <div class="text-left">
                    <div class="font-medium text-foreground">{{ collection.name }}</div>
                    <div class="text-xs text-muted-500">
                      {{ collection.clipCount }} clip{{ collection.clipCount === 1 ? '' : 's' }}
                    </div>
                  </div>
                </div>
                <Icon 
                  icon="material-symbols:chevron-right" 
                  class="text-xl text-muted-400 group-hover:text-muted-600 transition-colors" 
                />
              </button>
            </div>
          </div>

          <div v-else-if="!showNewCollectionInput" class="text-sm text-muted-500 text-center py-8">
            No collections yet. Create one to get started.
          </div>
        </div>

        <div class="p-6 border-t border-border flex items-center justify-end">
          <DialogClose as-child>
            <button
              class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-muted-50 transition-colors"
              @click="handleCancel"
            >
              Cancel
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

