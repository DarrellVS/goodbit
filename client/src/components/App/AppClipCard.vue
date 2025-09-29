<script lang="ts" setup>
import BaseCard from '../Base/BaseCard.vue';
import BaseButton from '../Base/BaseButton.vue';
import BasePopover from '../Base/BasePopover.vue';
import BasePopoverActions from '../Base/BasePopoverActions.vue';
import BaseBadge from '../Base/BaseBadge.vue';
import { Icon } from '@iconify/vue';
import { RouterLink, useRouter } from 'vue-router';
import type { PopoverAction } from '../Base/types';
import { useClipActions } from '../../composables/useClipActions';
import type { Clip } from '../../types/clip';
import { useFormat } from '../../composables/useFormat';
import { updateClipName, deleteClip, openClip } from '../../services/clips';
import { publishClip, unpublishClip } from '../../services/clips';
import { computed, ref } from 'vue';

const props = defineProps<{ clip: Clip; posterUrl: string; videoUrl: string }>();
const emit = defineEmits<{ 
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void 
  (e: 'isHovered', isHovered: boolean): void
}>();
const { formatBytes } = useFormat();
const router = useRouter();

async function updateName(e: Event) {
  const input = e.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}

const { actions } = useClipActions({
  clip: computed(() => props.clip),
  emitUpdated: (clip) => emit('updated', clip),
  emitDeleted: () => emit('deleted'),
  router,
});

function onMouseEnter() {
  emit('isHovered', true);
}

function onMouseLeave() {
  emit('isHovered', false);
}
</script>

<template>
  <BaseCard class="clip-card relative" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div v-if="clip.published" class="absolute top-2 left-2 z-10">
      <BaseBadge class="bg-green-900/80 text-green-100 border-green-900">Published</BaseBadge>
    </div>
    <div class="aspect-[21/9] bg-black clip-thumb">
      <video :src="videoUrl" :id="`preview-video-${clip.id}`" class="w-full h-full m-0 p-0 object-cover" preload="none" controls :poster="posterUrl"></video>
    </div>
    <div class="p-4 space-y-3">
      <div class="flex items-center gap-2">
        <input class="w-full rounded-xl border border-border bg-white/10 px-3 h-10 outline-none flex-1" :value="clip.displayName ?? ''" :placeholder="clip.filename" @change="updateName" />
        <BasePopover side="bottom" :side-offset="8">
          <template #trigger>
            <button class="rounded-xl inline-flex items-center justify-center border border-border bg-white/10 px-3 py-2 outline-none size-10">
              <Icon icon="radix-icons:dots-horizontal" />
            </button>
          </template>
          <BasePopoverActions :actions="actions" />
        </BasePopover>
      </div>
      <div class="text-sm text-muted-500 flex gap-4">
        <span>{{ clip.game }}</span>
        <span>{{ formatBytes(clip.sizeBytes) }}</span>
        <span>{{ new Date(clip.fileModifiedAt).toLocaleString() }}</span>
      </div>
      
    </div>
  </BaseCard>
</template>


