<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDragAndDrop } from '../../composables/useDragAndDrop';
import { useConfiguration } from '../../composables/useConfiguration';
import { useClipActionsHandlers } from '../../composables/useClipActionsHandlers';
import { useCollectionsStore } from '../../stores/collections';
import { useToastStore } from '../../stores/toast';
import type { Clip } from '../../types/clip';
import ClipActionsMenu from './ClipActionsMenu.vue';
import ClipStarButton from './ClipStarButton.vue';
import ClipPublishedBadge from './ClipPublishedBadge.vue';
import ClipNameInput from './ClipNameInput.vue';
import ClipMetadata from './ClipMetadata.vue';
import ClipTags from './ClipTags.vue';

interface Props {
  clip: Clip;
  posterUrl: string;
  videoUrl: string;
  collectionId?: number;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
  (e: 'is-hovered', isHovered: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const router = useRouter();
const config = useConfiguration();
const collectionsStore = useCollectionsStore();
const toastStore = useToastStore();
const { startDrag, endDrag } = useDragAndDrop();

function handleDragStart(event: DragEvent) {
  startDrag({ type: 'clip', clipId: props.clip.id }, event);
}

const {
  onPublish,
  onUnpublish,
  onCopyUrl,
  onReveal,
  onTrim,
  onDelete,
  isPublishing,
} = useClipActionsHandlers({
  clip: computed(() => props.clip),
  emitUpdated: (clip) => emit('updated', clip),
  emitDeleted: () => emit('deleted'),
  router,
});

function onAdvancedEdit() {
  router.push(`/editor?clip=${props.clip.id}`);
}

async function onRemoveFromCollection() {
  if (!props.collectionId) return;
  
  try {
    await collectionsStore.removeClipFromCollection(props.collectionId, props.clip.id);
    toastStore.success('Clip removed from collection');
  } catch (error) {
    console.error('Failed to remove clip from collection:', error);
    toastStore.error('Failed to remove clip from collection');
  }
}
</script>

<template>
  <article 
    draggable="true"
    class="clip-card shadow group relative bg-white/5 rounded-xl overflow-hidden border border-gray-300 hover:border-orange-500/50 transition-all hover:shadow-lg"
    @mouseenter="emit('is-hovered', true)"
    @mouseleave="emit('is-hovered', false)"
    @dragstart="handleDragStart"
    @dragend="endDrag"
  >
    <ClipPublishedBadge :published="clip.published" />
    
    <ClipStarButton :clip="clip" @updated="emit('updated', $event)" />
    
    <div class="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
      <ClipActionsMenu
        :clip="clip"
        :is-publishing="isPublishing"
        :collection-id="collectionId"
        @trim="onTrim"
        @advanced-edit="onAdvancedEdit"
        @reveal="onReveal"
        @copy-url="onCopyUrl"
        @publish="onPublish"
        @unpublish="onUnpublish"
        @delete="onDelete"
        @remove-from-collection="onRemoveFromCollection"
      />
    </div>

    <div class="aspect-[21/9] bg-black relative">
      <video 
        :id="`preview-video-${clip.id}`"
        :src="videoUrl" 
        :poster="posterUrl"
        :muted="config.public.value.muteVideosByDefault"
        class="w-full h-full m-0 p-0 object-cover" 
        preload="none" 
        controls
      />
    </div>
    
    <div :class="config.public.value.compactMode ? 'p-2' : 'p-3'">
      <div class="flex items-start justify-between gap-2 mb-2">
        <ClipNameInput :clip="clip" @updated="emit('updated', $event)" />
      </div>
      
      <ClipMetadata 
        :size-bytes="clip.sizeBytes" 
        :file-modified-at="clip.fileModifiedAt" 
      />

      <ClipTags :clip="clip" @updated="emit('updated', $event)" />
    </div>
  </article>
</template>
