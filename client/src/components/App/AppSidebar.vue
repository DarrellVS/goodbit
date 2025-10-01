<script lang="ts" setup>
import { computed, onMounted, ref, nextTick, watch } from 'vue';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useGamesStore } from '../../stores/games';
import { useCollectionsStore } from '../../stores/collections';
import { useToastStore } from '../../stores/toast';
import { useDragAndDrop, type DragData } from '../../composables/useDragAndDrop';

interface Props {
  activeGame?: string;
}

interface Emits {
  (e: 'logout'): void;
  (e: 'select-game', game: string): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();

const router = useRouter();
const route = useRoute();
const gamesStore = useGamesStore();
const collectionsStore = useCollectionsStore();
const toastStore = useToastStore();
const { onDragOver, onDrop } = useDragAndDrop();
const games = computed(() => gamesStore.games());
const collections = computed(() => collectionsStore.items);

const showNewCollectionInput = ref(false);
const newCollectionName = ref('');
const editingCollectionId = ref<number | null>(null);
const editingCollectionName = ref('');
const dragOverCollectionId = ref<number | null>(null);
const showAllGames = ref(false);
const showAllCollections = ref(false);
const newCollectionInputRef = ref<HTMLInputElement | null>(null);

const visibleGames = computed(() => {
  return showAllGames.value ? games.value : games.value.slice(0, 5);
});

const visibleCollections = computed(() => {
  const all = collections.value;
  return showAllCollections.value ? all : all.slice(0, 5);
});

const hasMoreGames = computed(() => games.value.length > 5);
const hasMoreCollections = computed(() => collections.value.length > 5);

async function startCreateCollection() {
  showNewCollectionInput.value = true;
  newCollectionName.value = '';
  await nextTick();
  newCollectionInputRef.value?.focus();
}

async function createCollection() {
  if (!newCollectionName.value.trim()) return;
  try {
    await collectionsStore.createCollection(newCollectionName.value.trim());
    showNewCollectionInput.value = false;
    newCollectionName.value = '';
    toastStore.success('Collection created');
  } catch (error) {
    console.error('Failed to create collection:', error);
    toastStore.error('Failed to create collection');
  }
}

function startEditCollection(id: number, name: string) {
  editingCollectionId.value = id;
  editingCollectionName.value = name;
}

async function saveCollectionEdit() {
  if (!editingCollectionName.value.trim() || editingCollectionId.value === null) return;
  try {
    await collectionsStore.updateCollection(editingCollectionId.value, editingCollectionName.value.trim());
    editingCollectionId.value = null;
    editingCollectionName.value = '';
    toastStore.success('Collection renamed');
  } catch (error) {
    console.error('Failed to update collection:', error);
    toastStore.error('Failed to update collection');
  }
}

function cancelEdit() {
  editingCollectionId.value = null;
  editingCollectionName.value = '';
}

async function deleteCollection(id: number, name: string) {
  toastStore.confirm(
    `This will permanently delete "${name}".`,
    async () => {
      try {
        const isViewingCollection = route.name === 'collection' && Number(route.params.id) === id;
        
        await collectionsStore.deleteCollection(id);
        toastStore.success('Collection deleted');
        
        if (isViewingCollection) {
          await router.push('/');
        }
      } catch (error) {
        console.error('Failed to delete collection:', error);
        toastStore.error('Failed to delete collection');
      }
    },
    'Delete collection?'
  );
}

async function handleDropOnCollection(collectionId: number, data: DragData) {
  if (data.type === 'clip') {
    try {
      await collectionsStore.addClipToCollection(collectionId, data.clipId);
      toastStore.success('Clip added to collection');
    } catch (error) {
      console.error('Failed to add clip to collection:', error);
      toastStore.error('Failed to add clip to collection');
    }
  }
  dragOverCollectionId.value = null;
}

function handleDragEnter(collectionId: number, event: DragEvent) {
  event.preventDefault();
  dragOverCollectionId.value = collectionId;
}

function handleDragLeave(event: DragEvent) {
  const target = event.currentTarget as HTMLElement;
  const relatedTarget = event.relatedTarget as Node | null;
  
  if (!relatedTarget || !target.contains(relatedTarget)) {
    dragOverCollectionId.value = null;
  }
}

watch(editingCollectionId, async (newId) => {
  if (newId !== null) {
    await nextTick();
    const input = document.querySelector(`input[data-collection-edit="${newId}"]`) as HTMLInputElement;
    input?.focus();
    input?.select();
  }
});

onMounted(() => {
  void collectionsStore.fetchCollections();
});
</script>

<template>
  <aside class="w-64 bg-white/5 backdrop-blur-sm border-r border-gray-200 flex flex-col h-full">
    <div class="p-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Icon icon="material-symbols:video-library" class="text-white text-lg" />
        </div>
        <h1 class="text-xl font-bold">Filmpje</h1>
      </div>
    </div>

    <nav class="flex-1 px-3 space-y-1">
      <div class="text-xs font-semibold text-muted-400 px-3 mb-2">MAIN MENU</div>
      
      <RouterLink
        to="/"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:video-library" class="text-lg" />
        <span class="font-medium">Library</span>
      </RouterLink>

      <RouterLink
        to="/today"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:schedule" class="text-lg" />
        <span class="font-medium">Today</span>
      </RouterLink>

      <div v-if="games.length" class="pt-4">
        <div class="text-xs font-semibold text-muted-400 px-3 mb-2">GAMES</div>
        
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': !activeGame }"
          @click="emit('select-game', '')"
        >
          <div class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-orange-500" />
            <span class="font-medium">All</span>
          </div>
        </button>

        <button
          v-for="game in visibleGames"
          :key="game.game"
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
          :class="{ 'bg-white/10 text-orange-500': activeGame === game.game }"
          @click="emit('select-game', game.game)"
        >
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
            <span 
              class="font-medium truncate" 
              :title="game.game || 'Unknown'"
            >
              {{ game.game || 'Unknown' }}
            </span>
          </div>
          <span class="text-xs text-muted-400 flex-shrink-0 ml-2">{{ game.count }}</span>
        </button>

        <button
          v-if="hasMoreGames"
          class="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-xs text-muted-400 hover:text-foreground"
          @click="showAllGames = !showAllGames"
        >
          {{ showAllGames ? 'Show less' : `Show ${games.length - 5} more` }}
        </button>
      </div>

      <div class="pt-4">
        <div class="text-xs font-semibold text-muted-400 px-3 mb-2 flex items-center justify-between">
          <span>COLLECTIONS</span>
          <button
            class="p-1 rounded hover:bg-white/10 transition-colors"
            @click="startCreateCollection"
            title="New collection"
          >
            <Icon icon="material-symbols:add" class="text-sm" />
          </button>
        </div>

        <div v-if="showNewCollectionInput" class="px-3 mb-2">
          <input
            ref="newCollectionInputRef"
            v-model="newCollectionName"
            class="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/50"
            placeholder="Collection name"
            @keyup.enter="createCollection"
            @keyup.esc="showNewCollectionInput = false"
          />
        </div>

        <div v-if="!collections.length && !showNewCollectionInput" class="px-3 py-6 text-center">
          <Icon icon="material-symbols:folder-off" class="text-3xl text-muted-300 mb-2 mx-auto" />
          <p class="text-xs text-muted-400">No collections yet</p>
          <button
            class="mt-2 text-xs text-orange-500 hover:text-orange-600 transition-colors"
            @click="startCreateCollection"
          >
            Create your first
          </button>
        </div>

        <RouterLink
          v-for="collection in visibleCollections"
          :key="collection.id"
          :to="`/collections/${collection.id}`"
          class="group w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors"
          :class="{ 'bg-orange-500/20 ring-2 ring-orange-500': dragOverCollectionId === collection.id }"
          active-class="bg-white/10 text-orange-500"
          @dragover.prevent="onDragOver"
          @dragenter="(e: DragEvent) => handleDragEnter(collection.id, e)"
          @dragleave="handleDragLeave"
          @drop="(e: DragEvent) => onDrop(e, (data) => handleDropOnCollection(collection.id, data))"
        >
          <div v-if="editingCollectionId === collection.id" class="flex-1 mr-2" @click.prevent.stop>
            <input
              :data-collection-edit="collection.id"
              v-model="editingCollectionName"
              class="w-full px-2 py-1 text-sm rounded border border-gray-300 bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/50"
              @keyup.enter="saveCollectionEdit"
              @keyup.esc="cancelEdit"
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
                v-if="editingCollectionId !== collection.id"
                class="p-1 rounded hover:bg-orange-500/20 transition-colors"
                @click.prevent="startEditCollection(collection.id, collection.name)"
                title="Rename"
              >
                <Icon icon="material-symbols:edit" class="text-xs" />
              </button>
              <button
                class="p-1 rounded hover:bg-red-500/20 transition-colors"
                @click.prevent="deleteCollection(collection.id, collection.name)"
                title="Delete"
              >
                <Icon icon="material-symbols:delete" class="text-xs" />
              </button>
            </div>
          </div>
        </RouterLink>

        <button
          v-if="hasMoreCollections"
          class="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-white/10 transition-colors text-xs text-muted-400 hover:text-foreground"
          @click="showAllCollections = !showAllCollections"
        >
          {{ showAllCollections ? 'Show less' : `Show ${collections.length - 5} more` }}
        </button>
      </div>
    </nav>

    <div class="p-3 space-y-1 border-t border-gray-200">
      <RouterLink
        to="/tag-patterns"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="font-medium">Smart Tags</span>
      </RouterLink>
      
      <RouterLink
        to="/stats"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:bar-chart" class="text-lg" />
        <span class="font-medium">Stats</span>
      </RouterLink>
      
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
        @click="emit('logout')"
      >
        <Icon icon="material-symbols:logout" class="text-lg" />
        <span class="font-medium">Logout</span>
      </button>
    </div>
  </aside>
</template>
