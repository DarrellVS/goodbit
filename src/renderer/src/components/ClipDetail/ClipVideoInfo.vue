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
  <div class="bg-card rounded-2xl p-6 border border-border">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/16 to-violet-500/16 flex items-center justify-center">
        <Icon icon="material-symbols:videocam-rounded" class="text-xl text-purple-600" />
      </div>
      <h2 class="text-lg font-bold text-foreground">Video Information</h2>
    </div>
    
    <div class="space-y-4">
      <div v-if="metadata?.durationSec">
        <div class="text-sm text-muted-500 mb-1">Duration</div>
        <div class="text-sm font-medium">{{ formatTimeSimple(metadata.durationSec) }}</div>
      </div>
      
      <div v-if="metadata?.width && metadata?.height">
        <div class="text-sm text-muted-500 mb-1">Resolution</div>
        <div class="text-sm font-medium">{{ metadata.width }}x{{ metadata.height }}</div>
      </div>
      
      <div v-if="metadata?.fps">
        <div class="text-sm text-muted-500 mb-1">Frame Rate</div>
        <div class="text-sm font-medium">{{ metadata.fps }} fps</div>
      </div>
    </div>
  </div>
</template>

