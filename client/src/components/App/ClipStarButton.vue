<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { starClip, unstarClip } from '../../services/clips';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

async function handleToggleStar(): Promise<void> {
  try {
    const updated = props.clip.starred 
      ? await unstarClip(props.clip.id) 
      : await starClip(props.clip.id);
    emit('updated', updated);
  } catch (error) {
    console.error('Failed to toggle star:', error);
  }
}
</script>

<template>
  <button 
    class="absolute top-3 left-3 z-10 rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 star-button"
    :class="{ 'opacity-100': clip.starred, 'opacity-0 group-hover:opacity-100 opacity-transition': !clip.starred }"
    :title="clip.starred ? 'Unstar' : 'Star'"
    @click.stop="handleToggleStar"
  >
    <Icon 
      icon="material-symbols:star" 
      class="text-lg transform-transition"
      :class="clip.starred ? 'text-orange-400 scale-110' : 'text-white'" 
    />
  </button>
</template>

