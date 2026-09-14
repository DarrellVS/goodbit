import { ref, computed, onMounted, type Ref } from 'vue';
import { updateClipTags, deleteTag as deleteTagService } from '../services/clips';
import { useTagsStore } from '../stores/tags';
import { useToastStore } from '../stores/toast';
import { useClipsStore } from '../stores/clips';
import { listTagPatterns } from '../services/tagPatterns';
import { getCategoryForTag } from '../utils/tagSuggestions';
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
    const existingTags = clip.tags || [];
    const suggestions = new Set<string>();

    /*
     * What the patterns are matched against.
     *
     * This used to be the display name alone, falling back to the filename.
     * OBS names a recording after the moment it started, so for a stock library
     * the haystack was `Battlefield 6_25.09.2026_15-15-15.mp4`: a timestamp,
     * containing none of the words these patterns look for, and none of them
     * could ever fire. The screen promised to save you the typing and could
     * only work once you had already done it.
     *
     * Everything the person has actually written about the clip counts now, and
     * so does the game, which is how a weapon or a mode pattern gets a chance.
     */
    const haystack = [clip.displayName, clip.filename, clip.notes, clip.game]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    for (const pattern of patterns.value) {
      if (existingTags.includes(pattern.tag)) continue;

      if (pattern.patterns.some((regex) => regex.test(haystack))) {
        suggestions.add(pattern.tag);
        if (suggestions.size >= 3) break;
      }
    }

    return Array.from(suggestions).slice(0, 3);
  });
  
  onMounted(async () => {
    try {
      // Sources cross the wire as strings; a rule that cannot compile is
      // dropped rather than allowed to throw on every clip it is matched to.
      patterns.value = (await listTagPatterns()).flatMap((pattern) => {
        try {
          return [{
            tag: pattern.tag,
            patterns: pattern.patterns.map((source) => new RegExp(source, 'i')),
            category: pattern.category,
          }];
        } catch {
          return [];
        }
      });
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
    const currentTags = new Set(clip.tags || []);
    currentTags.add(name);

    const updated = await updateClipTags(clip.id, Array.from(currentTags));
    onUpdate(updated);

    // Add to tags store if not exists
    if (!tagsStore.tagNames.includes(name)) {
      tagsStore.items.push({ id: Date.now(), name }); // Temporary ID, will be updated on next fetch
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

          // Remove from tags store
          const tagIndex = tagsStore.items.findIndex(t => t.name === tagName);
          if (tagIndex >= 0) {
            tagsStore.items.splice(tagIndex, 1);
          }

          // Update current clip
          const clip = clipRef.value;
          if (clip.tags?.includes(tagName)) {
            const currentTags = new Set(clip.tags);
            currentTags.delete(tagName);
            const updated = await updateClipTags(clip.id, Array.from(currentTags));
            onUpdate(updated);
          }

          // Refresh all clips to update the tag removal across the entire list
          await clipsStore.fetchClips(false);
          
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
    availableTags: computed(() => tagsStore.tagNames),
    suggestedTags,
    toggleTag,
    addTag,
    applySuggestedTag,
    removeTag,
    getCategoryForTag,
  };
}

