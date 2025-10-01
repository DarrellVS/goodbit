<script lang="ts" setup>
import BasePopover from '../Base/BasePopover.vue';
import BasePopoverActions from '../Base/BasePopoverActions.vue';
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
const showTagsPopover = ref(false);

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
  <div class="clip-card group relative bg-white/5 rounded-xl overflow-hidden border border-border/50 hover:border-orange-500/50 transition-all hover:shadow-lg" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div v-if="clip.published" class="absolute top-3 left-3 z-10">
      <div class="bg-green-500/90 text-white text-xs font-medium px-2 py-1 rounded">Published</div>
    </div>
    
    <!-- Menu Button -->
    <div class="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
      <BasePopover side="bottom" :side-offset="8">
        <template #trigger>
          <button class="rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition">
            <Icon icon="radix-icons:dots-vertical" class="text-white" />
          </button>
        </template>
        <BasePopoverActions :actions="actions" />
      </BasePopover>
    </div>

    <div class="aspect-video bg-black relative">
      <video :src="videoUrl" :id="`preview-video-${clip.id}`" class="w-full h-full m-0 p-0 object-cover" preload="none" controls :poster="posterUrl"></video>
    </div>
    
    <div class="p-3">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <input 
            class="w-full bg-transparent border-0 outline-none px-0 py-0 font-medium text-sm truncate hover:bg-white/5 focus:bg-white/5 rounded px-1" 
            :value="clip.displayName ?? clip.filename" 
            @change="updateName"
            :title="clip.displayName ?? clip.filename"
          />
          <div class="text-xs text-muted-400 mt-1">{{ clip.game }}</div>
        </div>
      </div>
      
      <div class="flex items-center justify-between text-xs text-muted-500">
        <span>{{ formatBytes(clip.sizeBytes) }}</span>
        <span>{{ new Date(clip.fileModifiedAt).toLocaleDateString() }}</span>
      </div>

      <!-- Tags at bottom, collapsed by default -->
      <div v-if="(clip.tags || []).length > 0" class="flex items-center gap-1 flex-wrap mt-2">
        <span v-for="t in (clip.tags || []).slice(0, 2)" :key="t" class="text-xs bg-white/10 px-2 py-0.5 rounded">#{{ t }}</span>
        <BasePopover v-if="(clip.tags || []).length > 2" side="bottom" :side-offset="8">
          <template #trigger>
            <button class="text-xs text-muted-400 hover:text-foreground">+{{ (clip.tags || []).length - 2 }}</button>
          </template>
          <div class="flex flex-col gap-1 p-2">
            <span v-for="t in (clip.tags || [])" :key="t" class="text-xs">#{{ t }}</span>
          </div>
        </BasePopover>
      </div>

      <!-- Manage tags button - only visible on hover -->
      <button 
        class="w-full mt-2 text-xs text-muted-400 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity text-left"
        @click="showTagsPopover = true"
      >
        Manage tags
      </button>

      <!-- Hidden popover for managing tags -->
      <BasePopover side="bottom" :side-offset="8" v-model:open="showTagsPopover">
        <template #trigger>
          <button class="hidden"></button>
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
            :class="{ 'ring-2 ring-orange-500/50': (clip.tags || []).includes(t) }"
            @click="toggleTag(t)"
          >
            <span>#{{ t }}</span>
            <span v-if="(clip.tags || []).includes(t)" class="ml-2 text-xs text-orange-500">selected</span>
          </button>
        </div>
      </BasePopover>
    </div>
  </div>
</template>


