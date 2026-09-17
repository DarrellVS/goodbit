import type { Ref } from 'vue';
import type { Clip } from '@renderer/types/clip';
import { scrollToTop } from '@renderer/utils/scroll';

interface UseClipListHandlersOptions<TClip extends Clip> {
  clips: Ref<TClip[]>;
  onPageChange: (page: number) => void;
  onClipUpdated: (clip: TClip) => void;
  onClipDeleted: () => Promise<void>;
}

export function useClipListHandlers<TClip extends Clip>(options: UseClipListHandlersOptions<TClip>) {
  function handlePageChange(page: number): void {
    options.onPageChange(page);
    scrollToTop();
  }

  function handleClipUpdated(updatedClip: TClip): void {
    options.onClipUpdated(updatedClip);
  }

  async function handleClipDeleted(): Promise<void> {
    await options.onClipDeleted();
  }

  return {
    handlePageChange,
    handleClipUpdated,
    handleClipDeleted,
  };
}

