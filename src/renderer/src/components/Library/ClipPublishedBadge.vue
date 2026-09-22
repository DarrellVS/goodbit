<script setup lang="ts">
import BaseChip from '@renderer/components/Base/BaseChip.vue';
interface Props {
  published?: boolean;
}

defineProps<Props>();
</script>

<template>
  <!--
    Top right, and it stays there.

    It used to slide from `right-4` to `right-14` on hover, to clear a menu
    button that was in that corner. The tools are all at the bottom right now,
    so there is nothing to dodge, and a badge that moves when you point at the
    card is the layout-shift rule broken by animation.
  -->
  <div v-if="published" class="absolute top-2 right-2 z-10">
    <BaseChip>
      Published
    </BaseChip>
  </div>
</template>

