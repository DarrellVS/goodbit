<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useFormat } from '../../composables/useFormat';
import { formatRelativeTime, formatExactDate } from '../../helpers/dateFormat';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  showExactDate: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'toggle-date'): void;
}>();

const { formatBytes } = useFormat();
</script>

<template>
  <div class="bg-white rounded-2xl p-6 border border-gray-300 dark:bg-slate-900 dark:border-slate-700">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
        <Icon icon="material-symbols:folder-rounded" class="text-xl text-blue-600" />
      </div>
      <h2 class="text-lg font-bold text-gray-900 dark:text-slate-100">File Information</h2>
    </div>
    
    <div class="space-y-4">
      <div>
        <div class="text-sm text-gray-500 mb-1 dark:text-slate-400">File Name</div>
        <div class="text-sm font-medium break-all">{{ clip.filename }}</div>
      </div>
      
      <div>
        <div class="text-sm text-gray-500 mb-1 dark:text-slate-400">Size</div>
        <div class="text-sm font-medium">{{ formatBytes(clip.sizeBytes) }}</div>
      </div>
      
      <div>
        <div class="text-sm text-gray-500 mb-1 dark:text-slate-400">Modified</div>
        <button
          class="text-sm font-medium text-left hover:text-orange-600 transition-colors"
          @click="emit('toggle-date')"
        >
          {{ showExactDate ? formatExactDate(clip.fileModifiedAt) : formatRelativeTime(clip.fileModifiedAt) }}
        </button>
      </div>
    </div>
  </div>
</template>

