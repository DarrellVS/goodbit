<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { streamUrl, thumbnailUrl } from '../../utils/mediaUrl';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const videoElement = ref<HTMLVideoElement | null>(null);

const videoUrl = computed(() => streamUrl(props.clip.id));

const posterUrl = computed(() => thumbnailUrl(props.clip.id));

defineExpose({
  videoElement,
});
</script>

<template>
  <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-black border border-gray-300 dark:border-slate-700">
    <video 
      ref="videoElement"
      :src="videoUrl"
      :poster="posterUrl"
      controls
      preload="metadata"
      class="w-full"
      controlsList="nodownload"
      disablePictureInPicture
      autoplay
    />
  </div>
</template>

