<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { starClip, unstarClip } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

interface Props {
  clip: Clip;
  /**
   * `overlay` floats over a clip card and appears on hover; `row` is a normal
   * labelled button in a list of actions. The overlay was the only shape for a
   * while, which is why it turned up invisible and absolutely positioned in the
   * clip detail sidebar.
   */
  variant?: 'overlay' | 'row';
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = withDefaults(defineProps<Props>(), { variant: 'overlay' });
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
    v-if="variant === 'row'"
    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted-50 transition-colors text-left"
    :title="clip.starred ? 'Remove the star' : 'Star this clip'"
    @click.stop="handleToggleStar"
  >
    <Icon
      icon="material-symbols:star"
      class="text-xl shrink-0"
      :class="clip.starred ? 'text-accent' : 'text-muted-400'"
    />
    <span class="text-sm font-medium text-foreground">
      {{ clip.starred ? 'Starred' : 'Star this clip' }}
    </span>
  </button>

  <button
    v-else
    class="absolute top-3 left-3 z-10 rounded-lg inline-flex items-center justify-center bg-video-bed/60 backdrop-blur-sm border border-on-video/20 px-2 py-2 outline-hidden size-8 hover:bg-video-bed/80 star-button"
    :class="{ 'opacity-100': clip.starred, 'opacity-0 group-hover:opacity-100 opacity-transition': !clip.starred }"
    :title="clip.starred ? 'Unstar' : 'Star'"
    @click.stop="handleToggleStar"
  >
    <Icon
      icon="material-symbols:star"
      class="size-4 shrink-0 block"
      :class="clip.starred ? 'text-accent' : 'text-on-video'"
    />
  </button>
</template>
