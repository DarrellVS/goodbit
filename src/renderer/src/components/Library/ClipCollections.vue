<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useToastStore } from '@renderer/stores/toast';
import { getClipCollections } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';
import BasePopover from '@renderer/components/Base/BasePopover.vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const collectionsStore = useCollectionsStore();
const toastStore = useToastStore();

const showAddDialog = ref(false);
const newCollectionName = ref('');
const creatingCollection = ref(false);

// Track which collections this clip belongs to
const clipCollectionIds = ref<Set<number>>(new Set());

const clipCollections = computed(() => {
  return collectionsStore.collections.filter(collection =>
    clipCollectionIds.value.has(collection.id)
  );
});

const availableCollections = computed(() => {
  return collectionsStore.collections.filter(collection =>
    !clipCollectionIds.value.has(collection.id)
  );
});

async function loadClipCollections() {
  try {
    const ids = await getClipCollections(props.clip.id);
    clipCollectionIds.value = new Set(ids);
  } catch (error) {
    console.error('Failed to load clip collections:', error);
  }
}

// Watch for changes in the collections store to keep counts updated
watch(() => collectionsStore.collections, () => {
  // No need to do anything, the computed properties will auto-update
}, { deep: true });

onMounted(() => {
  void loadClipCollections();
});

async function addToCollection(collectionId: number) {
  try {
    await collectionsStore.addClipToCollection(collectionId, props.clip.id);
    clipCollectionIds.value.add(collectionId);
    toastStore.success('Added to collection');
  } catch (error) {
    console.error('Failed to add to collection:', error);
    toastStore.error('Failed to add to collection');
  }
}

async function removeFromCollection(collectionId: number) {
  try {
    await collectionsStore.removeClipFromCollection(collectionId, props.clip.id);
    clipCollectionIds.value.delete(collectionId);
    toastStore.success('Removed from collection');
  } catch (error) {
    console.error('Failed to remove from collection:', error);
    toastStore.error('Failed to remove from collection');
  }
}

async function createAndAddCollection() {
  if (!newCollectionName.value.trim() || creatingCollection.value) return;
  
  creatingCollection.value = true;
  try {
    const collection = await collectionsStore.createCollection(newCollectionName.value.trim());
    await collectionsStore.addClipToCollection(collection.id, props.clip.id);
    clipCollectionIds.value.add(collection.id);
    toastStore.success(`Created and added to "${collection.name}"`);
    newCollectionName.value = '';
    showAddDialog.value = false;
  } catch (error) {
    console.error('Failed to create collection:', error);
    toastStore.error('Failed to create collection');
  } finally {
    creatingCollection.value = false;
  }
}
</script>

<template>
  <div class="clip-collections">
    <!-- Current Collections -->
    <div v-if="clipCollections.length > 0" class="flex flex-wrap gap-2 mb-3">
      <div
        v-for="collection in clipCollections"
        :key="collection.id"
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted-100 border border-border group"
      >
        <Icon icon="material-symbols:folder-special-rounded" class="text-muted-500" />
        <span class="text-sm font-medium text-foreground">{{ collection.name }}</span>
        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/16 rounded-sm p-0.5"
          @click="removeFromCollection(collection.id)"
        >
          <Icon icon="material-symbols:close-small-rounded" class="text-lg text-danger-ink" />
        </button>
      </div>
    </div>

    <!-- Add to Collection -->
    <BasePopover side="bottom" :side-offset="8">
      <template #trigger>
        <button class="flex items-center gap-2 text-sm text-muted-600 hover:text-accent-ink transition-colors">
          <Icon icon="material-symbols:add-circle-rounded" class="text-lg" />
          <span>{{ clipCollections.length > 0 ? 'Add to another collection' : 'Add to collection' }}</span>
        </button>
      </template>
      
      <div class="flex flex-col gap-2 min-w-[280px] max-h-[400px] overflow-auto scroll-p-1.5">
        <div class="sticky top-0 bg-card pb-2 border-b border-border z-10">
          <h3 class="text-sm font-bold text-foreground mb-2">Add to Collection</h3>
          
          <!-- Create New Collection -->
          <div class="flex gap-2">
            <input
              v-model="newCollectionName"
              placeholder="New collection..."
              class="flex-1 px-3 py-2 text-sm border border-border rounded-lg outline-hidden focus:ring-2 focus:ring-accent/50"
              @keyup.enter="createAndAddCollection"
            />
            <button
              class="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg transition-colors disabled:opacity-50"
              :disabled="!newCollectionName.trim() || creatingCollection"
              @click="createAndAddCollection"
            >
              <BaseSpinner v-if="creatingCollection" class="text-lg" />
              <Icon v-else icon="material-symbols:add-rounded" class="text-lg" />
            </button>
          </div>
        </div>

        <!-- Available Collections -->
        <div v-if="availableCollections.length > 0" class="space-y-1">
          <button
            v-for="collection in availableCollections"
            :key="collection.id"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted-50 transition-colors text-left group"
            @click="addToCollection(collection.id)"
          >
            <Icon icon="material-symbols:folder-special-rounded" class="text-lg text-muted-500" />
            <span class="text-sm font-medium flex-1">{{ collection.name }}</span>
            <span class="text-xs text-muted-500">{{ collection.clipCount }} clips</span>
          </button>
        </div>
        
        <div v-else class="text-center py-6 text-sm text-muted-500">
          <Icon icon="material-symbols:folder-off-rounded" class="text-3xl mb-2 text-muted-400" />
          <p>No other collections available</p>
        </div>
      </div>
    </BasePopover>
  </div>
</template>

