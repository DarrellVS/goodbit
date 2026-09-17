<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useTagPatterns } from '@renderer/composables/library/useTagPatterns';
import { useToastStore } from '@renderer/stores/toast';
import type { TagCategory } from '@renderer/utils/tagSuggestions';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import BaseComboBox from '@renderer/components/Base/BaseComboBox.vue';
import type { ComboBoxOption } from '@renderer/components/Base/types';
import TagLibraryCard from '@renderer/components/Library/TagLibraryCard.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

const { patterns, loading, addPattern, updatePattern, removePattern } = useTagPatterns();

/** Regex punctuation, as opposed to a word somebody typed. */
function looksLikeRegex(source: string): boolean {
  return /[\\[\](){}|*+?^$]/.test(source);
}

/**
 * The plain reading of a pattern.
 *
 * `\b3k\b` is a word boundary around "3k", which is a thing only some people
 * know. Stripping the boundaries turns most of these back into the words they
 * were always about, and anything genuinely clever keeps its own syntax.
 */
function readablePattern(source: string): string {
  const plain = source.replace(/\\b/g, '').replace(/\[-_\]/g, ' ');
  return looksLikeRegex(plain) ? source : plain;
}
const toastStore = useToastStore();

const categories: TagCategory[] = ['General', 'Gameplay', 'Weapons', 'Maps', 'Modes', 'Quality'];

const categoryOptions = computed<ComboBoxOption[]>(() =>
  categories.map((category) => ({ value: category, label: category })),
);

/** The filter's own list, which has one more entry than the editor's. */
const filterCategoryOptions = computed<ComboBoxOption[]>(() => [
  { value: 'All', label: 'All categories' },
  ...categoryOptions.value,
]);

const selectedCategory = ref<TagCategory | 'All'>('All');
const searchQuery = ref('');
const isAddingNew = ref(false);

const newTag = ref('');
const newPatterns = ref('');
const newCategory = ref<TagCategory>('General');

const editingTag = ref<string | null>(null);
const editPatterns = ref('');
const editCategory = ref<TagCategory>('General');

const filteredPatterns = computed(() => {
  let result = patterns.value;

  if (selectedCategory.value !== 'All') {
    result = result.filter(p => p.category === selectedCategory.value);
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(p =>
      p.tag.toLowerCase().includes(query) ||
      p.patterns.some(pattern => pattern.source.toLowerCase().includes(query))
    );
  }

  return result;
});

const patternsByCategory = computed(() => {
  const grouped: Record<TagCategory, typeof patterns.value> = {
    General: [],
    Gameplay: [],
    Weapons: [],
    Maps: [],
    Modes: [],
    Quality: [],
  };

  filteredPatterns.value.forEach(pattern => {
    grouped[pattern.category].push(pattern);
  });

  return grouped;
});

function startEdit(tag: string): void {
  const pattern = patterns.value.find(p => p.tag === tag);
  if (!pattern) return;

  editingTag.value = tag;
  editPatterns.value = pattern.patterns.map(p => p.source).join(', ');
  editCategory.value = pattern.category;
}

function cancelEdit(): void {
  editingTag.value = null;
  editPatterns.value = '';
  editCategory.value = 'General';
}

async function saveEdit(): Promise<void> {
  if (!editingTag.value || !editPatterns.value) return;

  try {
    const patternStrings = editPatterns.value.split(',').map(p => p.trim()).filter(Boolean);

    await updatePattern(editingTag.value, patternStrings, editCategory.value);
    toastStore.success('Pattern updated successfully');
    cancelEdit();
  } catch (err) {
    toastStore.error('Failed to update pattern');
  }
}

async function handleDelete(tag: string): Promise<void> {
  confirmAction(
    `This will remove the tag pattern for "${tag}".`,
    async () => {
      try {
        await removePattern(tag);
        toastStore.success('Pattern deleted successfully');
      } catch (err) {
        toastStore.error('Failed to delete pattern');
      }
    },
    'Delete pattern?'
  );
}

function startAddNew(): void {
  isAddingNew.value = true;
  newTag.value = '';
  newPatterns.value = '';
  newCategory.value = 'General';
}

function cancelAddNew(): void {
  isAddingNew.value = false;
}

async function saveNew(): Promise<void> {
  if (!newTag.value || !newPatterns.value) return;

  try {
    const patternStrings = newPatterns.value.split(',').map(p => p.trim()).filter(Boolean);

    await addPattern(newTag.value, patternStrings, newCategory.value);
    toastStore.success('Pattern added successfully');
    cancelAddNew();
  } catch (err) {
    toastStore.error('Failed to add pattern');
  }
}
</script>

<template>
  <div class="px-12 py-6 space-y-6">
    <!--
      The tags themselves, above the rules that make them.

      This screen was only ever about patterns, and the one control for
      removing a tag from every clip lived in the library header's popover,
      which 3.9 replaced with a filter dropdown. A dropdown you choose from is
      the wrong place to delete from, so it came here: the app's one screen
      about tags.
    -->
    <TagLibraryCard />

    <div v-if="isAddingNew" class="py-6 border-b border-border">
      <h3 class="text-sm font-medium text-muted-600 mb-4">New tag pattern</h3>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Tag Name</label>
          <input
            v-model="newTag"
            type="text"
            placeholder="e.g., headshot"
            class="w-full h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-accent focus-visible:focus-ring transition-colors duration-150"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Patterns (comma-separated)</label>
          <input
            v-model="newPatterns"
            type="text"
            placeholder="e.g., headshot, ace, clutch"
            class="w-full h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-accent focus-visible:focus-ring transition-colors duration-150"
          />
          <div class="text-xs text-muted-600 mt-2 space-y-1">
            <p><strong>Simple words</strong> (e.g., "clutch", "ace") will match whole words only.</p>
            <p><strong>Advanced regex</strong> (e.g., "\\b5k\\b", "1v[2-5]") will be used as-is.</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Category</label>
          <BaseComboBox
            label="Category"
            :model-value="newCategory"
            :options="categoryOptions"
            @update:model-value="(value) => (newCategory = value as TagCategory)"
          />
        </div>

        <div class="flex gap-2">
          <button
            class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-medium transition"
            @click="saveNew"
          >
            Save
          </button>
          <button
            class="px-4 py-2 rounded-lg border border-border hover:bg-muted-100 text-muted-700 font-medium transition"
            @click="cancelAddNew"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <div class="flex gap-4">
      <div class="flex-1">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search patterns"
          class="w-full h-9 bg-transparent text-sm border-b border-line-strong focus:border-accent focus:outline-none transition-colors duration-150"
        >
      </div>

      <BaseComboBox
        class="w-48"
        label="Filter by category"
        :model-value="selectedCategory"
        :options="filterCategoryOptions"
        @update:model-value="(value) => (selectedCategory = value as TagCategory | 'All')"
      />

      <button
        type="button"
        class="inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium outline-none focus-visible:focus-ring transition-colors duration-150"
        @click="startAddNew"
      >
        <Icon icon="material-symbols:add" class="size-4 shrink-0 block" />
        <span>Add Pattern</span>
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <BaseSpinner class="w-8 h-8 text-accent-ink" />
    </div>

    <div v-else-if="selectedCategory === 'All'" class="space-y-6">
      <div v-for="category in categories" :key="category">
        <div v-if="patternsByCategory[category].length > 0">
          <h2 class="text-xs font-medium uppercase tracking-label text-muted-400 mb-3 flex items-center gap-2">
            <Icon icon="material-symbols:label" class="text-muted-500" />
            {{ category }}
            <span class="text-sm font-normal text-muted-500">({{ patternsByCategory[category].length }})</span>
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="pattern in patternsByCategory[category]"
              :key="pattern.tag"
              class="bg-muted-50 rounded-md p-4"
            >
              <div v-if="editingTag === pattern.tag" class="space-y-3">
                <input
                  v-model="editPatterns"
                  type="text"
                  class="w-full h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-accent focus-visible:focus-ring transition-colors duration-150"
                />
                <BaseComboBox
                  label="Category"
                  :model-value="editCategory"
                  :options="categoryOptions"
                  @update:model-value="(value) => (editCategory = value as TagCategory)"
                />
                <div class="flex gap-2">
                  <button
                    class="flex-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition"
                    @click="saveEdit"
                  >
                    Save
                  </button>
                  <button
                    class="flex-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-100 text-muted-700 text-sm font-medium transition"
                    @click="cancelEdit"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <div v-else>
                <div class="flex items-start justify-between mb-2">
                  <h3 class="font-semibold text-foreground">#{{ pattern.tag }}</h3>
                  <div class="flex gap-1">
                    <button
                      class="p-1.5 rounded-lg hover:bg-accent/16 transition-colors"
                      @click="startEdit(pattern.tag)"
                    >
                      <Icon icon="material-symbols:edit" class="text-muted-500" />
                    </button>
                    <button
                      class="p-1.5 rounded-lg hover:bg-danger/16 transition-colors"
                      @click="handleDelete(pattern.tag)"
                    >
                      <Icon icon="material-symbols:delete" class="text-danger-ink" />
                    </button>
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(p, idx) in pattern.patterns"
                      :key="idx"
                      class="text-xs bg-muted-100 px-2 py-1 rounded-sm"
                      :class="looksLikeRegex(p.source) ? 'font-mono text-muted-600' : ''"
                      :title="looksLikeRegex(p.source) ? `Pattern: ${p.source}` : `Matches the word ${p.source}`"
                    >
                      {{ readablePattern(p.source) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <div
        v-for="pattern in filteredPatterns"
        :key="pattern.tag"
        class="bg-muted-50 rounded-md p-4"
      >
        <div v-if="editingTag === pattern.tag" class="space-y-3">
          <input
            v-model="editPatterns"
            type="text"
            class="w-full h-9 rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-accent focus-visible:focus-ring transition-colors duration-150"
          />
          <BaseComboBox
            label="Category"
            :model-value="editCategory"
            :options="categoryOptions"
            @update:model-value="(value) => (editCategory = value as TagCategory)"
          />
          <div class="flex gap-2">
            <button
              class="flex-1 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition"
              @click="saveEdit"
            >
              Save
            </button>
            <button
              class="flex-1 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-100 text-muted-700 text-sm font-medium transition"
              @click="cancelEdit"
            >
              Cancel
            </button>
          </div>
        </div>

        <div v-else>
          <div class="flex items-start justify-between mb-2">
            <h3 class="font-semibold text-foreground">#{{ pattern.tag }}</h3>
            <div class="flex gap-1">
              <button
                class="p-1.5 rounded-lg hover:bg-accent/16 transition-colors"
                @click="startEdit(pattern.tag)"
              >
                <Icon icon="material-symbols:edit" class="text-muted-500" />
              </button>
              <button
                class="p-1.5 rounded-lg hover:bg-danger/16 transition-colors"
                @click="handleDelete(pattern.tag)"
              >
                <Icon icon="material-symbols:delete" class="text-danger-ink" />
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(p, idx) in pattern.patterns"
                :key="idx"
                class="text-xs bg-muted-100 px-2 py-1 rounded-sm"
                :class="looksLikeRegex(p.source) ? 'font-mono text-muted-600' : ''"
                :title="looksLikeRegex(p.source) ? `Pattern: ${p.source}` : `Matches the word ${p.source}`"
              >
                {{ readablePattern(p.source) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!loading && filteredPatterns.length === 0" class="text-center py-12">
      <Icon icon="material-symbols:search-off" class="w-16 h-16 text-muted-300 mx-auto mb-4" />
      <p class="text-muted-500">No patterns found</p>
    </div>
  </div>
</template>

