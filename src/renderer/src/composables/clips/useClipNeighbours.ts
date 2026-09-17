import { computed, onBeforeUnmount, onMounted, type Ref } from 'vue';
import { useClipsStore } from '@renderer/stores/clips';

/**
 * The clip before this one and the clip after it, without closing anything.
 *
 * The one thing the app could not do. Looking through a session meant open,
 * look, close, find the next tile, open, and the audit found every persona
 * doing exactly that: the modal is a closer look at something you are still in
 * the middle of browsing, and browsing is a sequence.
 *
 * **The order is the library's own order, not the database's.** The store
 * holds what the grid is showing, already filtered, already searched, already
 * sorted, so walking it walks what the person can see. Reaching for
 * `GET /clips` instead would step into clips a filter had hidden, which reads
 * as the app losing your place.
 *
 * It stops at the ends rather than wrapping. A pager that wraps means the last
 * clip's Next is the first clip, and there is no way to tell that from the app
 * having jumped somewhere at random.
 */
export function useClipNeighbours(openClipId: Ref<number | null>, onGo: (id: number) => void) {
  const clipsStore = useClipsStore();

  const index = computed(() => {
    if (openClipId.value === null) return -1;
    return clipsStore.items.findIndex((clip) => clip.id === openClipId.value);
  });

  /** One-based, because it is read by a person: `4 of 11`. */
  const position = computed(() => (index.value < 0 ? 0 : index.value + 1));
  const total = computed(() => clipsStore.items.length);

  const hasPrevious = computed(() => index.value > 0);
  const hasNext = computed(() => index.value >= 0 && index.value < total.value - 1);

  function previous(): void {
    if (!hasPrevious.value) return;
    onGo(clipsStore.items[index.value - 1].id);
  }

  function next(): void {
    if (!hasNext.value) return;
    onGo(clipsStore.items[index.value + 1].id);
  }

  /*
   * `[` and `]`, and the arrow keys.
   *
   * The brackets are what every photo viewer uses and they are reachable while
   * a hand is on the mouse. The arrows are what somebody tries first, and they
   * are the reason for the guard below: a left arrow inside the notes editor,
   * a name field or the trim handles means "move the caret" or "nudge a
   * frame", and taking it from them would break three controls to add one.
   */
  function onKeydown(event: KeyboardEvent): void {
    if (openClipId.value === null) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const target = event.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target.isContentEditable) return;
      // A slider's own arrow keys move it by one frame.
      if (target.closest('[role="slider"]')) return;
    }

    if (event.key === '[' || event.key === 'ArrowLeft') {
      if (!hasPrevious.value) return;
      event.preventDefault();
      previous();
      return;
    }

    if (event.key === ']' || event.key === 'ArrowRight') {
      if (!hasNext.value) return;
      event.preventDefault();
      next();
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

  return { position, total, hasPrevious, hasNext, previous, next };
}
