<script lang="ts" setup>
import BasePopover from '../Base/BasePopover.vue';
import BasePopoverActions from '../Base/BasePopoverActions.vue';
import { Icon } from '@iconify/vue';
import { RouterLink, useRouter } from 'vue-router';
import type { PopoverAction } from '../Base/types';
import { useClipActions } from '../../composables/useClipActions';
import type { Clip } from '../../types/clip';
import { useFormat } from '../../composables/useFormat';
import { updateClipName, updateClipTags, deleteClip, openClip, deleteTag, starClip, unstarClip } from '../../services/clips';
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

async function removeTag(tagName: string) {
  if (!confirm(`Delete tag "${tagName}"?\n\nThis will remove it from all clips.`)) return;
  
  try {
    await deleteTag(tagName);
    
    // Remove from store
    const idx = tagsStore.items.indexOf(tagName);
    if (idx >= 0) tagsStore.items.splice(idx, 1);
    
    // Remove from current clip if it has this tag
    if ((props.clip.tags || []).includes(tagName)) {
      const current = new Set(props.clip.tags || []);
      current.delete(tagName);
      const updated = await updateClipTags(props.clip.id, Array.from(current));
      emit('updated', updated);
    }
  } catch (error) {
    console.error('Failed to delete tag:', error);
    alert('Failed to delete tag. Please try again.');
  }
}

async function toggleStar() {
  try {
    const updated = props.clip.starred ? await unstarClip(props.clip.id) : await starClip(props.clip.id);
    emit('updated', updated);
  } catch (error) {
    console.error('Failed to toggle star:', error);
  }
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
    <!-- Published Badge -->
    <div v-if="clip.published" class="absolute top-3 right-14 z-10">
      <div class="bg-green-500/90 text-white text-xs font-medium px-2 py-1 rounded">Published</div>
    </div>
    
    <!-- Star Button -->
    <button 
      class="absolute top-3 left-3 z-10 rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition"
      :class="{ 'opacity-100': clip.starred, 'opacity-0 group-hover:opacity-100': !clip.starred }"
      @click.stop="toggleStar"
      :title="clip.starred ? 'Unstar' : 'Star'"
    >
      <Icon icon="material-symbols:star" class="text-lg" :class="clip.starred ? 'text-orange-400' : 'text-white'" />
    </button>
    
    <!-- Menu Button -->
    <div class="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
      <BasePopover side="bottom" :side-offset="8">
        <template #trigger>
          <button class="rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition">
            <Icon icon="material-symbols:more-vert" class="text-white" />
          </button>
        </template>
        <BasePopoverActions :actions="actions" />
      </BasePopover>
    </div>

    <div class="aspect-[21/9] bg-black relative">
      <video :src="videoUrl" :id="`preview-video-${clip.id}`" class="w-full h-full m-0 p-0 object-cover" preload="none" controls :poster="posterUrl"></video>
    </div>
    
    <div class="p-3">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <input 
            class="w-full bg-transparent border-0 outline-none px-0 py-0 font-medium text-sm truncate hover:bg-white/5 focus:bg-white/5 rounded" 
            :value="clip.displayName ?? clip.filename" 
            @change="updateName"
            :title="clip.displayName ?? clip.filename"
          />
          <div class="text-xs text-muted-400 mt-1 line-clamp-1">{{ clip.game }}</div>
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

      <!-- Manage tags popover - only visible on hover -->
      <BasePopover side="bottom" :side-offset="8">
        <template #trigger>
          <button class="w-full mt-2 text-xs text-muted-400 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity text-left">
            Manage tags
          </button>
        </template>
        <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold">Manage Tags</div>
          </div>
          
          <div class="flex items-center gap-2">
            <input
              class="flex-1 rounded-lg border border-border/50 bg-white/5 px-3 h-9 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
              v-model="newTag"
              placeholder="New tag name"
              @keyup.enter="addTag"
            />
            <button 
              class="rounded-lg bg-orange-500 hover:bg-orange-600 px-3 h-9 text-white text-sm font-medium transition"
              @click="addTag"
            >
              Add
            </button>
          </div>

          <div class="border-t border-border/30 pt-2">
            <div v-if="tagsStore.items.length === 0" class="text-muted-400 text-sm py-4 text-center">No tags yet</div>
            <div v-else class="space-y-1">
              <div
                v-for="t in tagsStore.items"
                :key="t"
                class="flex items-center gap-2"
              >
                <button
                  class="flex-1 text-left rounded-lg border border-border/30 px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors"
                  :class="{ 'ring-2 ring-orange-500/50 bg-orange-500/10 border-orange-500/30': (clip.tags || []).includes(t) }"
                  @click="toggleTag(t)"
                >
                  <span class="text-sm">#{{ t }}</span>
                  <span v-if="(clip.tags || []).includes(t)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
                </button>
                <button
                  class="p-2 rounded-lg border border-border/30 bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
                  @click.stop="removeTag(t)"
                  title="Delete tag"
                >
                  <Icon icon="material-symbols:delete" class="text-muted-400 group-hover:text-red-500 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </BasePopover>
    </div>
  </div>
</template>


