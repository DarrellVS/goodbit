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
import { compressPublishedClip } from '@renderer/services/clips';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { clipTitle } from '@renderer/utils/clipDeleteQuestion';

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

const { confirm: confirmAction } = useConfirm();

/**
 * Shrink what is behind the public link.
 *
 * Only offered on a published clip, and only worth pressing on one published
 * before `compressPublished` existed or with it switched off: those went up as
 * the whole eighty-megabit recording, and every viewer pulls all of it down a
 * home uplink.
 *
 * The question says the thing somebody will otherwise get wrong, which is that
 * this frees no disk space. Compressing the recording is a different button in
 * a different menu.
 */
function compressPublic(): void {
  confirmAction(
    `The copy behind the public link is replaced with a share-sized one, at the same ` +
      `address, so any link you have already sent keeps working. ` +
      `${clipTitle(props.clip)} on your own disk is not touched, so this frees no space here. ` +
      `Somebody watching right now may see the old file for a few more minutes.`,
    async () => {
      try {
        await compressPublishedClip(props.clip.id);
        toastStore.info('It will finish in the background', 'Shrinking the public copy');
      } catch (error) {
        console.error('Could not start:', error);
        toastStore.error('Please try again.', 'Could not start');
      }
    },
    'Shrink the published copy?',
    // Not `danger`: nothing is destroyed here. The recording is untouched and
    // the link keeps working; only the bytes behind it get smaller.
    { confirmLabel: 'Shrink it', tone: 'normal' },
  );
}

async function copyPublicUrl(): Promise<void> {
  if (!props.clip.publishedUrl) return;
  try {
    await navigator.clipboard.writeText(props.clip.publishedUrl);
    toastStore.success('Public link copied');
  } catch {
    toastStore.error('Could not copy the link');
  }
}

/**
 * One row, used by every action under the filled one.
 *
 * A grid rather than a flex row, so the glyphs form a column and the labels
 * share a left edge whatever a row carries on its right. `ClipStarButton` and
 * `ClipActionsMenu` draw their own row in this column and carry the same
 * template, since a `<script setup>` block cannot export a constant and one
 * that could would be a Base concern rather than this file's.
 */
const CLIP_ACTION_ROW =
  'w-full h-11 grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-3 rounded-md text-left ' +
  'hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150';
</script>

<template>
  <div class="space-y-1">
    <div
      v-if="clip.published && clip.publishedUrl"
      class="flex items-center gap-2 h-10 px-3 mb-2 rounded-md bg-success/10"
    >
      <Icon icon="material-symbols:cloud-done-rounded" class="size-4 shrink-0 block text-success" />
      <span class="text-sm font-medium text-foreground">Published</span>
      <button
        type="button"
        class="ml-auto text-xs font-medium text-success hover:underline outline-none focus-visible:focus-ring rounded-sm"
        @click="copyPublicUrl"
      >
        Copy link
      </button>
    </div>

    <!--
      Inside the published block, because it is meaningless anywhere else, and
      quiet, because most published clips already went up share-sized and this
      is for the ones that did not.
    -->
    <button
      v-if="clip.published && clip.publishedUrl"
      type="button"
      :class="CLIP_ACTION_ROW"
      @click="compressPublic"
    >
      <Icon icon="material-symbols:compress" class="size-5 shrink-0 block text-muted-500" />
      <span class="text-sm font-medium text-foreground">Shrink the published copy</span>
    </button>

    <!--
      The one filled control in this column, and the reason the four under it
      are not: a trim replaces the recording, and the rest write a label, open
      another screen or hand out a link.
    -->
    <button
      type="button"
      class="w-full h-11 grid grid-cols-[1.25rem_1fr] items-center gap-3 px-3 rounded-md bg-accent hover:bg-accent-hover text-left outline-none focus-visible:focus-ring transition-colors duration-150"
      @mouseenter="prefetchFrameStrip(clip.id)"
      @click="onTrim"
    >
      <Icon icon="material-symbols:content-cut" class="size-5 shrink-0 block text-accent-fg" />
      <span class="text-sm font-medium text-accent-fg">Trim to the good bit</span>
    </button>

    <button
      type="button"
      :class="CLIP_ACTION_ROW"
      @click="onAdvancedEdit"
    >
      <Icon icon="material-symbols:video-settings" class="size-5 shrink-0 block text-muted-500" />
      <span class="text-sm font-medium text-foreground">Open in the editor</span>
    </button>

    <button
      type="button"
      :class="CLIP_ACTION_ROW"
      @click="emit('share')"
    >
      <Icon icon="material-symbols:qr-code-2" class="size-5 shrink-0 block text-muted-500" />
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
</template>
