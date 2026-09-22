<script setup lang="ts">
import { computed } from 'vue';
import { panelVariants } from './variants';

/**
 * A bordered panel above the page. The classes are `panelVariants`.
 *
 * `as` because some of these are a `section` and some a list item, and a panel
 * that forces a `div` is a panel somebody copies the classes out of instead.
 */
const props = withDefaults(
  defineProps<{
    as?: string;
    padding?: 'md' | 'none';
  }>(),
  { as: 'div', padding: 'md' },
);

const classes = computed(() => panelVariants({ padding: props.padding }));
</script>

<template>
  <component :is="as" :class="classes">
    <slot />
  </component>
</template>
