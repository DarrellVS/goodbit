<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import type { Game } from '../../types/game';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue';

interface Props {
  open: boolean;
  game: Game | null;
  loading?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'saved', gameName: string, displayName: string | null): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});
const emit = defineEmits<Emits>();

const displayName = ref('');

watch(() => props.open, (isOpen) => {
  if (isOpen && props.game) {
    // Initialize with current display name or empty
    displayName.value = props.game.displayName || '';
  }
});

function handleSave() {
  if (!props.game) return;
  
  const trimmedName = displayName.value.trim();
  const finalName = trimmedName || null; // Convert empty string to null
  
  emit('saved', props.game.game, finalName);
}

function handleCancel() {
  emit('update:open', false);
}

const title = computed(() => props.game ? `Rename "${props.game.displayName || props.game.game}"` : 'Rename Game');
const folderName = computed(() => props.game?.game || '');
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md flex flex-col outline-none modal-content-animate dark:bg-slate-900 dark:border-slate-700"
      >
        <div class="p-6 border-b border-gray-200 dark:border-slate-700">
          <DialogTitle class="text-xl font-bold text-gray-900 mb-1 dark:text-slate-100">
            {{ title }}
          </DialogTitle>
          <DialogDescription class="text-sm text-gray-600 dark:text-slate-400">
            Change how this game is displayed without renaming the folder
          </DialogDescription>
        </div>

        <div class="p-6 space-y-4">
          <!-- Display Name Input -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 uppercase tracking-wide dark:text-slate-400">
              Display Name
            </label>
            <input
              v-model="displayName"
              type="text"
              placeholder="Enter a custom display name"
              class="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all dark:border-slate-700"
              @keydown.enter="handleSave"
            />
          </div>

          <!-- Info Box -->
          <div class="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1 dark:bg-slate-800 dark:border-slate-700">
            <div class="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300">
              <Icon icon="material-symbols:folder-outline" class="text-lg flex-shrink-0 mt-0.5" />
              <div>
                <span class="font-medium">Folder name:</span>
                <span class="ml-1 font-mono text-gray-900 dark:text-slate-100">{{ folderName }}</span>
                <span class="text-gray-500 ml-1 dark:text-slate-400">(unchanged)</span>
              </div>
            </div>
            <div class="text-xs text-gray-600 ml-7 dark:text-slate-400">
              Leave empty to use the folder name as the display name
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 flex items-center justify-end gap-3 dark:border-slate-700">
          <DialogClose as-child>
            <button
              class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              :disabled="loading"
              @click="handleCancel"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            :disabled="loading"
            @click="handleSave"
          >
            <Icon
              v-if="loading"
              icon="svg-spinners:180-ring-with-bg"
              class="text-lg"
            />
            <span>{{ loading ? 'Saving...' : 'Save' }}</span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

