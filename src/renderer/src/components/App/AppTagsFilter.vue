<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useTagsStore } from '../../stores/tags';
import { useTagManagement } from '../../composables/useTagManagement';

interface Props {
  tags: Array<{ id: number; name: string }>;
  selectedTags: string[];
}

interface Emits {
  (e: 'update:selected-tags', tags: string[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const tagsStore = useTagsStore();
const { removeTag } = useTagManagement();

function toggleTag(tagName: string): void {
  const updated = props.selectedTags.includes(tagName)
    ? props.selectedTags.filter(t => t !== tagName)
    : [...props.selectedTags, tagName];
  emit('update:selected-tags', updated);
}

function handleRemoveTag(tagName: string): void {
  removeTag(tagName);
}
</script>

<template>
  <div class="flex flex-col gap-3 max-h-72 overflow-auto min-w-[280px]">
    <div class="text-sm font-semibold">Filter by Tags</div>
    <div v-if="tags.length === 0" class="text-muted-400 text-sm py-4 px-3 text-center">
      No tags yet. Hover a clip, choose Manage tags, and the ones you make show up here to filter by.
    </div>
    <div v-else class="space-y-1">
      <div
        v-for="tag in tags"
        :key="tag.id"
        class="flex items-center gap-2"
      >
        <button
          class="flex-1 text-left rounded-lg border border-border px-3 py-2.5 bg-card/5 hover:bg-card/10 transition-colors"
          :class="{ 'ring-2 ring-orange-500/50 bg-orange-500/10 border-orange-500/30': selectedTags.includes(tag.name) }"
          @click="toggleTag(tag.name)"
        >
          <span class="text-sm">#{{ tag.name }}</span>
          <span v-if="selectedTags.includes(tag.name)" class="ml-2 text-xs text-orange-500 font-medium">✓</span>
        </button>
        <button
          class="p-2 rounded-lg border border-border bg-card/5 hover:bg-red-500/20 hover:border-red-500/50 transition-colors group"
          @click.stop="handleRemoveTag(tag.name)"
          title="Delete tag"
        >
          <Icon icon="material-symbols:delete" class="text-muted-400 group-hover:text-red-500 transition-colors" />
        </button>
      </div>
    </div>
  </div>
</template>

