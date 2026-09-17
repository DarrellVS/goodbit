<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@renderer/stores/toast';
import { createClipActionHandlers } from '@renderer/helpers/clipActionHandlers';
import ClipStarButton from '@renderer/components/Library/ClipStarButton.vue';
import ClipActionsMenu from '@renderer/components/Library/ClipActionsMenu.vue';
import type { Clip } from '@renderer/types/clip';
import { prefetchFrameStrip } from '@renderer/utils/mediaUrl';

/**
 * What you can do with this clip, at the top of the sidebar where the actions
 * belong.
 *
 * The published state used to be a card of its own above everything else, which
 * meant the page was headed by a status you only ever see on a minority of
 * clips, and that card was written in emerald-on-emerald, so it was
 * unreadable the moment the app went dark. It is a row in here now.
 *
 * Trimming and the editor are buttons rather than menu items. They were both
 * behind the three dots, under a line of grey text naming them, which is the
 * most hidden place on the page for the two things the app is for. They sit
 * above sharing and starring because they change the clip, and a rule separates
 * them from the two that do not.
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
const router = useRouter();

// Only here to satisfy the handler factory; nothing in this card publishes.
const isPublishing = ref(false);

const { onTrim, onAdvancedEdit } = createClipActionHandlers({
  clip: computed(() => props.clip),
  isPublishing,
  emitUpdated: (clip) => emit('updated', clip),
  emitDeleted: () => emit('deleted'),
  router,
});

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
  <div class="bg-card rounded-2xl p-4 border border-border">
    <div class="space-y-2">
      <div
        v-if="clip.published && clip.publishedUrl"
        class="flex items-center gap-2 px-3 py-2 rounded-xl bg-success/10 border border-success/30"
      >
        <Icon icon="material-symbols:cloud-done-rounded" class="text-lg text-success shrink-0" />
        <span class="text-sm font-medium text-foreground">Published</span>
        <button
          class="ml-auto text-xs font-medium text-success hover:underline"
          @click="copyPublicUrl"
        >
          Copy link
        </button>
      </div>

      <button
        class="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-accent hover:bg-accent-hover transition-colors text-left"
        @mouseenter="prefetchFrameStrip(clip.id)"
        @click="onTrim"
      >
        <Icon icon="material-symbols:content-cut" class="text-xl text-accent-fg shrink-0" />
        <span class="text-sm font-semibold text-accent-fg">Trim to the good bit</span>
      </button>

      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-accent/40 bg-accent/5 hover:bg-accent/10 transition-colors text-left"
        @click="onAdvancedEdit"
      >
        <Icon icon="material-symbols:video-settings" class="text-xl text-muted-500 shrink-0" />
        <span class="text-sm font-medium text-foreground">Open in the editor</span>
      </button>
    </div>

    <div class="h-px bg-border my-3" role="presentation"></div>

    <div class="space-y-2">
      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted-50 transition-colors text-left"
        @click="emit('share')"
      >
        <Icon icon="material-symbols:qr-code-2" class="text-xl text-muted-500 shrink-0" />
        <span class="text-sm font-medium text-foreground">Share on your wifi</span>
      </button>

      <ClipStarButton variant="row" :clip="clip" @updated="emit('updated', $event)" />

      <ClipActionsMenu
        variant="row"
        :clip="clip"
        :show-edit-actions="false"
        @updated="emit('updated', $event)"
        @deleted="emit('deleted')"
      />
    </div>
  </div>
</template>
