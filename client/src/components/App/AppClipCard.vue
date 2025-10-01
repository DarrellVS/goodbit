<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useFormat } from '../../composables/useFormat';
import { useClipActions } from '../../composables/useClipActions';
import { useClipTags } from '../../composables/useClipTags';
import { updateClipName, starClip, unstarClip } from '../../services/clips';
import type { Clip } from '../../types/clip';
import BasePopover from '../Base/BasePopover.vue';
import BasePopoverActions from '../Base/BasePopoverActions.vue';

interface Props {
  clip: Clip;
  posterUrl: string;
  videoUrl: string;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
  (e: 'is-hovered', isHovered: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const router = useRouter();
const { formatBytes } = useFormat();

const { actions } = useClipActions({
  clip: computed(() => props.clip),
  emitUpdated: (clip) => emit('updated', clip),
  emitDeleted: () => emit('deleted'),
  router,
});

const {
  newTagName,
  availableTags,
  toggleTag,
  addTag,
  removeTag,
} = useClipTags(props.clip, (updated) => emit('updated', updated));

const visibleTags = computed(() => props.clip.tags?.slice(0, 2) || []);
const hiddenTagsCount = computed(() => Math.max(0, (props.clip.tags?.length || 0) - 2));

async function handleNameChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}

async function handleToggleStar(): Promise<void> {
  try {
    const updated = props.clip.starred 
      ? await unstarClip(props.clip.id) 
      : await starClip(props.clip.id);
    emit('updated', updated);
  } catch (error) {
    console.error('Failed to toggle star:', error);
  }
}
</script>

<template>
  <article 
    class="clip-card group relative bg-white/5 rounded-xl overflow-hidden border border-border/50 hover:border-orange-500/50 transition-all hover:shadow-lg"
    @mouseenter="emit('is-hovered', true)"
    @mouseleave="emit('is-hovered', false)"
  >
    <div v-if="clip.published" class="absolute top-3 right-14 z-10">
      <span class="bg-green-500/90 text-white text-xs font-medium px-2 py-1 rounded">
        Published
      </span>
    </div>
    
    <button 
      class="absolute top-3 left-3 z-10 rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition"
      :class="{ 'opacity-100': clip.starred, 'opacity-0 group-hover:opacity-100': !clip.starred }"
      :title="clip.starred ? 'Unstar' : 'Star'"
      @click.stop="handleToggleStar"
    >
      <Icon 
        icon="material-symbols:star" 
        class="text-lg" 
        :class="clip.starred ? 'text-orange-400' : 'text-white'" 
      />
    </button>
    
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
      <video 
        :id="`preview-video-${clip.id}`"
        :src="videoUrl" 
        :poster="posterUrl"
        class="w-full h-full m-0 p-0 object-cover" 
        preload="none" 
        controls
      />
    </div>
    
    <div class="p-3">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <input 
            class="w-full bg-transparent border-0 outline-none px-0 py-0 font-medium text-sm truncate hover:bg-white/5 focus:bg-white/5 rounded" 
            :value="clip.displayName ?? clip.filename" 
            :title="clip.displayName ?? clip.filename"
            @change="handleNameChange"
          />
          <div class="text-xs text-muted-400 mt-1 line-clamp-1">{{ clip.game }}</div>
        </div>
      </div>
      
      <div class="flex items-center justify-between text-xs text-muted-500">
        <span>{{ formatBytes(clip.sizeBytes) }}</span>
        <time :datetime="clip.fileModifiedAt">
          {{ new Date(clip.fileModifiedAt).toLocaleDateString() }}
        </time>
      </div>

      <div v-if="clip.tags?.length" class="flex items-center gap-1 flex-wrap mt-2">
        <span 
          v-for="tag in visibleTags" 
          :key="tag" 
          class="text-xs bg-white/10 px-2 py-0.5 rounded"
        >
          #{{ tag }}
        </span>
        
        <BasePopover v-if="hiddenTagsCount > 0" side="bottom" :side-offset="8">
          <template #trigger>
            <button class="text-xs text-muted-400 hover:text-foreground">
              +{{ hiddenTagsCount }}
            </button>
          </template>
          <div class="flex flex-col gap-1 p-2">
            <span v-for="tag in clip.tags" :key="tag" class="text-xs">#{{ tag }}</span>
          </div>
        </BasePopover>
      </div>

      <BasePopover side="bottom" :side-offset="8">
        <template #trigger>
          <button class="w-full mt-2 text-xs text-muted-400 hover:text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity text-left">
            Manage tags
          </button>
        </template>
        
        <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
          <header class="flex items-center justify-between">
            <h3 class="text-sm font-semibold">Manage Tags</h3>
          </header>
          
          <div class="flex items-center gap-2">
            <input
              v-model="newTagName"
              class="flex-1 rounded-lg border border-border/50 bg-white/5 px-3 h-9 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
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
            <div v-if="!availableTags.length" class="text-muted-400 text-sm py-4 text-center">
              No tags yet
            </div>
            
            <div v-else class="space-y-1">
              <div
                v-for="tag in availableTags"
                :key="tag"
                class="flex items-center gap-2"
              >
                <button
                  class="flex-1 text-left rounded-lg border border-border/30 px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors"
                  :class="{ 'ring-2 ring-orange-500/50 bg-orange-500/10 border-orange-500/30': clip.tags?.includes(tag) }"
                  @click="toggleTag(tag)"
                >
                  <span class="text-sm">#{{ tag }}</span>
                  <span v-if="clip.tags?.includes(tag)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
                </button>
                
                <button
                  class="p-2 rounded-lg border border-border/30 bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
                  title="Delete tag"
                  @click.stop="removeTag(tag)"
                >
                  <Icon icon="material-symbols:delete" class="text-muted-400 group-hover:text-red-500 transition-colors" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </BasePopover>
    </div>
  </article>
</template>
