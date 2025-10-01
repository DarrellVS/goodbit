<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useFormat } from '../../composables/useFormat';
import type { Clip } from '../../types/clip';

interface Props {
  clips: Clip[];
  getThumbUrl: (clip: Clip) => string;
}

interface Emits {
  (e: 'add-to-timeline', clip: Clip): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { formatBytes } = useFormat();

function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString();
}
</script>

<template>
  <div class="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
    <div class="flex-shrink-0 px-4 py-3 bg-orange-50/50 border-b border-gray-300">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-gray-900">
        <Icon icon="material-symbols:video-library" class="text-orange-500" />
        Clip Library
      </h3>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <button
        v-for="clip in clips"
        :key="clip.id"
        class="w-full group relative rounded-lg overflow-hidden bg-white/80 hover:bg-white transition-all border border-gray-300 hover:border-orange-500/50 cursor-pointer"
        @click="emit('add-to-timeline', clip)"
      >
        <div class="aspect-video relative">
          <img
            :src="getThumbUrl(clip)"
            :alt="clip.displayName || clip.filename"
            class="w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
          
          <div class="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-gray-700">
            {{ formatDate(clip.fileModifiedAt) }}
          </div>
          
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/40 backdrop-blur-sm">
            <div class="bg-gradient-to-r from-orange-500 to-orange-600 rounded-full p-3 shadow-lg shadow-orange-500/30">
              <Icon icon="material-symbols:add" class="text-2xl text-white" />
            </div>
          </div>
        </div>
        
        <div class="p-2.5">
          <div class="text-xs font-medium text-gray-900 line-clamp-1 mb-1">
            {{ clip.displayName || clip.filename }}
          </div>
          <div class="flex items-center justify-between text-[10px] text-gray-600">
            <span class="line-clamp-1">{{ clip.game }}</span>
            <span class="ml-2 flex-shrink-0">{{ formatBytes(clip.sizeBytes) }}</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>
