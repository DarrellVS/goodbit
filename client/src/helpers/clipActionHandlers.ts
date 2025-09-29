import type { Router } from 'vue-router';
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue';
import type { Clip } from '../types/clip';
import { publishClip, unpublishClip, openClip, deleteClip } from '../services/clips';

export function createClipActionHandlers(params: {
  clip: MaybeRefOrGetter<Clip>;
  isPublishing: Ref<boolean>;
  emitUpdated: (clip: Clip) => void;
  emitDeleted: () => void;
  router: Router;
}) {
  const clip = toValue(params.clip);
  
  async function onPublish() {
    if (params.isPublishing.value) return;
    params.isPublishing.value = true;
    try {
      const updated = await publishClip(clip.id);
      params.emitUpdated(updated);
      if (updated.publishedUrl) {
        await navigator.clipboard.writeText(updated.publishedUrl).catch(() => {});
      }
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
    if (!confirm(`Move to Recycle Bin and remove from list?\n${clip.filename}`)) return;
    await deleteClip(clip.id);
    params.emitDeleted();
  }

  return { onPublish, onUnpublish, onCopyUrl, onReveal, onTrim, onDelete };
}


