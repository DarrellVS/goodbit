<script setup lang="ts">
import { computed, toRef, TransitionGroup } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipTags } from '../../composables/useClipTags';
import type { Clip } from '../../types/clip';
import BasePopover from '../Base/BasePopover.vue';

interface Props {
  clip: Clip;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const {
  newTagName,
  availableTags,
  suggestedTags,
  toggleTag,
  addTag,
  applySuggestedTag,
  removeTag,
  getCategoryForTag,
} = useClipTags(toRef(() => props.clip), (updated) => emit('updated', updated));

const visibleTags = computed(() => props.clip.tags?.slice(0, 2) || []);
const hiddenTagsCount = computed(() => Math.max(0, (props.clip.tags?.length || 0) - 2));
</script>

<template>
  <div>
    <!-- Visible Tags -->
    <TransitionGroup
      v-if="clip.tags?.length"
      name="tag"
      tag="div"
      class="flex items-center gap-1 gap-x-2 flex-wrap mt-2"
    >
      <span 
        v-for="tag in visibleTags" 
        :key="tag" 
        class="text-xs bg-white/10 py-0.5 rounded tag-enter-active"
      >
        #{{ tag }}
      </span>
      
      <BasePopover v-if="hiddenTagsCount > 0" key="more-tags" side="bottom" :side-offset="8">
        <template #trigger>
          <button class="text-xs text-muted-400 hover:text-foreground transform-transition">
            +{{ hiddenTagsCount }}
          </button>
        </template>
        <div class="flex flex-col gap-1 p-2">
          <span v-for="tag in clip.tags" :key="tag" class="text-xs">#{{ tag }}</span>
        </div>
      </BasePopover>
    </TransitionGroup>

    <!-- Manage Tags Popover -->
    <BasePopover side="bottom" :side-offset="8">
      <template #trigger>
        <button class="w-full mt-2 text-xs text-muted-400 hover:text-orange-500 opacity-0 group-hover:opacity-100 opacity-transition text-left transform-transition">
          Manage tags
        </button>
      </template>
      
      <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
        <header class="flex items-center justify-between">
          <h3 class="text-sm font-semibold">Manage Tags</h3>
        </header>
        
        <!-- Suggested Tags -->
        <div v-if="suggestedTags.length > 0" class="space-y-2">
          <div class="flex items-center gap-2 text-xs text-gray-600">
            <Icon icon="material-symbols:auto-awesome" class="text-orange-500" />
            <span class="font-medium">Suggested Tags</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="tag in suggestedTags"
              :key="tag"
              class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 hover:border-orange-500 hover:bg-orange-500/20 transition-all text-xs font-medium group scale-on-hover"
              :title="`Category: ${getCategoryForTag(tag)}`"
              @click="applySuggestedTag(tag)"
            >
              <Icon icon="material-symbols:add" class="text-orange-500 text-sm transform-transition group-hover:scale-110" />
              <span class="text-gray-900">#{{ tag }}</span>
            </button>
          </div>
        </div>
        
        <!-- Add New Tag -->
        <div class="flex items-center gap-2">
          <input
            v-model="newTagName"
            class="flex-1 rounded-lg border border-gray-300 bg-white/5 px-3 h-9 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
            placeholder="New tag name"
            @keyup.enter="addTag()"
          />
          <button 
            class="rounded-lg bg-orange-500 hover:bg-orange-600 px-3 h-9 text-white text-sm font-medium transition"
            @click="addTag()"
          >
            Add
          </button>
        </div>

        <!-- Available Tags List -->
        <div class="border-t border-gray-200 pt-2">
          <div v-if="!availableTags.length" class="text-muted-400 text-sm py-4 text-center">
            No tags yet
          </div>
          
          <div v-else class="space-y-1.5">
            <div
              v-for="tag in availableTags"
              :key="tag"
              class="flex items-center gap-2"
            >
              <button
                class="flex-1 text-left rounded-lg border-2 border-gray-200 px-3 py-2.5 bg-white/5 hover:bg-white/10 transition-colors"
                :class="{ 'bg-orange-500/10 border-orange-500': clip.tags?.includes(tag) }"
                @click="toggleTag(tag)"
              >
                <span class="text-sm">#{{ tag }}</span>
                <span v-if="clip.tags?.includes(tag)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
              </button>
              
              <button
                class="p-2 rounded-lg border border-gray-200 bg-white/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
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
</template>

