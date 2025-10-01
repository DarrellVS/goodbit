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
import { updateClipName, updateClipTags, deleteClip, openClip } from '../../services/clips';
import { useTagsStore } from '../../stores/tags';
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
const tagsStore = useTagsStore();
const newTag = ref('');

async function updateName(e: Event) {
  const input = e.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}

async function updateTags(e: Event) {
  const input = e.target as HTMLInputElement;
  const raw = input.value || '';
  const parts = raw
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const unique = Array.from(new Set(parts));
  const updated = await updateClipTags(props.clip.id, unique);
  emit('updated', updated);
}
function toggleTag(tag: string) {
  const current = new Set(props.clip.tags || []);
  if (current.has(tag)) current.delete(tag); else current.add(tag);
  void updateClipTags(props.clip.id, Array.from(current)).then((updated) => {
    emit('updated', updated);
  });
}

function addTag() {
  const name = (newTag.value || '').trim();
  if (!name) return;
  const current = new Set(props.clip.tags || []);
  current.add(name);
  void updateClipTags(props.clip.id, Array.from(current)).then((updated) => {
    emit('updated', updated);
    if (!tagsStore.items.includes(name)) tagsStore.items.push(name);
    newTag.value = '';
  });
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
      <div class="flex items-center gap-2 flex-wrap">
        <template v-for="t in clip.tags || []" :key="t">
          <BaseBadge class="bg-white/10">#{{ t }}</BaseBadge>
        </template>
        <BasePopover side="bottom" :side-offset="8">
          <template #trigger>
            <button class="rounded-xl inline-flex items-center justify-center border border-border bg-white/10 px-3 py-2 outline-none">
              Manage tags
            </button>
          </template>
          <div class="flex flex-col gap-2 max-h-72 overflow-auto min-w-[240px]">
            <div class="text-xs text-muted-500">Select tags</div>
            <div class="flex items-center gap-2">
              <input
                class="w-full rounded-xl border border-border bg-white/10 px-3 h-9 outline-none"
                v-model="newTag"
                placeholder="New tag name"
                @keyup.enter="addTag"
              />
              <button class="rounded-xl border border-border bg-white/10 px-3 py-2" @click="addTag">Add</button>
            </div>
            <div v-if="tagsStore.items.length === 0" class="text-muted-500 text-sm">No tags yet</div>
            <button
              v-for="t in tagsStore.items"
              :key="t"
              class="text-left rounded-lg border border-border px-3 py-2 bg-white/5 hover:bg-white/10"
              :class="{ 'ring-2 ring-primary/50': (clip.tags || []).includes(t) }"
              @click="toggleTag(t)"
            >
              <span>#{{ t }}</span>
              <span v-if="(clip.tags || []).includes(t)" class="ml-2 text-xs text-primary">selected</span>
            </button>
          </div>
        </BasePopover>
      </div>
    </div>
  </BaseCard>
</template>


