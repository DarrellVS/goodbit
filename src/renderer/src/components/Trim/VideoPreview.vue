<template>
  <section class="relative group" aria-label="Video preview">
    <div class="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl opacity-20 group-hover:opacity-30 blur transition" />

    <div class="relative bg-card/5 backdrop-blur-sm rounded-2xl border border-border overflow-hidden shadow-xl">
      <!--
        No native controls: their scrubber spans the whole file and would let
        you drag outside the trim, contradicting the timeline below. The
        timeline is the transport; the picture is just the picture.
      -->
      <video
        ref="videoElement"
        :src="videoSource"
        preload="metadata"
        class="w-full object-contain bg-black m-0 p-0 cursor-pointer"
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
