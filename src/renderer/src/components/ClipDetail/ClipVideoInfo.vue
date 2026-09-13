<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTimeSimple } from '../../utils/timeFormat';
import type { ClipMeta } from '../../services/clips';

interface Props {
  metadata: ClipMeta | null;
}

const props = defineProps<Props>();

/**
 * ffprobe reports the frame rate as a fraction — `30/1`, `60000/1001` — which
 * is exact and unreadable. Divided out and rounded to one place, 29.97 stays
 * 29.97 and 30 stays 30.
 */
const frameRate = computed(() => {
  const raw = props.metadata?.fps;
  if (!raw) return null;

  const [top, bottom] = raw.split('/').map(Number);
  const value = bottom ? top / bottom : top;
  if (!Number.isFinite(value)) return raw;

  return Math.round(value * 100) / 100;
});
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
        <div class="text-sm font-medium">{{ frameRate }} fps</div>
      </div>
    </div>
  </div>
</template>

