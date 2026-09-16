import { ref } from 'vue';

/**
 * Which clip is open, for the whole app.
 *
 * A clip's details used to be a route, which meant opening one left the
 * library: the scroll position had to be saved and restored by hand, the games
 * list and the filters were torn down and rebuilt, and closing it was a
 * navigation that could land somewhere else entirely. None of that is what
 * looking at a clip means. It is a closer look at something you are still in
 * the middle of browsing, so it is a layer over the library rather than a
 * replacement for it.
 *
 * Module level state rather than a route parameter, because the library
 * underneath has to stay mounted, and a route change unmounts it by
 * definition. `/clips/:id` and `/trim/:id` still exist and still work; they
 * open this and step back to the library, so a link from anywhere lands in the
 * same place.
 */
const openClipId = ref<number | null>(null);

/**
 * Which panel the layer is showing.
 *
 * Trimming used to be a page of its own, reached by leaving the clip. It is a
 * second panel over the same library now, and the first one gets out of the
 * way rather than being buried: two modals stacked over one clip is a stack
 * the user has to unwind, and both would be showing the same clip.
 */
export type ClipView = 'details' | 'trim';

const view = ref<ClipView>('details');

/**
 * Where leaving the trimmer goes back to.
 *
 * Trimming can be reached two ways, and they do not want the same answer.
 * From a tile in the library the details panel was never open, so backing out
 * of the trimmer should land on the library; going to details instead would
 * put the user somewhere they had not been, which reads as the back button
 * going forwards. From the details panel it should land back there.
 */
const cameFrom = ref<'library' | 'details'>('details');

export function useClipDetail() {
  return {
    openClipId,
    view,
    cameFrom,

    /** Open the layer from nothing, on whichever panel was asked for. */
    open: (id: number, as: ClipView = 'details') => {
      openClipId.value = id;
      view.value = as;
      cameFrom.value = 'library';
    },

    /** Swap panels on a layer that is already open. */
    show: (as: ClipView) => {
      if (as === 'trim') cameFrom.value = 'details';
      view.value = as;
    },

    /** The back arrow: out of the trimmer, to wherever the trimmer was entered from. */
    back: () => {
      if (cameFrom.value === 'details') {
        view.value = 'details';
        return;
      }
      openClipId.value = null;
    },

    /*
     * Closing clears the clip and nothing else.
     *
     * Resetting `view` here as well looked tidier and was a bug: the panel is
     * keyed on the view, so closing from the trimmer changed the key in the
     * same tick as the dialog was told to close, and Vue built the details
     * panel on the way out. Backing out of the trimmer to the library showed
     * the details instead. `open` sets the view every time, so there is nothing
     * to reset.
     */
    close: () => {
      openClipId.value = null;
    },
  };
}
