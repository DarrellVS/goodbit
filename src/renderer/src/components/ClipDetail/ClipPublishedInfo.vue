<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const toastStore = useToastStore();

async function copyPublicUrl() {
  if (!props.clip.publishedUrl) return;
  await navigator.clipboard.writeText(props.clip.publishedUrl).catch(() => {});
  toastStore.success('URL copied to clipboard');
}
</script>

<template>
  <div v-if="clip.published && clip.publishedUrl" class="bg-gradient-to-br from-emerald-500/8 via-green-500/8 to-teal-50 rounded-2xl p-6 border border-border">
    <div class="flex items-center gap-2 mb-4">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
        <Icon icon="material-symbols:cloud-done-rounded" class="text-xl text-card" />
      </div>
      <h2 class="text-lg font-bold text-emerald-900">Published</h2>
    </div>
    
    <div class="space-y-3">
      <p class="text-sm text-emerald-800">
        This clip has been published and is publicly accessible.
      </p>
      
      <button
        class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-card font-medium transition-all"
        @click="copyPublicUrl"
      >
        <Icon icon="material-symbols:link-rounded" class="text-xl" />
        <span>Copy Public URL</span>
      </button>
    </div>
  </div>
</template>

