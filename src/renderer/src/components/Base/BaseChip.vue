<script setup lang="ts">
import { computed } from 'vue';
import { chipVariants } from './variants';

/** A small label over a video frame. The classes are `chipVariants`. */
const props = defineProps<{ numeric?: boolean }>();

const classes = computed(() => chipVariants({ numeric: props.numeric }));
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
