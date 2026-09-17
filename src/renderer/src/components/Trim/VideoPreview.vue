<template>
  <section class="relative group min-h-0 flex" aria-label="Video preview">
    <!--
      The preview gives way to the timeline rather than the other way round: a
      3440x1440 clip at full width pushed the thing this page exists for off
      the bottom of the window.
    -->
    <div class="relative flex-1 min-h-0 bg-card/5 backdrop-blur-sm rounded-2xl border border-border overflow-hidden shadow-xl">
      <!--
        No native controls: their scrubber spans the whole file and would let
        you drag outside the trim, contradicting the timeline below. The
        timeline is the transport; the picture is just the picture.
      -->
      <video
        ref="videoElement"
        :src="videoSource"
        preload="metadata"
        class="w-full h-full object-contain bg-video-bed m-0 p-0 cursor-pointer"
        @click="$emit('toggle')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  videoSource: string;
}

defineProps<Props>();

defineEmits<{ (e: 'toggle'): void }>();

const videoElement = ref<HTMLVideoElement | null>(null);

defineExpose({
  videoElement,
});
</script>
