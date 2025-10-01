import { ref, onMounted } from 'vue';
import { getAllPatterns, savePattern, deletePattern, initializeDefaultPatterns } from '../services/tagPatternsDb';
import { TAG_PATTERNS, type TagPattern, type TagCategory } from '../utils/tagSuggestions';

export function useTagPatterns() {
  const patterns = ref<TagPattern[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function loadPatterns(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await initializeDefaultPatterns(TAG_PATTERNS);
      patterns.value = await getAllPatterns();
    } catch (err) {
      console.error('Failed to load tag patterns:', err);
      error.value = 'Failed to load tag patterns';
      patterns.value = TAG_PATTERNS;
    } finally {
      loading.value = false;
    }
  }

  async function addPattern(
    tag: string,
    patternStrings: string[],
    category: TagCategory,
    aliases?: string[]
  ): Promise<void> {
    try {
      const pattern: TagPattern = {
        tag,
        patterns: patternStrings.map(p => new RegExp(p, 'i')),
        category,
        aliases,
      };
      
      await savePattern(pattern);
      await loadPatterns();
    } catch (err) {
      console.error('Failed to add pattern:', err);
      throw err;
    }
  }

  async function updatePattern(
    tag: string,
    patternStrings: string[],
    category: TagCategory,
    aliases?: string[]
  ): Promise<void> {
    await addPattern(tag, patternStrings, category, aliases);
  }

  async function removePattern(tag: string): Promise<void> {
    try {
      await deletePattern(tag);
      await loadPatterns();
    } catch (err) {
      console.error('Failed to delete pattern:', err);
      throw err;
    }
  }

  onMounted(() => {
    void loadPatterns();
  });

  return {
    patterns,
    loading,
    error,
    loadPatterns,
    addPattern,
    updatePattern,
    removePattern,
  };
}

