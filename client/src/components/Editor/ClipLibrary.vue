<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { Clip } from '../../types/clip';
import { useFormat } from '../../composables/useFormat';

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
</script>

<template>
  <div class="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950 rounded-xl border border-white/10 overflow-hidden">
    <div class="flex-shrink-0 px-4 py-3 bg-black/30 border-b border-white/10">
      <h3 class="text-sm font-semibold flex items-center gap-2">
        <Icon icon="material-symbols:video-library" class="text-orange-500" />
        Clip Library
      </h3>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-2">
      <button
        v-for="clip in clips"
        :key="clip.id"
        class="w-full group relative rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 transition-all border border-white/10 hover:border-orange-500/50 cursor-pointer"
        @click="emit('add-to-timeline', clip)"
      >
        <div class="aspect-video relative">
          <img
            :src="getThumbUrl(clip)"
            :alt="clip.displayName || clip.filename"
            class="w-full h-full object-cover"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
          
          <div class="absolute top-2 right-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-mono text-white">
            {{ new Date(clip.fileModifiedAt).toLocaleDateString() }}
          </div>
          
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div class="bg-orange-500 rounded-full p-3 shadow-lg">
              <Icon icon="material-symbols:add" class="text-2xl text-white" />
            </div>
          </div>
        </div>
        
        <div class="p-2">
          <div class="text-xs font-medium text-white/90 line-clamp-1 mb-1">
            {{ clip.displayName || clip.filename }}
          </div>
          <div class="flex items-center justify-between text-[10px] text-white/60">
            <span>{{ clip.game }}</span>
            <span>{{ formatBytes(clip.sizeBytes) }}</span>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>


