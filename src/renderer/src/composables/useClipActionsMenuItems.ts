import { computed, type Ref } from 'vue';
import type { Clip } from '../types/clip';
import type { PopoverAction } from '../components/Base/types';

interface MenuItemsOptions {
  clip: Ref<Clip>;
  isPublishing: Ref<boolean>;
  isExportingAudio: Ref<boolean>;
  onPublish: () => void;
  onUnpublish: () => void;
  onCopyUrl: () => void;
  onReveal: () => void;
  onTrim: () => void;
  onDelete: () => void;
  onAdvancedEdit: () => void;
  onMoveToGame: () => void;
  onRemoveFromCollection: () => void;
  onExportAudio: () => void;
  collectionId?: number;
}

export function useClipActionsMenuItems(options: MenuItemsOptions) {
  const editSubmenuItems = computed(() => [
    { key: 'trim', label: 'Trim', onClick: options.onTrim, icon: 'material-symbols:content-cut' },
    { key: 'edit', label: 'Advanced Edit', onClick: options.onAdvancedEdit, icon: 'material-symbols:video-settings' },
  ]);

  const mainMenuItems = computed(() => {
    const items: Array<{
      key: string;
      label: string;
      onClick: () => void;
      icon: string;
      variant?: 'danger' | 'muted';
      disabled?: boolean;
      conditional?: boolean;
      separatorBefore?: boolean;
    }> = [];

    items.push({
      key: 'reveal',
      label: 'Reveal in Explorer',
      onClick: options.onReveal,
      icon: 'material-symbols:folder-open',
    });

    items.push({
      key: 'export-audio',
      label: options.isExportingAudio.value ? 'Exporting Audio...' : 'Export Audio',
      onClick: options.onExportAudio,
      icon: options.isExportingAudio.value ? 'material-symbols:progress-activity' : 'material-symbols:audio-file',
      disabled: options.isExportingAudio.value,
    });

    items.push({
      key: 'move',
      label: 'Move to Game',
      onClick: options.onMoveToGame,
      icon: 'material-symbols:drive-file-move',
    });

    if (options.clip.value.published && options.clip.value.publishedUrl) {
      items.push({
        key: 'copy-url',
        label: 'Copy URL',
        onClick: options.onCopyUrl,
        icon: 'material-symbols:link',
      });
    }

    if (options.collectionId) {
      items.push({
        key: 'remove-from-collection',
        label: 'Remove from Collection',
        onClick: options.onRemoveFromCollection,
        icon: 'material-symbols:folder-delete',
        variant: 'danger',
        separatorBefore: true,
      });
    }

    if (options.clip.value.published) {
      items.push({
        key: 'unpublish',
        label: options.isPublishing.value ? 'Unpublishing…' : 'Unpublish',
        onClick: options.onUnpublish,
        icon: 'material-symbols:cloud-off',
        variant: 'danger',
        disabled: options.isPublishing.value,
        separatorBefore: true,
      });
    } else {
      items.push({
        key: 'publish',
        label: options.isPublishing.value ? 'Publishing…' : 'Publish',
        onClick: options.onPublish,
        icon: 'material-symbols:cloud-upload',
        disabled: options.isPublishing.value,
        separatorBefore: true,
      });
    }

    items.push({
      key: 'delete',
      label: 'Delete',
      onClick: options.onDelete,
      icon: 'material-symbols:delete',
      variant: 'danger',
      disabled: options.isPublishing.value,
      separatorBefore: true,
    });

    return items;
  });

  return {
    editSubmenuItems,
    mainMenuItems,
  };
}

