import { ref } from 'vue';
import { updateClipTags, deleteTag as deleteTagService } from '../services/clips';
import { useTagsStore } from '../stores/tags';
import { useToastStore } from '../stores/toast';
import type { Clip } from '../types/clip';

export function useClipTags(clip: Clip, onUpdate: (clip: Clip) => void) {
  const tagsStore = useTagsStore();
  const toastStore = useToastStore();
  const newTagName = ref('');

  async function toggleTag(tagName: string): Promise<void> {
    const currentTags = new Set(clip.tags || []);
    
    if (currentTags.has(tagName)) {
      currentTags.delete(tagName);
    } else {
      currentTags.add(tagName);
    }
    
    const updated = await updateClipTags(clip.id, Array.from(currentTags));
    onUpdate(updated);
  }

  async function addTag(): Promise<void> {
    const trimmedName = newTagName.value.trim();
    if (!trimmedName) return;

    const currentTags = new Set(clip.tags || []);
    currentTags.add(trimmedName);

    const updated = await updateClipTags(clip.id, Array.from(currentTags));
    onUpdate(updated);

    if (!tagsStore.items.includes(trimmedName)) {
      tagsStore.items.push(trimmedName);
    }

    newTagName.value = '';
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
    toggleTag,
    addTag,
    removeTag,
  };
}

