import { ref } from 'vue';

/**
 * Which collection is open, for the whole app.
 *
 * A collection used to be a route, and it showed why that is the wrong shape
 * for it three times over on one screen: the shell drew its own header
 * ("Collection", "View collection clips"), the page drew a second band with
 * the collection's actual name on a different ground, and the filter row was a
 * third. Three stacked bars before a single clip, and the middle one was the
 * only part carrying information.
 *
 * Opening a collection is the same kind of act as opening a clip: a closer
 * look at part of a library you are still in the middle of browsing. So it is
 * a layer over the library, exactly like `useClipDetail`, and for the same
 * reasons: the grid underneath stays mounted, its scroll position and filters
 * survive, and closing is a close rather than a navigation that might land
 * somewhere else.
 *
 * Module level state rather than a route parameter, because a route change
 * unmounts the library by definition. `/collections/:id` still exists and
 * still works; it opens this and steps back to the library, so a link or a
 * command lands in the same place.
 */
const openCollectionId = ref<number | null>(null);

export function useCollectionDetail() {
  return {
    openCollectionId,

    open: (id: number) => {
      openCollectionId.value = id;
    },

    close: () => {
      openCollectionId.value = null;
    },

    /**
     * Close only if this is the collection on screen.
     *
     * For deleting one: the layer has to go if you are looking at the thing
     * that just stopped existing, and has to stay if you deleted a different
     * one from the row underneath.
     */
    closeIfOpen: (id: number) => {
      if (openCollectionId.value === id) openCollectionId.value = null;
    },
  };
}
