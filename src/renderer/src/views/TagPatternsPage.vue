<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useTagPatterns } from '../composables/useTagPatterns';
import { useToastStore } from '../stores/toast';
import type { TagCategory } from '../utils/tagSuggestions';

const { patterns, loading, addPattern, updatePattern, removePattern } = useTagPatterns();
const toastStore = useToastStore();

const categories: TagCategory[] = ['General', 'Gameplay', 'Weapons', 'Maps', 'Modes', 'Quality'];

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
  toastStore.confirm(
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
  <div class="p-6 space-y-6">
    <div v-if="isAddingNew" class="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h3 class="text-lg font-semibold mb-4">New Tag Pattern</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Tag Name</label>
          <input
            v-model="newTag"
            type="text"
            placeholder="e.g., headshot"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
          />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Patterns (comma-separated)</label>
          <input
            v-model="newPatterns"
            type="text"
            placeholder="e.g., headshot, ace, clutch"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
          />
          <div class="text-xs text-muted-600 mt-2 space-y-1">
            <p><strong>Simple words</strong> (e.g., "clutch", "ace") will match whole words only.</p>
            <p><strong>Advanced regex</strong> (e.g., "\\b5k\\b", "1v[2-5]") will be used as-is.</p>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-muted-700 mb-2">Category</label>
          <select
            v-model="newCategory"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
          >
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
        </div>
        
        <div class="flex gap-2">
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium transition"
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
          placeholder="Search patterns..."
          class="w-full rounded-lg border border-border bg-card px-4 py-2.5 outline-none focus:ring-2 focus:ring-orange-500/50 transition"
        >
      </div>
      
      <select
        v-model="selectedCategory"
        class="rounded-lg border border-border bg-card pl-4 pr-10 py-2.5 outline-none focus:ring-2 focus:ring-orange-500/50 transition cursor-pointer appearance-none bg-no-repeat"
        style="background-image: url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%277%27 viewBox=%270 0 12 7%27%3e%3cpath fill=%27%23374151%27 d=%27M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z%27/%3e%3c/svg%3e'); background-position: right 1rem center;"
      >
        <option value="All">All Categories</option>
        <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
      </select>

      <button
        class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-card font-medium shadow-lg shadow-orange-500/20 transition-all"
        @click="startAddNew"
      >
        <Icon icon="material-symbols:add" class="text-lg" />
        <span>Add Pattern</span>
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
    </div>

    <div v-else-if="selectedCategory === 'All'" class="space-y-6">
      <div v-for="category in categories" :key="category">
        <div v-if="patternsByCategory[category].length > 0">
          <h2 class="text-lg font-semibold mb-3 flex items-center gap-2">
            <Icon icon="material-symbols:label" class="text-orange-500" />
            {{ category }}
            <span class="text-sm font-normal text-muted-500">({{ patternsByCategory[category].length }})</span>
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="pattern in patternsByCategory[category]"
              :key="pattern.tag"
              class="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div v-if="editingTag === pattern.tag" class="space-y-3">
                <input
                  v-model="editPatterns"
                  type="text"
                  class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
                />
                <select
                  v-model="editCategory"
                  class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
                >
                  <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
                </select>
                <div class="flex gap-2">
                  <button
                    class="flex-1 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
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
                      class="p-1.5 rounded-lg hover:bg-orange-500/16 transition-colors"
                      @click="startEdit(pattern.tag)"
                    >
                      <Icon icon="material-symbols:edit" class="text-orange-500" />
                    </button>
                    <button
                      class="p-1.5 rounded-lg hover:bg-red-500/16 transition-colors"
                      @click="handleDelete(pattern.tag)"
                    >
                      <Icon icon="material-symbols:delete" class="text-red-500" />
                    </button>
                  </div>
                </div>
                
                <div class="space-y-2">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="(p, idx) in pattern.patterns"
                      :key="idx"
                      class="text-xs bg-muted-100 px-2 py-1 rounded font-mono"
                    >
                      {{ p.source }}
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
        class="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
      >
        <div v-if="editingTag === pattern.tag" class="space-y-3">
          <input
            v-model="editPatterns"
            type="text"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
          />
          <select
            v-model="editCategory"
            class="w-full rounded-lg border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500/50 transition text-sm"
          >
            <option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</option>
          </select>
          <div class="flex gap-2">
            <button
              class="flex-1 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
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
                class="p-1.5 rounded-lg hover:bg-orange-500/16 transition-colors"
                @click="startEdit(pattern.tag)"
              >
                <Icon icon="material-symbols:edit" class="text-orange-500" />
              </button>
              <button
                class="p-1.5 rounded-lg hover:bg-red-500/16 transition-colors"
                @click="handleDelete(pattern.tag)"
              >
                <Icon icon="material-symbols:delete" class="text-red-500" />
              </button>
            </div>
          </div>
          
          <div class="space-y-2">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="(p, idx) in pattern.patterns"
                :key="idx"
                class="text-xs bg-muted-100 px-2 py-1 rounded font-mono"
              >
                {{ p.source }}
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

