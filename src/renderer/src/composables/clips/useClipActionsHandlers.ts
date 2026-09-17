import { computed, type MaybeRefOrGetter } from 'vue';
import { useClipActions } from '@renderer/composables/clips/useClipActions';
import type { Clip } from '@renderer/types/clip';

interface UseClipActionsHandlersOptions {
  clip: MaybeRefOrGetter<Clip>;
  emitUpdated: (clip: Clip) => void;
  emitDeleted: () => void;
  router: { push: (path: string) => any };
}

export function useClipActionsHandlers(options: UseClipActionsHandlersOptions) {
  const { actions } = useClipActions(options);

  // Extract handler functions from actions
  const actionMap = computed(() => {
    const map: Record<string, () => void> = {};
    actions.value.forEach(action => {
      map[action.key] = action.onClick;
    });
    return map;
  });

  return {
    onPublish: () => actionMap.value['publish']?.(),
    onUnpublish: () => actionMap.value['unpublish']?.(),
    onCopyUrl: () => actionMap.value['copy']?.(),
    onReveal: () => actionMap.value['reveal']?.(),
    onTrim: () => actionMap.value['trim']?.(),
    onDelete: () => actionMap.value['delete']?.(),
    isPublishing: computed(() => 
      actions.value.find(a => a.key === 'publish' || a.key === 'unpublish')?.disabled || false
    ),
  };
}

