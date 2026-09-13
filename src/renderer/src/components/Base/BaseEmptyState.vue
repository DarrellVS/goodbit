<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  icon?: string;
  title: string;
  description: string;
}

withDefaults(defineProps<Props>(), {
  icon: 'material-symbols:inbox',
});
</script>

<template>
  <div class="py-24 flex flex-col items-center justify-center text-center gap-4 opacity-80">
    <div class="rounded-full w-20 h-20 flex items-center justify-center bg-card/5 border border-border">
      <Icon :icon="icon" class="text-3xl text-muted-400" />
    </div>
    <div>
      <h2 class="text-2xl font-semibold mb-2">{{ title }}</h2>
      <p class="text-muted-400">{{ description }}</p>
    </div>
  </div>
</template>

