<script setup lang="ts">
import type { Clip } from '@renderer/types/clip';
import { useClipHover } from '@renderer/composables/clips/useClipHover';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import ClipCardSlot from './ClipCardSlot.vue';

interface Props {
  clips: Clip[];
  getVideoUrl: (clip: Clip) => string;
  getThumbUrl: (clip: Clip) => string;
  collectionId?: number;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: 'clip-updated', clip: Clip): void;
  (e: 'clip-deleted'): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelectionMode: false,
});

const emit = defineEmits<Emits>();
const config = useConfiguration();
const { handleClipHover } = useClipHover();
</script>

<template>
  <section
    class="grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))]"
    :class="config.public.value.compactMode ? 'gap-2' : 'gap-4'"
    aria-label="Video clips grid"
  >
    <ClipCardSlot
      v-for="(clip, index) in clips"
      :key="clip.id"
      :clip="clip"
      :clip-index="index"
      :poster-url="getThumbUrl(clip)"
      :video-url="getVideoUrl(clip)"
      :collection-id="collectionId"
      :is-selection-mode="isSelectionMode"
      @is-hovered="isHovered => handleClipHover(clip.id, isHovered)"
      @updated="emit('clip-updated', $event)"
      @deleted="emit('clip-deleted')"
    />
  </section>
</template>
