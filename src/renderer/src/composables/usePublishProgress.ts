import { onBeforeUnmount, onMounted } from 'vue';
import { useToastStore } from '../stores/toast';
import type { ServiceEvent } from './useServiceEvents';

/**
 * "It is still going", publishing, out loud.
 *
 * Publishing a clip squeezes a couple of hundred megabytes and pushes them up a
 * home connection, which is a minute on a good day. The app used to say nothing
 * at all for that minute and then produce a link, which reads as nothing
 * happening followed by something happening for no reason.
 *
 * One toast per clip, which stays put and rewrites itself as the stages go by,
 * rather than a new toast per percent. Mounted once, at the shell, because a
 * publish started from the library should still be reported after navigating to
 * the clip's page.
 */

/** Publishing this many clips at once is unusual; the map keeps them apart. */
const toastFor = new Map<number, string>();

/** How long the finished toast stays before it goes on its own. */
const DONE_MS = 2500;

export function usePublishProgress(): void {
  const toasts = useToastStore();
  let detach: (() => void) | null = null;

  function handle(raw: unknown): void {
    const event = raw as ServiceEvent;
    if (event.type !== 'publish-progress') return;

    const existing = toastFor.get(event.clipId);

    if (event.stage === 'done' || event.stage === 'failed') {
      if (existing) {
        toasts.dismiss(existing);
        toastFor.delete(event.clipId);
      }
      if (event.stage === 'failed') {
        toasts.error(event.message || 'The upload did not finish.', `Could not publish ${event.name}`);
      } else {
        // The handler that started this also says the link was copied; this one
        // just closes the loop on the progress it was showing.
        toasts.show({
          title: 'Published',
          description: event.name,
          type: 'success',
          duration: DONE_MS,
        });
      }
      return;
    }

    const description =
      event.stage === 'compressing'
        ? `Making a smaller copy, ${event.percent}%`
        : `Uploading, ${event.percent}%`;

    if (existing) {
      toasts.update(existing, { description, progress: event.percent });
      return;
    }

    toastFor.set(
      event.clipId,
      toasts.show({
        title: `Publishing ${event.name}`,
        description,
        type: 'info',
        sticky: true,
        progress: event.percent,
      }),
    );
  }

  onMounted(() => {
    detach = window.goodbit?.onServiceEvent(handle) ?? null;
  });

  onBeforeUnmount(() => {
    detach?.();
    detach = null;
  });
}
