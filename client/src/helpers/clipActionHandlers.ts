import type { Router } from 'vue-router';
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Clip } from '../types/clip';
import { publishClip, unpublishClip, openClip, deleteClip } from '../services/clips';
import { useToastStore } from '../stores/toast';
import { useConfiguration } from '../composables/useConfiguration';

export function createClipActionHandlers(params: {
  clip: MaybeRefOrGetter<Clip>;
  isPublishing: Ref<boolean>;
  emitUpdated: (clip: Clip) => void;
  emitDeleted: () => void;
  router: Router;
}) {
  const clip = toValue(params.clip);
  const toastStore = useToastStore();
  const config = useConfiguration();
  
  async function onPublish() {
    if (params.isPublishing.value) return;
    params.isPublishing.value = true;
    try {
      const updated = await publishClip(clip.id);
      params.emitUpdated(updated);
      if (updated.publishedUrl) {
        await navigator.clipboard.writeText(updated.publishedUrl).catch(() => {});
        toastStore.success('URL copied to clipboard', 'Clip published');
      } else {
        toastStore.success('Clip published successfully');
      }
    } catch (error) {
      console.error('Publish failed:', error);
      toastStore.error('Please try again.', 'Publish failed');
    } finally {
      params.isPublishing.value = false;
    }
  }

  async function onUnpublish() {
    if (params.isPublishing.value) return;
    params.isPublishing.value = true;
    try {
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
    const url = clip.publishedUrl;
    if (!url) return;
    await navigator.clipboard.writeText(url).catch(() => {});
  }

  async function onReveal() {
    await openClip(clip.id);
  }

  function onTrim() {
    void params.router.push(`/trim/${clip.id}`);
  }

  async function onDelete() {
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

  return { onPublish, onUnpublish, onCopyUrl, onReveal, onTrim, onDelete };
}


