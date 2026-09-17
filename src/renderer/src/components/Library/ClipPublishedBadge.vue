<script setup lang="ts">
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
    <span class="rounded-full bg-scrim px-2 py-0.5 text-[11px] font-medium text-on-video">
      Published
    </span>
  </div>
</template>

