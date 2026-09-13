<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue';
import { useTagsStore } from '../../stores/tags';

interface Props {
  open: boolean;
  selectedCount: number;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'add-tags', tags: string[]): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const tagsStore = useTagsStore();
const inputValue = ref('');
const selectedTags = ref<Set<string>>(new Set());

const availableTags = computed(() => {
  if (!inputValue.value) return tagsStore.tagNames;
  
  const search = inputValue.value.toLowerCase();
  return tagsStore.tagNames.filter(tag => tag.toLowerCase().includes(search));
});

const selectedTagsList = computed(() => Array.from(selectedTags.value));

function toggleTag(tag: string): void {
  if (selectedTags.value.has(tag)) {
    selectedTags.value.delete(tag);
  } else {
    selectedTags.value.add(tag);
  }
  selectedTags.value = new Set(selectedTags.value);
}

function addCustomTag(): void {
  const tag = inputValue.value.trim();
  if (tag && !selectedTags.value.has(tag)) {
    selectedTags.value.add(tag);
    selectedTags.value = new Set(selectedTags.value);
    inputValue.value = '';
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && inputValue.value.trim()) {
    event.preventDefault();
    addCustomTag();
  }
}

function handleApply(): void {
  if (selectedTags.value.size > 0) {
    emit('add-tags', Array.from(selectedTags.value));
    selectedTags.value.clear();
    inputValue.value = '';
    emit('update:open', false);
  }
}

function handleCancel(): void {
  selectedTags.value.clear();
  inputValue.value = '';
  emit('update:open', false);
}

onMounted(async () => {
  await tagsStore.fetchTags();
});
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-xl shadow-2xl border border-border w-full max-w-md max-h-[80vh] flex flex-col outline-none modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">
            Add Tags to {{ selectedCount }} Clip{{ selectedCount === 1 ? '' : 's' }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-600">
            Select existing tags or type to create new ones
          </DialogDescription>
        </div>

        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <!-- Input -->
          <div class="relative">
            <input
              v-model="inputValue"
              type="text"
              placeholder="Search or create tags..."
              class="w-full px-4 py-2 pr-10 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              @keydown="handleKeydown"
            />
            <button
              v-if="inputValue.trim()"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-muted-100 transition-colors"
              @click="addCustomTag"
              title="Add tag"
            >
              <Icon icon="material-symbols:add" class="text-xl text-muted-600" />
            </button>
          </div>

          <!-- Selected Tags -->
          <div v-if="selectedTagsList.length > 0" class="space-y-2">
            <div class="text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Selected Tags ({{ selectedTagsList.length }})
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tag in selectedTagsList"
                :key="tag"
                class="px-3 py-1.5 rounded-full bg-orange-100 text-orange-700 text-sm font-medium flex items-center gap-1.5 hover:bg-orange-200 transition-colors"
                @click="toggleTag(tag)"
              >
                <span>{{ tag }}</span>
                <Icon icon="material-symbols:close" class="text-base" />
              </button>
            </div>
          </div>

          <!-- Available Tags -->
          <div class="space-y-2">
            <div class="text-xs font-semibold text-muted-600 uppercase tracking-wide">
              Available Tags
            </div>
            <div v-if="availableTags.length > 0" class="flex flex-wrap gap-2">
              <button
                v-for="tag in availableTags"
                :key="tag"
                :class="[
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  selectedTags.has(tag)
                    ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                    : 'bg-muted-100 text-muted-700 hover:bg-muted-200'
                ]"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>
            </div>
            <div v-else class="text-sm text-muted-500 italic">
              No matching tags found
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-border flex items-center justify-end gap-3">
          <DialogClose as-child>
            <button
              class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-muted-50 transition-colors"
              @click="handleCancel"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="selectedTags.size === 0"
            @click="handleApply"
          >
            Add Tags
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

