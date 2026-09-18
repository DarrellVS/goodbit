import type { Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';

interface UseClipListHandlersOptions<TClip extends Clip> {
  clips: Ref<TClip[]>;
  onClipUpdated: (clip: TClip) => void;
  onClipDeleted: () => Promise<void>;
}

/**
 * What a list of clips does when one of them changes underneath it.
 *
 * `handlePageChange` used to live here, and with it the only reason this
 * touched the scroll position: turning a page had to put you back at the top,
 * because the page you asked for arrived under the row you were reading. There
 * are no pages any more, so there is nothing to scroll to the top of, and the
 * two remaining handlers pass a clip along.
 */
export function useClipListHandlers<TClip extends Clip>(options: UseClipListHandlersOptions<TClip>) {
  function handleClipUpdated(updatedClip: TClip): void {
    options.onClipUpdated(updatedClip);
  }

  async function handleClipDeleted(): Promise<void> {
    await options.onClipDeleted();
  }

  return {
    handleClipUpdated,
    handleClipDeleted,
  };
}
