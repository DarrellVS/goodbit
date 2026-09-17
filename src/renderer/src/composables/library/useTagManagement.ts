import { useToastStore } from '@renderer/stores/toast';
import { useTagsStore } from '@renderer/stores/tags';
import { useClipsStore } from '@renderer/stores/clips';
import { deleteTag } from '@renderer/services/clips';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

export function useTagManagement() {
  const toastStore = useToastStore();
  const tagsStore = useTagsStore();
  const clipsStore = useClipsStore();

  async function removeTag(tagName: string): Promise<void> {
    confirmAction(
      `This will remove "${tagName}" from all clips.`,
      async () => {
        try {
          await deleteTag(tagName);
          
          const idx = tagsStore.items.findIndex(t => t.name === tagName);
          if (idx >= 0) tagsStore.items.splice(idx, 1);
          
          if (clipsStore.selectedTags.includes(tagName)) {
            clipsStore.setTags(clipsStore.selectedTags.filter(t => t !== tagName));
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
    removeTag,
  };
}

