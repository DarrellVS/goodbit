<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { formatTimeSimple } from '../../utils/timeFormat';
import type { ClipMeta } from '../../services/clips';

interface Props {
  metadata: ClipMeta | null;
}

const props = defineProps<Props>();
</script>

<template>
  <div class="bg-white rounded-2xl p-6 border border-gray-300">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-violet-100 flex items-center justify-center">
        <Icon icon="material-symbols:videocam-rounded" class="text-xl text-purple-600" />
      </div>
      <h2 class="text-lg font-bold text-gray-900">Video Information</h2>
    </div>
    
    <div class="space-y-4">
      <div v-if="metadata?.durationSec">
        <div class="text-sm text-gray-500 mb-1">Duration</div>
        <div class="text-sm font-medium">{{ formatTimeSimple(metadata.durationSec) }}</div>
      </div>
      
      <div v-if="metadata?.width && metadata?.height">
        <div class="text-sm text-gray-500 mb-1">Resolution</div>
        <div class="text-sm font-medium">{{ metadata.width }}x{{ metadata.height }}</div>
      </div>
      
      <div v-if="metadata?.fps">
        <div class="text-sm text-gray-500 mb-1">Frame Rate</div>
        <div class="text-sm font-medium">{{ metadata.fps }} fps</div>
      </div>
    </div>
  </div>
</template>

