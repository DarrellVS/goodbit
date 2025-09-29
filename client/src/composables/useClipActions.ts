import { computed, MaybeRefOrGetter, ref, toValue, watch, type Ref } from 'vue';
import type { Clip } from '../types/clip';
import type { PopoverAction } from '../components/Base/types';
import { createClipActionHandlers } from '../helpers/clipActionHandlers';

export function useClipActions(opts: {
  clip: MaybeRefOrGetter<Clip>;
  emitUpdated: (clip: Clip) => void;
  emitDeleted: () => void;
  router: { push: (path: string) => any };
}) {
    const isPublishing = ref(false);

    const { onPublish, onUnpublish, onCopyUrl, onReveal, onTrim, onDelete } = createClipActionHandlers({
        clip: opts.clip,
        isPublishing: isPublishing,
        emitUpdated: opts.emitUpdated,
        emitDeleted: opts.emitDeleted,
        router: opts.router as any,
    });

    const actions = computed<PopoverAction[]>(() => {
        const clip = toValue(opts.clip);
        const list: PopoverAction[] = [];

        list.push(
            { key: 'trim', label: 'Trim', onClick: onTrim, variant: 'muted' },
            { key: 'reveal', label: 'Reveal in Explorer', onClick: onReveal, variant: 'muted' },
        );

        if (clip.published) {
            if (clip.publishedUrl) {
                list.push({ key: 'copy', label: 'Copy URL', variant: 'muted', onClick: onCopyUrl });
            }

            list.push({
                key: 'unpublish',
                label: isPublishing.value ? 'Unpublishing…' : 'Unpublish',
                variant: 'danger',
                disabled: isPublishing.value,
                onClick: onUnpublish,
            });
        } else {
            list.push({
                key: 'publish',
                label: isPublishing.value ? 'Publishing…' : 'Publish',
                variant: 'muted',
                disabled: isPublishing.value,
                onClick: onPublish,
            });
        }

        list.push(
            { key: 'delete', label: 'Delete', variant: 'danger', onClick: onDelete, disabled: isPublishing.value },
        );

        return list;
    });

    return { actions };
}


