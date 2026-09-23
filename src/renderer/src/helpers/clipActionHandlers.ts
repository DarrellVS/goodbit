import type { Router } from 'vue-router';
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
import { saveScrollPosition } from '@renderer/utils/scroll';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { prefetchFrameStrip } from '@renderer/utils/mediaUrl';
import { publishClip, unpublishClip, openClip, deleteClip, exportAudio, moveClipToGame, revealFileInExplorer, compressClip } from '@renderer/services/clips';
import { useToastStore } from '@renderer/stores/toast';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useGamesStore } from '@renderer/stores/games';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { clipTitle } from '@renderer/utils/clipDeleteQuestion';
import { useCompressionResult } from '@renderer/composables/clips/useCompressionResult';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

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
  const compression = useCompressionResult();
  
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

  /**
   * Trimming is a face of the clip layer, not a page you leave for.
   *
   * From a tile the layer is not open yet, so this opens it straight onto the
   * trimmer; from the layer it swaps the face it is already showing. Either
   * way nothing navigates and the library stays where it was.
   */
  function onTrim() {
    const clip = getClip();
    const layer = useClipDetail();

    // Before the panel exists, so the decode runs behind the animation rather
    // than in front of an empty timeline.
    prefetchFrameStrip(clip.id);

    // Already looking at this clip means the details panel is what the trimmer
    // is replacing, and what backing out of it should return to. Coming from a
    // tile there is nothing open yet, so the library is.
    if (layer.openClipId.value === clip.id) layer.show('trim');
    else layer.open(clip.id, 'trim');
  }

  async function onDelete() {
    const clip = getClip();
    const performDelete = async () => {
      await deleteClip(clip.id);
      params.emitDeleted();
      toastStore.success('Clip moved to Recycle Bin');
    };

    if (config.public.value.confirmBeforeDelete) {
      confirmAction(
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
      /*
       * Say where it went.
       *
       * "Audio exported to <name>.mp3" names the file and not the folder, and
       * it lands in the music folder, which is not where anybody looks for the
       * audio of a clip. A walkthrough user had to press "Show in Folder" to
       * find out where their file was. The folder is the part that was
       * missing, so the sentence carries it and the button stays for opening
       * it.
       */
      toastStore.success(
        `${result.filename} is in your music folder.`,
        'Audio exported',
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

  /**
   * Squeeze the recording, in place, to get the disk back.
   *
   * Asked first, always, and not behind `confirmBeforeDelete`: that switch is
   * about deleting, and somebody who turned it off did not agree to have their
   * only copy of a moment re-encoded without being told. What the question has
   * to say is the part that cannot be undone, which is that the picture is
   * being thrown away rather than the file being moved anywhere.
   *
   * The original goes to the Recycle Bin rather than being overwritten, so the
   * sentence can honestly offer a way back, and it says so.
   */
  async function onCompress() {
    const clip = getClip();

    confirmAction(
      `${clipTitle(clip)} will be re-encoded to about a fifth of its size, and the ` +
        'picture it is now will be gone. The recording goes to the Recycle Bin, so you can ' +
        'still get the original back from there. Its marks, tags and notes are untouched.',
      async () => {
        let jobId: string;
        try {
          ({ jobId } = await compressClip(clip.id));
        } catch (error) {
          console.error('Failed to start compression:', error);
          toastStore.error('Please try again.', 'Could not start');
          return;
        }
        toastStore.info('The card updates when it is done.', 'Compressing');
        const { clip: fresh } = await compression.follow(jobId, clip);
        if (fresh) params.emitUpdated(fresh);
      },
      'Compress this clip?',
      { confirmLabel: 'Compress', tone: 'danger', emphasis: clipTitle(clip) },
    );
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
    onCompress,
  };
}


