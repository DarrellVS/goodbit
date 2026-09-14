<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import ClipStarButton from '../App/ClipStarButton.vue';
import ClipActionsMenu from '../App/ClipActionsMenu.vue';
import type { Clip } from '../../types/clip';

/**
 * What you can do with this clip, at the top of the sidebar where the actions
 * belong.
 *
 * The published state used to be a card of its own above everything else, which
 * meant the page was headed by a status you only ever see on a minority of
 * clips, and that card was written in emerald-on-emerald, so it was
 * unreadable the moment the app went dark. It is a row in here now.
 */
interface Props {
  clip: Clip;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
  (e: 'share'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const toastStore = useToastStore();

async function copyPublicUrl(): Promise<void> {
  if (!props.clip.publishedUrl) return;
  try {
    await navigator.clipboard.writeText(props.clip.publishedUrl);
    toastStore.success('Public link copied');
  } catch {
    toastStore.error('Could not copy the link');
  }
}
</script>

<template>
  <div class="bg-card rounded-2xl p-4 border border-border space-y-2">
    <div
      v-if="clip.published && clip.publishedUrl"
      class="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30"
    >
      <Icon icon="material-symbols:cloud-done-rounded" class="text-lg text-emerald-500 flex-shrink-0" />
      <span class="text-sm font-medium text-foreground">Published</span>
      <button
        class="ml-auto text-xs font-medium text-emerald-500 hover:underline"
        @click="copyPublicUrl"
      >
        Copy link
      </button>
    </div>

    <button
      class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted-50 transition-colors text-left"
      @click="emit('share')"
    >
      <Icon icon="material-symbols:qr-code-2" class="text-xl text-orange-500 flex-shrink-0" />
      <span class="text-sm font-medium text-foreground">Share on your wifi</span>
    </button>

    <ClipStarButton variant="row" :clip="clip" @updated="emit('updated', $event)" />

    <div class="pt-1 flex items-center justify-between">
      <span class="text-xs text-muted-500">Trim, publish, move, delete</span>
      <ClipActionsMenu
        :clip="clip"
        @updated="emit('updated', $event)"
        @deleted="emit('deleted')"
      />
    </div>
  </div>
</template>
