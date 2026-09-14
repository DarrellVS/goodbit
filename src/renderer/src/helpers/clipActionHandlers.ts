import type { Router } from 'vue-router';
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Clip } from '../types/clip';
import { saveScrollPosition } from '../utils/scroll';
import { publishClip, unpublishClip, openClip, deleteClip, exportAudio, moveClipToGame, revealFileInExplorer } from '../services/clips';
import { useToastStore } from '../stores/toast';
import { useConfiguration } from '../composables/useConfiguration';
import { useGamesStore } from '../stores/games';
import { useCollectionsStore } from '../stores/collections';

export function createClipActionHandlers(params: {
  clip: MaybeRefOrGetter<Clip>;
  isPublishing: Ref<boolean>;
  isExportingAudio?: Ref<boolean>;
  emitUpdated: (clip: Clip) => void;
  emitDeleted: () => void;
  router: Router;
  collectionId?: number;
}) {
  const toastStore = useToastStore();
  const config = useConfiguration();
  const gamesStore = useGamesStore();
  const collectionsStore = useCollectionsStore();
  
  // Helper to always get the current clip value
  const getClip = () => toValue(params.clip);
  
  /**
   * Three entry points rather than one with a flag: each is bound straight to a
   * click, and a click handler's first argument is the event, not a flag.
   *
   * `onPublish` says nothing about compression and lets the setting decide;
   * the other two override it for one upload.
   */
  const onPublish = () => publish(undefined);
  const onPublishCompressed = () => publish(true);
  const onPublishOriginal = () => publish(false);

  async function publish(compress: boolean | undefined) {
    if (params.isPublishing.value) return;
    params.isPublishing.value = true;
    try {
      const clip = getClip();
      const updated = await publishClip(clip.id, { compress });
      params.emitUpdated(updated);
      const title = compress === true ? 'Compressed copy published' : 'Clip published';
      if (updated.publishedUrl) {
        await navigator.clipboard.writeText(updated.publishedUrl).catch(() => {});
        toastStore.success('URL copied to clipboard', title);
      } else {
        toastStore.success(title);
      }
    } catch (error) {
      // No toast here. `PublishClipAction` reports every failure over the
      // progress channel with the reason it actually hit, and this used to add
      // a second one saying "Please try again" on top of "No publisher is set
      // up", which is both a duplicate and wrong advice.
      console.error('Publish failed:', error);
    } finally {
      params.isPublishing.value = false;
    }
  }

  async function onUnpublish() {
    if (params.isPublishing.value) return;
    params.isPublishing.value = true;
    try {
      const clip = getClip();
      const updated = await unpublishClip(clip.id);
      params.emitUpdated(updated);
      toastStore.success('Clip unpublished successfully');
    } catch (error) {
      console.error('Unpublish failed:', error);
      toastStore.error('Please try again.', 'Unpublish failed');
    } finally {
      params.isPublishing.value = false;
    }
  }

  async function onCopyUrl() {
    const clip = getClip();
    const url = clip.publishedUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
    toastStore.success('URL copied to clipboard');
  }

  async function onReveal() {
    const clip = getClip();
    await openClip(clip.id);
  }

  function onTrim() {
    const clip = getClip();
    saveScrollPosition();
    void params.router.push(`/trim/${clip.id}`);
  }

  async function onDelete() {
    const clip = getClip();
    const performDelete = async () => {
      await deleteClip(clip.id);
      params.emitDeleted();
      toastStore.success('Clip moved to Recycle Bin');
    };

    if (config.public.value.confirmBeforeDelete) {
      toastStore.confirm(
        `${clip.filename}`,
        performDelete,
        'Move to Recycle Bin?'
      );
    } else {
      await performDelete();
    }
  }

  function onAdvancedEdit() {
    const clip = getClip();
    params.router.push(`/editor?clip=${clip.id}`);
  }

  async function onMoveToGame(targetGame: string) {
    try {
      const clip = getClip();
      const updatedClip = await moveClipToGame(clip.id, targetGame);
      params.emitUpdated(updatedClip);
      toastStore.success(`Moved to ${targetGame}`, 'Clip Moved');
      
      // Refresh games list in case it's a new game
      await gamesStore.fetchGames();
    } catch (error) {
      console.error('Failed to move clip:', error);
      toastStore.error('Failed to move clip', 'Move Failed');
    }
  }

  async function onRemoveFromCollection() {
    if (!params.collectionId) return;
    
    try {
      const clip = getClip();
      await collectionsStore.removeClipFromCollection(params.collectionId, clip.id);
      toastStore.success('Clip removed from collection');
    } catch (error) {
      console.error('Failed to remove clip from collection:', error);
      toastStore.error('Failed to remove clip from collection');
    }
  }

  async function onExportAudio() {
    if (params.isExportingAudio?.value) return;
    
    if (params.isExportingAudio) params.isExportingAudio.value = true;
    try {
      const clip = getClip();
      const result = await exportAudio(clip.id);
      toastStore.success(
        `Audio exported to ${result.filename}`, 
        'Export Complete',
        {
          label: 'Show in Folder',
          onClick: async () => {
            try {
              await revealFileInExplorer(result.audioPath);
            } catch (error) {
              console.error('Failed to reveal file:', error);
              toastStore.error('Failed to open file location');
            }
          }
        }
      );
    } catch (error) {
      console.error('Failed to export audio:', error);
      toastStore.error('Failed to export audio. Make sure ffmpeg is installed.');
    } finally {
      if (params.isExportingAudio) params.isExportingAudio.value = false;
    }
  }

  return { 
    onPublish, 
    onPublishCompressed,
    onPublishOriginal,
    onUnpublish, 
    onCopyUrl, 
    onReveal, 
    onTrim, 
    onDelete, 
    onAdvancedEdit,
    onMoveToGame,
    onRemoveFromCollection,
    onExportAudio,
  };
}


