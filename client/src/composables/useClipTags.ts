import { ref, computed, onMounted, type Ref } from 'vue';
import { updateClipTags, deleteTag as deleteTagService } from '../services/clips';
import { useTagsStore } from '../stores/tags';
import { useToastStore } from '../stores/toast';
import { useClipsStore } from '../stores/clips';
import { getAllPatterns } from '../services/tagPatternsDb';
import { resolveTagAlias, getCategoryForTag } from '../utils/tagSuggestions';
import type { Clip } from '../types/clip';
import type { TagPattern } from '../utils/tagSuggestions';

export function useClipTags(clipRef: Ref<Clip>, onUpdate: (clip: Clip) => void) {
  const tagsStore = useTagsStore();
  const toastStore = useToastStore();
  const clipsStore = useClipsStore();
  const newTagName = ref('');
  const patterns = ref<TagPattern[]>([]);
  const patternsLoaded = ref(false);
  
  const allClipTags = computed(() => {
    return clipsStore.items.flatMap(c => c.tags || []);
  });
  
  const suggestedTags = computed(() => {
    if (!patternsLoaded.value || patterns.value.length === 0) {
      return [];
    }
    
    const clip = clipRef.value;
    const clipName = clip.displayName || clip.filename;
    const existingTags = clip.tags || [];
    const suggestions = new Set<string>();
    const normalizedName = clipName.toLowerCase();
    
    for (const pattern of patterns.value) {
      if (existingTags.includes(pattern.tag)) continue;
      
      const matchesPattern = pattern.patterns.some(regex => regex.test(normalizedName));
      if (matchesPattern) {
        suggestions.add(pattern.tag);
        if (suggestions.size >= 3) break;
      }
    }
    
    if (suggestions.size < 3) {
      const frequency = new Map<string, number>();
      allClipTags.value.forEach(tag => {
        if (!existingTags.includes(tag)) {
          frequency.set(tag, (frequency.get(tag) || 0) + 1);
        }
      });
      
      const frequentTags = Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
        .slice(0, 3 - suggestions.size);
      
      frequentTags.forEach(tag => suggestions.add(tag));
    }
    
    return Array.from(suggestions).slice(0, 3);
  });
  
  onMounted(async () => {
    try {
      patterns.value = await getAllPatterns();
      patternsLoaded.value = true;
    } catch (error) {
      console.error('Failed to load patterns:', error);
    }
  });

  async function toggleTag(tagName: string): Promise<void> {
    const clip = clipRef.value;
    const currentTags = new Set(clip.tags || []);
    
    if (currentTags.has(tagName)) {
      currentTags.delete(tagName);
    } else {
      currentTags.add(tagName);
    }
    
    const updated = await updateClipTags(clip.id, Array.from(currentTags));
    onUpdate(updated);
  }

  async function addTag(tagName?: string): Promise<void> {
    const name = tagName || newTagName.value.trim();
    if (!name) return;

    const clip = clipRef.value;
    const resolvedTag = resolveTagAlias(name, patterns.value);
    const currentTags = new Set(clip.tags || []);
    currentTags.add(resolvedTag);

    const updated = await updateClipTags(clip.id, Array.from(currentTags));
    onUpdate(updated);

    if (!tagsStore.items.includes(resolvedTag)) {
      tagsStore.items.push(resolvedTag);
    }

    newTagName.value = '';
  }
  
  async function applySuggestedTag(tagName: string): Promise<void> {
    await addTag(tagName);
  }

  async function removeTag(tagName: string): Promise<void> {
    toastStore.confirm(
      `This will remove "${tagName}" from all clips.`,
      async () => {
        try {
          await deleteTagService(tagName);

          const tagIndex = tagsStore.items.indexOf(tagName);
          if (tagIndex >= 0) {
            tagsStore.items.splice(tagIndex, 1);
          }

          const clip = clipRef.value;
          if (clip.tags?.includes(tagName)) {
            const currentTags = new Set(clip.tags);
            currentTags.delete(tagName);
            const updated = await updateClipTags(clip.id, Array.from(currentTags));
            onUpdate(updated);
          }
          
          toastStore.success(`Tag "${tagName}" deleted successfully`);
        } catch (error) {
          console.error('Failed to delete tag:', error);
          toastStore.error('Please try again.', 'Failed to delete tag');
        }
      },
      'Delete tag?'
    );
  }

  return {
    newTagName,
    availableTags: tagsStore.items,
    suggestedTags,
    toggleTag,
    addTag,
    applySuggestedTag,
    removeTag,
    getCategoryForTag,
  };
}

