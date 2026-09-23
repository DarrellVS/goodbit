import { computed, ref } from 'vue';
import {
  batchDelete,
  getClip,
  listBurstClips,
  listUnreviewedClips,
  type BurstCluster,
  type BurstResult,
  type UnreviewedGroup,
  type UnreviewedResult,
} from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { useToastStore } from '@renderer/stores/toast';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { batchDeleteQuestion } from '@renderer/utils/clipDeleteQuestion';

/**
 * The state behind the Storage Saver screen.
 *
 * Two independent lists, each one request, and one deletion path shared by
 * both. Not a store: nothing outside this screen reads any of it, and the
 * selection is meaningless the moment you leave.
 *
 * The deletion goes through `batchDelete`, which is `BatchDeleteAction`: it
 * unpublishes, clears the caches, moves the file to the Recycle Bin and
 * removes the row, per clip, accumulating errors rather than stopping at the
 * first. A second deleter written for this screen would be a second place for
 * the unpublish step to be forgotten.
 *
 * **The scan's prune guard is deliberately not reused.** `MAX_PRUNE_FRACTION`
 * stops the *scan* deleting rows whose files look missing, because an
 * unmounted drive makes every file vanish at once and a clip row is the only
 * copy of its tags and notes. It is a guard against the app acting on bad
 * information, not a limit on what a person may do: somebody who selects 200
 * of their 300 clips here means it. What this screen owes them instead is a
 * question that says what is about to be destroyed.
 */
export function useStorageSaver() {
  const { confirm } = useConfirm();
  const { formatBytes } = useFormat();
  const toast = useToastStore();
  const { settings } = useAppSettings();
  // `confirmBeforeDelete` is a view preference, in localStorage, which is where
  // the library's own delete reads it from too.
  const config = useConfiguration();

  const unreviewed = ref<UnreviewedResult | null>(null);
  const bursts = ref<BurstResult | null>(null);
  const loadingUnreviewed = ref(false);
  const loadingBursts = ref(false);
  const deleting = ref(false);
  const error = ref<string | null>(null);

  /** Ticked in the graveyard. Ids, because a clip can leave the list. */
  const selected = ref<Set<number>>(new Set());

  /**
   * Which clip survives each burst, by cluster index.
   *
   * Seeded from the suggestion and overridable in one press. It is a guess,
   * and the other clips in the cluster are the ones about to be destroyed.
   */
  const keepers = ref<Map<number, number>>(new Map());

  const selectedClips = computed<Clip[]>(() => {
    const all = (unreviewed.value?.groups ?? []).flatMap((group) => group.clips);
    return all.filter((clip) => selected.value.has(clip.id));
  });

  const selectedBytes = computed(() =>
    selectedClips.value.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0),
  );

  async function loadUnreviewed(): Promise<void> {
    loadingUnreviewed.value = true;
    error.value = null;
    try {
      unreviewed.value = await listUnreviewedClips(settings.value.unreviewedDays);
      // Anything that is no longer on the list cannot stay ticked, or a later
      // delete acts on a clip the screen is not showing.
      const alive = new Set(
        (unreviewed.value.groups ?? []).flatMap((group) => group.clips.map((clip) => clip.id)),
      );
      selected.value = new Set([...selected.value].filter((id) => alive.has(id)));
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loadingUnreviewed.value = false;
    }
  }

  async function loadBursts(): Promise<void> {
    loadingBursts.value = true;
    try {
      bursts.value = await listBurstClips(settings.value.burstWindowSec);
      keepers.value = new Map(
        (bursts.value.clusters ?? []).map((cluster, index) => [index, cluster.suggestedKeeperId]),
      );
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loadingBursts.value = false;
    }
  }

  function toggle(clipId: number): void {
    const next = new Set(selected.value);
    if (next.has(clipId)) next.delete(clipId);
    else next.add(clipId);
    selected.value = next;
  }

  function toggleGroup(group: UnreviewedGroup): void {
    const ids = group.clips.map((clip) => clip.id);
    const allOn = ids.every((id) => selected.value.has(id));
    const next = new Set(selected.value);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    selected.value = next;
  }

  function keep(clusterIndex: number, clipId: number): void {
    keepers.value = new Map(keepers.value).set(clusterIndex, clipId);
  }

  /** Everything in a cluster except the one being kept. */
  function doomed(cluster: BurstCluster, index: number): Clip[] {
    const keeper = keepers.value.get(index) ?? cluster.suggestedKeeperId;
    return cluster.clips.filter((clip) => clip.id !== keeper);
  }

  /**
   * Ask, then delete.
   *
   * A dialog, never a toast: `toastStore.confirm` does not exist any more,
   * deliberately, because it put the question in the corner on top of the
   * button that had just been pressed and then answered "no" by itself when
   * the timer ran out. `confirmBeforeDelete` is the same switch the library's
   * own delete reads, so somebody who turned it off there is not asked twice
   * here either.
   */
  async function remove(clips: Clip[], title: string): Promise<void> {
    if (!clips.length || deleting.value) return;

    const question = batchDeleteQuestion({
      clipCount: clips.length,
      freedLabel: formatBytes(clips.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0)),
      withMetadataCount: clips.filter(carriesMetadata).length,
      publishedCount: clips.filter((clip) => clip.published).length,
    });

    const go = async (): Promise<void> => {
      deleting.value = true;
      try {
        const result = await batchDelete(clips.map((clip) => clip.id));
        if (result.failed > 0) {
          toast.error(`${result.failed} could not be deleted`, 'Some clips stayed');
        } else {
          toast.success(`${result.success} deleted`);
        }
        await Promise.all([loadUnreviewed(), loadBursts()]);
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Please try again', 'Delete failed');
      } finally {
        deleting.value = false;
      }
    };

    if (!config.public.value.confirmBeforeDelete) {
      await go();
      return;
    }

    confirm(question, go, title);
  }

  /**
   * Bring one clip up to date after it was opened from here.
   *
   * Not a reload, deliberately. Opening a clip is what "never opened" is
   * about, so a reload would take away the clip somebody just watched in order
   * to decide, before they could press delete. The clip stays where it is
   * with whatever changed (a trim makes it smaller), and only goes if it was
   * deleted from the clip's own panel, or given a name or a note, which is
   * the rule for being on this screen at all.
   */
  async function refresh(clipId: number): Promise<void> {
    let fresh: Clip | null = null;
    try {
      fresh = await getClip(clipId);
    } catch {
      fresh = null;
    }
    const gone = !fresh || Boolean(fresh.displayName?.trim()) || Boolean(fresh.notes?.trim());
    const swap = (clips: Clip[]): Clip[] =>
      gone ? clips.filter((clip) => clip.id !== clipId) : clips.map((clip) => (clip.id === clipId ? fresh! : clip));

    if (unreviewed.value) {
      const groups = unreviewed.value.groups
        .map((group) => {
          const clips = swap(group.clips);
          return {
            ...group,
            clips,
            reclaimableBytes: clips.reduce((sum, clip) => sum + (clip.sizeBytes || 0), 0),
          };
        })
        .filter((group) => group.clips.length > 0);
      unreviewed.value = {
        ...unreviewed.value,
        groups,
        totalClips: groups.reduce((sum, group) => sum + group.clips.length, 0),
        totalBytes: groups.reduce((sum, group) => sum + group.reclaimableBytes, 0),
      };
    }
    // A burst is only a burst with two in it, so one that lost a member is
    // worked out again rather than patched.
    if (gone && bursts.value?.clusters.some((cluster) => cluster.clips.some((clip) => clip.id === clipId))) {
      await loadBursts();
    }
    if (gone && selected.value.has(clipId)) {
      const next = new Set(selected.value);
      next.delete(clipId);
      selected.value = next;
    }
  }

  return {
    unreviewed,
    refresh,
    bursts,
    loadingUnreviewed,
    loadingBursts,
    deleting,
    error,
    selected,
    selectedClips,
    selectedBytes,
    keepers,
    loadUnreviewed,
    loadBursts,
    toggle,
    toggleGroup,
    keep,
    doomed,
    remove,
  };
}

/** Whether anything about this clip exists only in GoodBit. */
function carriesMetadata(clip: Clip): boolean {
  return Boolean(
    clip.displayName?.trim() ||
      clip.notes?.trim() ||
      (clip.tags && clip.tags.length > 0) ||
      (clip.goodBits && clip.goodBits.length > 0),
  );
}
