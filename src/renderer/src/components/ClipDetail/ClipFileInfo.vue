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
  <div class="bg-card rounded-2xl p-6 border border-border">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/16 to-indigo-500/16 flex items-center justify-center">
        <Icon icon="material-symbols:folder-rounded" class="text-xl text-blue-600" />
      </div>
      <h2 class="text-lg font-bold text-foreground">File Information</h2>
    </div>
    
    <div class="space-y-4">
      <div>
        <div class="text-sm text-muted-500 mb-1">File Name</div>
        <div class="text-sm font-medium break-all">{{ clip.filename }}</div>
      </div>
      
      <div>
        <div class="text-sm text-muted-500 mb-1">Size</div>
        <div class="text-sm font-medium">{{ formatBytes(clip.sizeBytes) }}</div>
      </div>
      
      <div>
        <div class="text-sm text-muted-500 mb-1">Recorded</div>
        <button
          class="text-sm font-medium text-left hover:text-orange-600 transition-colors"
          @click="emit('toggle-date')"
        >
          <!--
            When it was recorded, not when the file last changed. A trim rewrites
            the file, and "Modified" then reported the moment you pressed save.
          -->
          {{
            showExactDate
              ? formatExactDate(clip.recordedAt ?? clip.fileModifiedAt)
              : formatRelativeTime(clip.recordedAt ?? clip.fileModifiedAt)
          }}
        </button>
      </div>
    </div>
  </div>
</template>

