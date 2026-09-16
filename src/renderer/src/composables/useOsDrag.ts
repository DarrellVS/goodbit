import { ref } from 'vue';

/**
 * Whether this window is the source of a drag the operating system now owns.
 *
 * Dragging a clip out hands the file to the shell, and the shell offers it
 * back to every window under the pointer, including the one it came from. So
 * the import dropzone lit up over the library the moment a drag started: the
 * app offering to import a clip it already has.
 *
 * Module level, not per component, because the two sides are far apart: the
 * clip card starts the drag and the dropzone has to know about it.
 */
export const osDragActive = ref(false);

let detach: (() => void) | null = null;

/**
 * Called as the drag begins, and cleared when main says the drag is over.
 *
 * `webContents.startDrag` runs a nested message loop on Windows, so it returns
 * only once the drop has happened or been abandoned; main sends the signal at
 * that point. There is no `dragend` in the renderer to use instead, because the
 * web drag was cancelled to hand over to the shell in the first place.
 */
export function beginOsDrag(): void {
  osDragActive.value = true;

  detach?.();
  detach =
    window.goodbit?.onDragOutEnd(() => {
      osDragActive.value = false;
      detach?.();
      detach = null;
    }) ?? null;
}
