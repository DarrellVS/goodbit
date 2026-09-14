<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../../utils/mediaUrl';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const videoElement = ref<HTMLVideoElement | null>(null);

/*
 * Keyed on the file's own date, like every other media URL.
 *
 * This asked for the clip with no version at all, so after a trim the browser
 * went on serving the video it had already decoded and the page played nothing.
 */
const videoUrl = computed(() => videoUrlFor(props.clip.id, props.clip.fileModifiedAt));

const posterUrl = computed(() => thumbUrlFor(props.clip.id, props.clip.fileModifiedAt));

defineExpose({
  videoElement,
});
</script>

<template>
  <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-black border border-border">
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

