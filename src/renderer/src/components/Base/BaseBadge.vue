<script lang="ts" setup>
import { twMerge, type ClassNameValue } from 'tailwind-merge';
</script>

<template>
  <span :class="twMerge('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-muted-800 border border-border', $attrs.class as ClassNameValue)"><slot /></span>
</template>


