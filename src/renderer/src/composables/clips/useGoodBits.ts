import { computed, reactive, ref, type Ref } from 'vue';
import { useToastStore } from '@renderer/stores/toast';
import { useClipsStore } from '@renderer/stores/clips';
import {
  createGoodBit,
  deleteGoodBit,
  listGoodBits,
  renderGoodBit,
  updateGoodBit,
} from '@renderer/services/goodbits';
import { cancelJob, formatEta, pollJob } from '@renderer/services/jobs';
import { durationLabel, goodBitLabel, overlapping, rangeLabel } from '@renderer/utils/goodBits';
import type { GoodBit, NewGoodBit } from '@renderer/types/goodbit';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

/**
 * One clip's GoodBits, and everything that can be done to them.
 *
 * Three surfaces show a clip's GoodBits now: the trimmer, where a range is
 * marked, the details list, and the player's own progress bar, which draws them
 * as highlights over the timeline.
 *
 * **One list per clip, shared between them.** It used to be one instance each,
 * on the reasoning that the trimmer and the list are never on screen together
 * because the panel is keyed on the view and remounts. That was true and is no
 * longer the whole picture: the player and the list *are* on screen together,
 * so two instances would mean two fetches of the same rows and, worse, a
 * highlight on the bar that does not move when a GoodBit is renamed or deleted
 * six inches below it. The shared list is what keeps them telling the same
 * story.
 *
 * **Deleting a GoodBit does not touch the recording**, and the confirmation says
 * so. That is the difference between this and a trim and it is the whole point
 * of the feature, so it is said at the one moment somebody might be worried
 * about it.
 */
/**
 * The rows, kept per clip so every reader of one clip sees one list.
 *
 * Keyed by id rather than held as a single "current clip" list, because the
 * library underneath a clip panel can be showing a different clip's card and a
 * single slot would have them overwrite each other. One small array per clip
 * that has been looked at, which for a library of a few hundred is nothing.
 */
const rowsByClip = reactive<Record<number, GoodBit[]>>({});

/**
 * Which clips have actually been read, as opposed to merely asked about.
 *
 * A library card falls back to the ranges its own row carried until the clip
 * has been opened, and an empty list has to be distinguishable from "nobody
 * has looked yet" for that to work: a clip whose panel has never been opened
 * would otherwise appear to have no GoodBits and its bands would vanish.
 */
const loadedClips = reactive<Record<number, boolean>>({});

function listFor(id: number): GoodBit[] {
  const existing = rowsByClip[id];
  if (existing) return existing;

  rowsByClip[id] = [];
  return rowsByClip[id];
}

/** The start and end of every range on a clip, or null if it has never been read. */
export function liveGoodBitRanges(
  clipId: number,
): Array<{ startSec: number; endSec: number }> | null {
  if (!loadedClips[clipId]) return null;
  return (rowsByClip[clipId] ?? []).map(({ startSec, endSec }) => ({ startSec, endSec }));
}

export function useGoodBits(clipId: Ref<number>) {
  const toastStore = useToastStore();
  const clipsStore = useClipsStore();

  /*
   * Writable, and resolved on every read, so a caller whose `clipId` changes
   * follows the clip rather than keeping the list it started with. `load`
   * assigns to it and the mutations push into the array it returns, which is
   * the same array every other reader of this clip is holding.
   */
  const goodBits = computed<GoodBit[]>({
    get: () => listFor(clipId.value),
    set: (rows) => {
      rowsByClip[clipId.value] = rows;
    },
  });
  const loading = ref(false);
  /** Set while a create, rename, move or delete is in flight. */
  const saving = ref(false);

  /** Which GoodBit is being written out, and how far it has got. */
  const renderingId = ref<number | null>(null);
  const renderProgress = ref(0);
  const renderEta = ref<string | null>(null);

  /**
   * A failed read leaves the list empty and says nothing.
   *
   * There is no promise to break: the section draws its empty state, which
   * invites somebody to mark one, and the create that follows would report its
   * own failure properly.
   */
  async function load(): Promise<void> {
    loading.value = true;
    try {
      goodBits.value = await listGoodBits(clipId.value);
      loadedClips[clipId.value] = true;
    } catch (error) {
      console.error('Failed to load the GoodBits for this clip:', error);
      goodBits.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** In clip order, the way the server answers, so a local insert matches a reload. */
  function sort(): void {
    goodBits.value.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  }

  /**
   * Mark a range.
   *
   * Answers the row so a caller can select what it has just made, or null when
   * the server refused it: the range checks live in main and their messages are
   * sentences somebody can act on ("a GoodBit cannot end after the clip does"),
   * so the toast shows what came back rather than a generic failure.
   */
  async function mark(goodBit: NewGoodBit): Promise<GoodBit | null> {
    if (saving.value) return null;
    saving.value = true;

    try {
      const created = await createGoodBit(clipId.value, goodBit);
      goodBits.value.push(created);
      sort();

      /*
       * An overlap is allowed and worth mentioning.
       *
       * The server does not refuse one, on purpose: a thirty second firefight
       * marked as one GoodBit with the kill inside it marked as another is two
       * legitimate GoodBits. What the toast is for is the other case, somebody
       * marking the same moment twice on a clip they have come back to, which
       * is easy to do and invisible until the list is read.
       */
      const clashes = overlapping(created, goodBits.value.filter((other) => other.id !== created.id));
      const range = rangeLabel(created.startSec, created.endSec);

      if (clashes.length > 0) {
        toastStore.info(
          `${range} overlaps ${clashes.map(goodBitLabel).join(', ')}. That is allowed, in case you meant it.`,
          'GoodBit marked',
        );
      } else {
        toastStore.success(`${range}, ${durationLabel(created.durationSec)}`, 'GoodBit marked');
      }

      return created;
    } catch (error) {
      console.error('Failed to mark a GoodBit:', error);
      toastStore.error((error as Error).message || 'Could not mark that range');
      return null;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Change a name, an edge, or both.
   *
   * Quiet on success. A rename shows its own result in the list the instant the
   * row comes back, and a toast saying a name was saved over a name that is
   * visibly saved is noise. A failure is not quiet, because the field would
   * otherwise keep showing something that is not stored.
   */
  async function edit(
    goodBit: GoodBit,
    patch: { name?: string | null; startSec?: number; endSec?: number },
  ): Promise<GoodBit | null> {
    if (saving.value) return null;
    saving.value = true;

    try {
      const updated = await updateGoodBit(clipId.value, goodBit.id, patch);
      const index = goodBits.value.findIndex((row) => row.id === updated.id);
      if (index === -1) goodBits.value.push(updated);
      else goodBits.value[index] = updated;
      sort();
      return updated;
    } catch (error) {
      console.error('Failed to change a GoodBit:', error);
      toastStore.error((error as Error).message || 'Could not save that change');
      // The caller is showing whatever it had; put the stored row back in front
      // of the user rather than leaving a field that lies.
      await load();
      return null;
    } finally {
      saving.value = false;
    }
  }

  /**
   * Remove the mark, once somebody has confirmed it.
   *
   * The confirmation names what is *not* happening. Every other destructive
   * thing in this app moves a file to the Recycle Bin or rewrites it in place,
   * so "delete" has meant "the video is going" up to now, and this is the first
   * delete where it does not.
   */
  function remove(goodBit: GoodBit): void {
    confirmAction(
      `Forget ${goodBitLabel(goodBit)}? The recording is not touched, only the mark on it.`,
      () => {
        void (async () => {
          saving.value = true;
          try {
            await deleteGoodBit(clipId.value, goodBit.id);
            goodBits.value = goodBits.value.filter((row) => row.id !== goodBit.id);
          } catch (error) {
            console.error('Failed to forget a GoodBit:', error);
            toastStore.error((error as Error).message || 'Could not forget that GoodBit');
          } finally {
            saving.value = false;
          }
        })();
      },
      'Forget this GoodBit',
    );
  }

  /**
   * Write a GoodBit out as a clip of its own, and watch the job that does it.
   *
   * **A new clip in the library; the source keeps its GoodBits.** That is the
   * answer to "what does publishing a GoodBit produce": a normal clip, on disk,
   * which every other surface already understands, rather than a second kind of
   * clip that only the publisher knows about.
   *
   * The job is the same machinery an export uses, polled through `pollJob`
   * rather than a second loop of its own, and the progress is reported into one
   * toast that is updated in place. Dismissing and raising another would slide
   * a card in and out every second the render runs.
   */
  async function render(goodBit: GoodBit): Promise<void> {
    if (renderingId.value !== null) {
      toastStore.warning('One GoodBit is already being written out. Wait for that one to finish.');
      return;
    }

    const name = goodBitLabel(goodBit);
    renderingId.value = goodBit.id;
    renderProgress.value = 0;
    renderEta.value = null;

    let toastId: string | null = null;

    try {
      const { jobId } = await renderGoodBit(clipId.value, goodBit.id);

      /*
       * Sticky, with a bar and a way out, the way a publish reports itself.
       *
       * A toast that fades after four seconds is right for "marked" and wrong
       * for "rendering, 12%": the render outlives it, and the progress is the
       * thing worth showing. `update` changes the card in place, because
       * dismissing one and raising another slides a card out and in every time
       * the number ticks.
       *
       * Raised after the POST rather than before it, because the card carries
       * the cancel and the cancel needs the job's id. The POST answers 202 off
       * one row lookup, so there is nothing to fill in the meantime.
       *
       * Cancelling only asks. ffmpeg is on the other side of the pipe and the
       * poll loop below sees the `cancelled` status and unwinds itself, which is
       * also what keeps a render the user stopped from being reported as one
       * that failed.
       */
      toastId = toastStore.show({
        title: `Rendering ${name}`,
        description: `Starting, ${durationLabel(goodBit.durationSec)} to write`,
        type: 'info',
        sticky: true,
        progress: 0,
        action: {
          label: 'Cancel',
          onClick: () => {
            void cancelJob(jobId).catch((error) => {
              console.error('Could not stop the render:', error);
              toastStore.error('Could not stop the render');
            });
          },
        },
      });

      // Captured, so the closure below does not have to narrow a `let` that
      // the compiler cannot prove stays a string.
      const card = toastId;

      const finished = await pollJob(jobId, {
        onProgress: (job) => {
          renderProgress.value = job.progress;
          renderEta.value = formatEta(job.etaSeconds);
          const left = renderEta.value ? `, about ${renderEta.value} left` : '';
          toastStore.update(card, {
            description: `${job.progress}%${left}`,
            progress: job.progress,
          });
        },
      });

      toastStore.dismiss(card);

      if (finished.status === 'cancelled') {
        toastStore.info(`${name} was not written out`);
        return;
      }

      if (finished.status === 'error') {
        throw new Error(finished.error || 'The render failed');
      }

      // A new file in the library, so the grid behind this is now out of date.
      clipsStore.resetPagination();
      await clipsStore.fetchClips(false);

      toastStore.success(
        `${finished.clip?.displayName || finished.clip?.filename || name} is in your library, beside the recording`,
        'GoodBit rendered',
      );
    } catch (error) {
      console.error('Failed to render a GoodBit:', error);
      // There may be no card yet: the POST itself can fail.
      if (toastId) toastStore.dismiss(toastId);
      toastStore.error((error as Error).message || 'Could not write that GoodBit out', 'Render failed');
    } finally {
      renderingId.value = null;
      renderProgress.value = 0;
      renderEta.value = null;
    }
  }

  return {
    goodBits,
    loading,
    saving,
    renderingId,
    renderProgress,
    renderEta,
    load,
    mark,
    edit,
    remove,
    render,
  };
}
