<template>
  <BaseModal
    :is-open="isOpen"
    title="Rename Game"
    @close="handleClose"
  >
    <div class="space-y-4">
      <p class="text-sm text-muted-400">
        This will rename the game folder, update all {{ clipCount }} clip(s) in the database, and update published clips.
      </p>

      <div class="space-y-2">
        <label class="block text-sm font-medium">Current Name</label>
        <input
          type="text"
          :value="currentName"
          disabled
          class="w-full px-3 py-2 bg-white/5 border border-gray-200 rounded-lg opacity-50 cursor-not-allowed"
        />
      </div>

      <div class="space-y-2">
        <label class="block text-sm font-medium">New Name</label>
        <input
          ref="inputRef"
          v-model="newName"
          type="text"
          placeholder="Enter new game name"
          class="w-full px-3 py-2 bg-white/5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          @keydown.enter="handleRename"
        />
      </div>

      <div v-if="error" class="text-sm text-red-500">
        {{ error }}
      </div>
    </div>

    <template #actions>
      <button
        class="px-4 py-2 rounded-lg border border-gray-200 hover:bg-white/10 transition-colors"
        @click="handleClose"
      >
        Cancel
      </button>
      <button
        class="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!newName.trim() || newName.trim() === currentName || isLoading"
        @click="handleRename"
      >
        {{ isLoading ? 'Renaming...' : 'Rename' }}
      </button>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import BaseModal from '../Base/BaseModal.vue';
import { renameGame } from '../../services/games';
import { useToastStore } from '../../stores/toast';
import { useGamesStore } from '../../stores/games';
import { useClipsStore } from '../../stores/clips';

interface Props {
  isOpen: boolean;
  currentName: string;
  clipCount: number;
}

interface Emits {
  (e: 'close'): void;
  (e: 'renamed', oldName: string, newName: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const toastStore = useToastStore();
const gamesStore = useGamesStore();
const clipsStore = useClipsStore();

const newName = ref('');
const error = ref('');
const isLoading = ref(false);
const inputRef = ref<HTMLInputElement>();

watch(() => props.isOpen, async (open) => {
  if (open) {
    newName.value = '';
    error.value = '';
    await nextTick();
    inputRef.value?.focus();
  }
});

async function handleRename() {
  if (!newName.value.trim() || newName.value.trim() === props.currentName) {
    return;
  }

  error.value = '';
  isLoading.value = true;

  try {
    const result = await renameGame(props.currentName, newName.value.trim());
    
    toastStore.success(`Renamed "${props.currentName}" to "${newName.value.trim()}" (${result.clipsUpdated} clips updated)`);
    
    // Refresh games list and clips
    await Promise.all([
      gamesStore.fetchGames(),
      clipsStore.fetchClips(false),
    ]);
    
    emit('renamed', props.currentName, newName.value.trim());
    handleClose();
  } catch (err: any) {
    error.value = err.response?.data?.error || err.message || 'Failed to rename game';
    console.error('Failed to rename game:', err);
  } finally {
    isLoading.value = false;
  }
}

function handleClose() {
  emit('close');
}
</script>

