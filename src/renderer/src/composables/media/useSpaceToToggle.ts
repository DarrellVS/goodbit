import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * Space plays and pauses, unless space already means something.
 *
 * Every player in the app wants this and three of them had written their own
 * guard, each one shorter than the last: the trim page checked for an input, a
 * textarea and `contenteditable`, the carousel checked for an input and a
 * textarea, and the clip panel had none at all, which is the one you noticed.
 *
 * **What space already means matters more than what we want it to mean.** In a
 * text field it is a space. On a focused button, a link, a checkbox or a tab it
 * is the activation key, so stealing it would break the keyboard route to every
 * control on the screen: pressing Tab to `Star this clip` and then space has to
 * star the clip, not pause the video. On a slider it is nothing, but the arrow
 * keys there are the control, and a slider with a `role` is a control somebody
 * is holding.
 *
 * So the guard is a list of what space belongs to, and this gets it only when
 * nothing on that list has focus.
 *
 * `root` scopes it. Two players can be alive at once, the clip panel over the
 * carousel on Today, and both were listening on `window`: one press would
 * toggle the one you are looking at and the one behind it, so closing the panel
 * revealed a clip that had started playing on its own. When a modal is open,
 * only a player inside it hears the key.
 */

/** Space is the activation key for these, so it is theirs, not ours. */
const TAKES_SPACE = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="slider"]',
  '[contenteditable="true"]',
].join(',');

export function useSpaceToToggle(toggle: () => void, root?: Ref<HTMLElement | null>): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;

    const focused = document.activeElement as HTMLElement | null;
    if (focused?.isContentEditable || focused?.closest(TAKES_SPACE)) return;

    /*
     * The topmost dialog owns the keyboard.
     *
     * Reka marks an open dialog with `role="dialog"` and removes it on close,
     * so its presence is the question worth asking. A player with no root is
     * on the page itself, and the page is never the top layer.
     */
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      const host = root?.value;
      if (!host || !dialog.contains(host)) return;
    }

    event.preventDefault();
    toggle();
  }

  // Capture, so a stray handler on the way up cannot swallow it first.
  onMounted(() => window.addEventListener('keydown', onKeydown, { capture: true }));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, { capture: true }));
}
