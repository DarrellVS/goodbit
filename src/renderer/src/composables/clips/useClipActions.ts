import { computed, MaybeRefOrGetter, ref, toValue, watch, type Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
/** One thing a clip's menu can do. `useClipActionsHandlers` reads the handlers and the busy flag. */
interface ClipAction {
  key: string;
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}
import { createClipActionHandlers } from '@renderer/helpers/clipActionHandlers';

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

    function onAdvancedEdit() {
        const clip = toValue(opts.clip);
        opts.router.push(`/editor?clip=${clip.id}`);
    }

    const actions = computed<ClipAction[]>(() => {
        const clip = toValue(opts.clip);
        const list: ClipAction[] = [];

        list.push(
            { key: 'trim', label: 'Trim', onClick: onTrim },
            { key: 'edit', label: 'Advanced Edit', onClick: onAdvancedEdit },
            { key: 'reveal', label: 'Reveal in Explorer', onClick: onReveal },
        );

        if (clip.published) {
            if (clip.publishedUrl) {
                list.push({ key: 'copy', label: 'Copy URL', onClick: onCopyUrl });
            }

            list.push({
                key: 'unpublish',
                label: isPublishing.value ? 'Unpublishing…' : 'Unpublish',
                disabled: isPublishing.value,
                onClick: onUnpublish,
            });
        } else {
            list.push({
                key: 'publish',
                label: isPublishing.value ? 'Publishing…' : 'Publish',
                disabled: isPublishing.value,
                onClick: onPublish,
            });
        }

        list.push(
            { key: 'delete', label: 'Delete', onClick: onDelete, disabled: isPublishing.value },
        );

        return list;
    });

    return { actions };
}


