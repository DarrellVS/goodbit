import { computed, ref } from 'vue';
import { syncPublisherStats, type PublisherStats } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';

/**
 * What is on the publisher, and how much of it anybody has watched.
 *
 * **The one screen in this app that reads a remote service**, which changes
 * what "loading" and "empty" mean. Every other screen is answering from a
 * database on this machine: if it is slow, it is slow. This one can be
 * unreachable, and it must say so rather than spin, because a spinner on a
 * screen whose data lives on somebody's home server behind a domain is a lie
 * that lasts until they close the app.
 *
 * Three states worth telling apart, and the screen draws each:
 *
 * - **No publisher configured.** The common case for anybody who has never set
 *   one up, and not an error.
 * - **Unreachable, or too old to have the endpoint.** A container that is off,
 *   a domain that has moved, a publisher predating the view counter.
 * - **Counting, but not for long enough to say anything.** See `warmedUp`.
 */

/** How long the counter has to have been running before "nobody watched this" means anything. */
export const CLEANUP_WINDOW_DAYS = 60;

export function usePublisherStats() {
  const { settings } = useAppSettings();

  const stats = ref<PublisherStats | null>(null);
  const clips = ref<Clip[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const configured = computed(() => Boolean(settings.value.publisherBaseUrl));

  async function load(): Promise<void> {
    if (!configured.value) return;

    loading.value = true;
    error.value = null;
    try {
      /*
       * One request, which also brings the rows back.
       *
       * The sync loads exactly the published clips in order to write the
       * counts onto them, so it hands them back rather than leaving the screen
       * to ask again: a second fetch would draw yesterday's numbers first and
       * then change them under the reader.
       */
      stats.value = await syncPublisherStats();
      clips.value = stats.value.clips ?? [];
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Whether the counter has been running long enough to be believed.
   *
   * **This is the whole difference between a useful cleanup list and one that
   * offers to delete everything.** Nothing was counted before the counter
   * shipped, so on day one a clip published two years ago and one published
   * this morning both read zero views and "never viewed". A plain "not watched
   * in two months" rule would sweep the entire library the first time this
   * screen is opened, and it would be confident about it.
   *
   * So no suggestion appears at all until the counter has been watching for
   * longer than the window it is about to judge clips by.
   */
  const warmedUp = computed(() => {
    const since = stats.value?.countingSince;
    if (!since) return false;
    const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
    return days >= CLEANUP_WINDOW_DAYS;
  });

  /** How long until the counter has seen enough, in days, for the waiting message. */
  const daysUntilWarm = computed(() => {
    const since = stats.value?.countingSince;
    if (!since) return CLEANUP_WINDOW_DAYS;
    const days = (Date.now() - new Date(since).getTime()) / 86_400_000;
    return Math.max(0, Math.ceil(CLEANUP_WINDOW_DAYS - days));
  });

  /**
   * Published clips nobody has watched, biggest first.
   *
   * "Nobody" rather than "few": a clip with two views was sent to somebody and
   * opened, which is what publishing is for. The suggestion is for the ones
   * that went up and were never opened by anyone, including whoever published
   * them.
   *
   * Empty until `warmedUp`, and the screen says why rather than showing an
   * empty list, because those are different answers.
   */
  const neverWatched = computed<Clip[]>(() => {
    if (!warmedUp.value) return [];

    const cutoff = Date.now() - CLEANUP_WINDOW_DAYS * 86_400_000;
    return [...clips.value]
      .filter((clip) => {
        // Null is "nobody has counted", which is not the same as zero and must
        // never be read as "never watched".
        if (clip.publisherViews == null) return false;
        if (clip.publisherViews > 0) return false;
        const published = new Date(clip.recordedAt ?? clip.fileModifiedAt ?? 0).getTime();
        return published < cutoff;
      })
      .sort((a, b) => b.sizeBytes - a.sizeBytes);
  });

  const reclaimable = computed(() =>
    neverWatched.value.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0),
  );

  /** Most watched first, which is the other question this screen answers. */
  const mostWatched = computed<Clip[]>(() =>
    [...clips.value]
      .filter((clip) => (clip.publisherViews ?? 0) > 0)
      .sort((a, b) => (b.publisherViews ?? 0) - (a.publisherViews ?? 0)),
  );

  return {
    stats,
    clips,
    loading,
    error,
    configured,
    warmedUp,
    daysUntilWarm,
    neverWatched,
    mostWatched,
    reclaimable,
    load,
  };
}
