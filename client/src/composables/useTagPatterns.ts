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
    category: TagCategory
  ): Promise<void> {
    try {
      const pattern: TagPattern = {
        tag,
        patterns: patternStrings.map(p => createOptimizedRegex(p)),
        category,
      };
      
      await savePattern(pattern);
      await loadPatterns();
    } catch (err) {
      console.error('Failed to add pattern:', err);
      throw err;
    }
  }

  function createOptimizedRegex(patternString: string): RegExp {
    // If pattern already has regex special chars or word boundaries, use as-is
    const hasRegexSyntax = /[\\^$*+?.()|[\]{}]/.test(patternString);
    
    if (hasRegexSyntax) {
      // User provided a regex pattern, use it directly
      return new RegExp(patternString, 'i');
    }
    
    // Simple word pattern - add word boundaries to avoid false matches
    // This prevents "ar" from matching "start", "car", etc.
    return new RegExp(`\\b${escapeRegex(patternString)}\\b`, 'i');
  }

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async function updatePattern(
    tag: string,
    patternStrings: string[],
    category: TagCategory
  ): Promise<void> {
    await addPattern(tag, patternStrings, category);
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

