import { ref } from 'vue';

/**
 * Asking before something cannot be taken back.
 *
 * This used to be `toastStore.confirm`, which drew the question as a toast in
 * the corner with `duration: 10000`. Two things were wrong with that and both
 * bit a real user.
 *
 * A toast is a notification: it is dismissible, it is peripheral, and it sits
 * on top of whatever you were looking at, which for "Trim anyway?" meant the
 * question was drawn over the button that had just been pressed. And it
 * expired. Ten seconds is a countdown on an irreversible decision, and when it
 * ran out it silently chose "no", leaving somebody who had paused to read the
 * sentence unable to tell whether the trim had been cancelled or had never
 * started.
 *
 * A question now waits, in the middle, with the rest of the screen dimmed, and
 * goes away only when it has an answer.
 *
 * Module level state rather than a store, for the same reason `useClipDetail`
 * is: there is one question on screen at a time, it outlives whichever
 * component asked it, and the dialog that draws it is mounted once in
 * `App.vue`.
 */

export type ConfirmTone = 'danger' | 'normal';

export interface ConfirmOptions {
  /** The button that goes through with it. Defaults to "Confirm". */
  confirmLabel?: string;
  /**
   * `danger` paints the action red and is the default, because almost
   * everything that needs asking about here deletes, replaces or overwrites.
   */
  tone?: ConfirmTone;
  /** Iconify name, shown beside the question. */
  icon?: string;
}

interface Pending extends Required<ConfirmOptions> {
  title: string;
  description: string;
  onConfirm: () => void;
}

const pending = ref<Pending | null>(null);

const DEFAULT_ICON: Record<ConfirmTone, string> = {
  danger: 'material-symbols:warning-rounded',
  normal: 'material-symbols:help-rounded',
};

export function useConfirm() {
  /**
   * Ask, then run the callback if the answer is yes.
   *
   * The argument order is the one every call site already used when this was a
   * toast, so moving it was a rename rather than a rewrite of twenty
   * questions.
   */
  function confirm(
    description: string,
    onConfirm: () => void,
    title = 'Are you sure?',
    options: ConfirmOptions = {},
  ): void {
    const tone = options.tone ?? 'danger';

    pending.value = {
      title,
      description,
      onConfirm,
      tone,
      confirmLabel: options.confirmLabel ?? 'Confirm',
      icon: options.icon ?? DEFAULT_ICON[tone],
    };
  }

  function accept(): void {
    const asked = pending.value;
    pending.value = null;
    asked?.onConfirm();
  }

  function cancel(): void {
    pending.value = null;
  }

  return { pending, confirm, accept, cancel };
}
