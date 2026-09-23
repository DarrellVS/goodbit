<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { useToastStore } from '@renderer/stores/toast';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useClipLoader } from '@renderer/composables/library/useClipLoader';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { publishClip, recordClipOpened } from '@renderer/services/clips';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import { forgetFrameStrip } from '@renderer/utils/mediaUrl';
import type { GoodBit } from '@renderer/types/goodbit';
import ClipNameInput from '@renderer/components/Library/ClipNameInput.vue';
import ClipTags from '@renderer/components/Library/ClipTags.vue';
import ClipCollections from '@renderer/components/Library/ClipCollections.vue';
import ClipVideoPlayer from './ClipVideoPlayer.vue';
import ClipActionsCard from './ClipActionsCard.vue';
import ClipFacts from './ClipFacts.vue';
import TrimPanel from '@renderer/components/Trim/TrimPanel.vue';
import ClipGoodBitsSection from './ClipGoodBitsSection.vue';
import ClipNotesSection from './ClipNotesSection.vue';
import ShareSheet from '@renderer/components/Publish/ShareSheet.vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import BasePager from '@renderer/components/Base/BasePager.vue';
import { useClipNeighbours } from '@renderer/composables/clips/useClipNeighbours';

/**
 * A clip, looked at closely, without leaving the library.
 *
 * This was a page. Opening a clip meant a navigation, which tore down the
 * grid, the filters and the sidebar and rebuilt them on the way back, and the
 * scroll position had to be saved and restored by hand to hide it. Looking at
 * a clip is not going somewhere else; it is a closer look at something you are
 * still in the middle of browsing. So the library stays where it is,
 * underneath.
 *
 * ## What goes where
 *
 * Ordered by what a person actually came for, not by what is easy to lay out.
 *
 * - **The picture is the point**, so the player takes the whole left column
 *   and as much height as the window allows.
 * - **The things that change the clip** sit top right, where the eye lands
 *   after the video: trim, editor, share, star.
 * - **Tags and collections** are next, because they are the two things you
 *   come back to a clip to add.
 * - **Notes** sit under the player, at the player's width. A one line empty
 *   state spanning a 21:9 window is not a design.
 * - **File name, size, resolution, frame rate** are a quiet block at the foot
 *   of that column. They were two cards with coloured icons and headings, level
 *   with the video, which gave real weight to the one thing nobody opens a clip
 *   to find out. Still there, and now they read as a footnote.
 */
const { openClipId, view, close, show, back, open, countsAsOpen } = useClipDetail();
const toastStore = useToastStore();
const collectionsStore = useCollectionsStore();

const showExactDate = ref(false);
const showShareSheet = ref(false);
const videoPlayerRef = ref<InstanceType<typeof ClipVideoPlayer> | null>(null);

/**
 * Moving to the clip beside this one, which is the one thing the modal could
 * not do. `open` rather than assigning the id, so the view resets to the
 * details panel: stepping to the next clip from inside the trimmer and landing
 * in the trimmer on a clip you have not looked at would be a trap.
 */
const neighbours = useClipNeighbours(openClipId, (id) => open(id, 'details'));

const clipId = computed(() => openClipId.value ?? 0);
const { clip, metadata, loading, error, loadClip, handleClipUpdated } = useClipLoader(clipId);

const isOpen = computed({
  get: () => openClipId.value !== null,
  set: (value: boolean) => {
    if (!value) close();
  },
});

/*
 * Loaded when the id changes, including the first time it is set.
 *
 * The modal is mounted for the life of the app rather than created on demand,
 * so there is no `onMounted` to hang this on, and opening a second clip while
 * the first is still showing has to reload rather than reuse.
 */
watch(
  openClipId,
  (id) => {
    if (id === null) return;
    void loadClip();
    void collectionsStore.fetchCollections();

    /*
     * Write down that somebody opened this clip to watch it.
     *
     * Fire and forget, because nothing reads `lastOpenedAt` or `openCount` yet
     * and a failure costs the user nothing: a clip deleted in another window
     * answers 404 and there is no reason for this panel to say anything about
     * it. What it cannot do is wait, because the numbers cannot be backfilled.
     * The retention screen in a later release wants to say "190 of these have
     * never been opened", and every day it is not recorded is a day that screen
     * can never describe.
     *
     * Here rather than anywhere finer grained: this watcher fires once per
     * open, where a Range request fires several times a second.
     */
    // Not when Storage Saver opened it: see `countsAsOpen`.
    if (countsAsOpen.value) {
      void recordClipOpened(id).catch((error) => {
        console.debug('Could not record that this clip was opened:', error);
      });
    }

    // A clip opened after another should not inherit the last one's expanded
    // date or a half-open sheet.
    showExactDate.value = false;
    showShareSheet.value = false;
  },
  { immediate: true },
);

/**
 * The clip's permanent public address, or nothing.
 *
 * Media is served by the `goodbit://` protocol, which only this app can
 * resolve, so putting that in a QR code produced a camera saying no app can
 * use it. An unpublished clip has no permanent address, and the sheet offers
 * to serve it on the local network instead.
 */
const shareUrl = computed(() =>
  clip.value?.published && clip.value.publishedUrl ? clip.value.publishedUrl : null,
);

/**
 * When it was recorded, and only that.
 *
 * `ClipNameInput` already prints the game under the name, so putting it here
 * too gave the header two grey lines both saying Battlefield 6.
 */
const subtitle = computed(() =>
  clip.value ? formatRelativeTime(clip.value.recordedAt ?? clip.value.fileModifiedAt) : '',
);

/** Publishing from the share sheet, so the code it was after can appear. */
async function publishFromShare(compressed: boolean | undefined): Promise<void> {
  if (!clip.value) return;
  try {
    handleClipUpdated(await publishClip(clip.value.id, { compress: compressed }));
    toastStore.success(
      compressed === true
        ? 'Compressed copy published. The link is ready'
        : 'Published. The link is ready',
    );
  } catch (cause) {
    toastStore.error((cause as Error).message || 'Could not publish this clip');
  }
}

/**
 * A chip in a note was pressed, so the player goes there.
 *
 * **The player moving is the feedback.** This used to raise a toast reading
 * `Jumped to 4s`, over a picture that had visibly just jumped to 4s, and call
 * `scrollIntoView` on a video that is inside a panel pinned to the whole
 * window: nothing to scroll, and a smooth scroll of the note away from under
 * the cursor if there had been.
 */
function handleTimestampClick(seconds: number): void {
  const videoEl = videoPlayerRef.value?.videoElement;
  if (!videoEl) return;

  videoEl.currentTime = seconds;
  void videoEl.play();
}

/**
 * Play one GoodBit and stop at the end of it.
 *
 * A GoodBit is a range, so playing one has to end somewhere: seeking and
 * playing would run on into the rest of the recording and the range would be
 * the only thing about it nobody could hear. It plays once and stops rather
 * than looping, which is what the trimmer does: there the loop is how a cut is
 * judged, here it is somebody watching the thing they marked.
 *
 * The stop is a `timeupdate` listener that removes itself. That event only
 * fires about four times a second, so the pause can land up to a quarter of a
 * second late; a `setTimeout` on the length would be exact if playback were,
 * and it is not (a seek takes a moment, and the range is from the container's
 * timeline). Late by a frame or two beats stopping before the payoff.
 */
let stopAtEnd: (() => void) | null = null;

function playGoodBit(goodBit: GoodBit): void {
  const videoEl = videoPlayerRef.value?.videoElement;
  if (!videoEl) return;

  // A second press while the first range is still playing replaces it rather
  // than stacking two listeners that both want to pause.
  stopAtEnd?.();

  const halt = (): void => {
    if (videoEl.currentTime < goodBit.endSec) return;
    videoEl.pause();
    stopAtEnd?.();
  };

  stopAtEnd = () => {
    videoEl.removeEventListener('timeupdate', halt);
    stopAtEnd = null;
  };

  videoEl.addEventListener('timeupdate', halt);
  videoEl.currentTime = goodBit.startSec;
  void videoEl.play();
}

/**
 * Where the player is now, for the note's *insert the playhead* button.
 *
 * A function rather than a number, so the position is read at the press
 * instead of being pushed through a prop several times a second while a clip
 * plays. Named here rather than written inline in the template so the prop is
 * the same function on every render.
 */
function playheadSeconds(): number | null {
  const videoEl = videoPlayerRef.value?.videoElement;
  return videoEl ? videoEl.currentTime : null;
}

/**
 * A deleted clip has nothing left to show, and the library behind has already
 * been told. Closing is the whole of it; there is no page to navigate away
 * from any more.
 */
function handleClipDeleted(): void {
  close();
}

/**
 * The cut rewrote the file, so the details behind it are stale: a new length, a
 * new size, a new frame strip. Re-read before showing them again.
 */
async function onTrimmed(): Promise<void> {
  // The cut rewrote the file, so the strip that was warmed is of a clip that no
  // longer exists at that length.
  if (openClipId.value) forgetFrameStrip(openClipId.value);
  await loadClip();
  show('details');
}
</script>

<template>
  <DialogRoot v-model:open="isOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim-modal z-50 modal-overlay-animate" />
      <!--
        `:key` is what makes this two modals rather than one that changes its
        mind: Vue sees a different element, so the old panel runs its leave and
        the new one runs its enter. `mode="out-in"` keeps them from overlapping,
        and `appear` means opening the layer uses the same animation as swapping
        within it, rather than a second one that has to be kept in step.
      -->
      <Transition name="clip-modal" mode="out-in" appear>
        <DialogContent
          :key="view"
          class="fixed inset-8 z-50 bg-card rounded-lg shadow-pop border border-border flex flex-col outline-hidden overflow-hidden"
          @open-auto-focus="(event: Event) => event.preventDefault()"
        >
        <!--
          The header is the clip's identity and the way out, and nothing else.
          The name is editable in place, which is where anybody would try to
          rename it first.
        -->
        <header class="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <!--
            Back out of the trimmer without closing the clip. Trimming is a face
            of this layer, so leaving it lands on the other face rather than on
            the library.
          -->
          <button
            v-if="view === 'trim'"
            class="size-9 inline-flex items-center justify-center shrink-0 rounded-md text-muted-500 hover:text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            aria-label="Back to the clip"
            title="Back to the clip"
            @click="back"
          >
            <Icon icon="material-symbols:arrow-back-rounded" class="size-5 shrink-0 block" />
          </button>

          <div class="min-w-0 flex-1">
            <DialogTitle as="div" class="min-w-0">
              <ClipNameInput v-if="clip" large :clip="clip" @updated="clip = $event" />
              <span v-else class="text-lg font-semibold text-foreground">Clip</span>
            </DialogTitle>
            <DialogDescription class="text-sm text-muted-500 mt-0.5 truncate">
              {{ view === 'trim' ? 'Drag the handles to keep the good bit' : subtitle || 'Loading' }}
            </DialogDescription>
          </div>

          <!--
            Where you are in the run, and how to move along it.

            Section 5.7 of the design contract, and the only thing added to the
            app by this release. The audit found no way to move between clips:
            you close, find the next tile and open it again, which is three
            actions for the most common thing anybody does with a library.
            Hidden when there is nothing to page through, because `1 of 1` is
            a control that can only be pressed to no effect.
          -->
          <BasePager
            v-if="view === 'details' && neighbours.total.value > 1"
            class="shrink-0"
            :position="neighbours.position.value"
            :total="neighbours.total.value"
            :has-previous="neighbours.hasPrevious.value"
            :has-next="neighbours.hasNext.value"
            @previous="neighbours.previous"
            @next="neighbours.next"
          />

          <button
            class="size-9 inline-flex items-center justify-center shrink-0 rounded-md text-muted-500 hover:text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            aria-label="Close"
            title="Close (Esc)"
            @click="close"
          >
            <Icon icon="material-symbols:close-rounded" class="size-5 shrink-0 block" />
          </button>
        </header>

        <div v-if="loading" class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-3">
            <BaseSpinner class="size-8 block mx-auto text-muted-400" />
            <p class="text-sm text-muted-500">Loading clip…</p>
          </div>
        </div>

        <div v-else-if="error || !clip" class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-3 max-w-md px-6">
            <Icon icon="material-symbols:error-outline" class="size-8 block mx-auto text-danger-ink" />
            <h2 class="font-display text-lg font-medium text-foreground">Clip not found</h2>
            <p class="text-sm text-muted-500">
              {{ error || 'This clip does not exist any more.' }}
            </p>
            <button
              type="button"
              class="h-9 px-3.5 rounded-md bg-accent text-accent-fg hover:bg-accent-hover inline-flex items-center justify-center text-sm font-medium outline-none focus-visible:focus-ring transition-colors duration-150"
              @click="close"
            >
              Close
            </button>
          </div>
        </div>

        <!--
          No transition here. The panel around this is keyed on the view and
          animates as a whole, so animating the contents too would play the same
          change twice at different speeds.
        -->
        <TrimPanel
          v-else-if="view === 'trim'"
          :id="String(clip.id)"
          :clip="clip"
          :metadata="metadata"
          class="flex-1 min-h-0"
          @saved="onTrimmed"
          @deleted="handleClipDeleted"
        />

        <div v-else class="flex-1 min-h-0 overflow-y-auto scroll-p-1.5">
            <div class="p-6 space-y-6">
            <!--
              Two columns, and the split is deliberate: the video is the reason
              this is open, so it gets two thirds and all the height it can
              take, while the column beside it holds only things you act on.
            -->
            <div
              class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_336px] gap-6 items-start"
            >
              <!--
                The actions column is a fixed width, not a third of the window.
                A third gave four buttons and two mostly empty cards the same
                room as the video, on a screen wide enough for both, and these
                recordings are 21:9, so every pixel the column does not need is
                height the picture gets back.
              -->
              <div class="min-w-0 space-y-6">
                <ClipVideoPlayer ref="videoPlayerRef" :clip="clip" />

                <!--
                  The marks and the writing, beside each other.

                  Both are short and both are usually empty, so stacked they
                  were two one-line empty states with a hairline between them,
                  taking the full width of a 21:9 picture each and pushing the
                  second one below the fold on a laptop. They are also the same
                  kind of thing, which is the other half of the argument: what
                  you noticed about this clip, once as a range and once as a
                  sentence.
                -->
                <!--
                  Side by side only when there is room for both.

                  `lg` is 1024px of *window*, and what matters is the width of
                  this column: the picture column loses 336px to the actions
                  column beside it and 48px to the modal's own padding, so at
                  `lg` each of these two gets about 300px, which is narrower
                  than the notes toolbar. `xl` is where the split is an
                  improvement rather than a squeeze.
                -->
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-6 items-start">
                  <ClipGoodBitsSection :clip="clip" @play="playGoodBit" />

                  <ClipNotesSection
                    :clip="clip"
                    :playhead="playheadSeconds"
                    @updated="handleClipUpdated"
                    @timestamp-click="handleTimestampClick"
                  />
                </div>
              </div>

              <div class="space-y-4">
                <ClipActionsCard
                  :clip="clip"
                  @updated="handleClipUpdated"
                  @deleted="handleClipDeleted"
                  @share="showShareSheet = true"
                />

                <!--
                  Sections divided by a hairline, not four bordered cards of
                  equal weight stacked in a column. A box around each one said
                  all four were the same size of decision, when the list above
                  them replaces your recording and these two write a label.
                -->
                <section class="border-t border-border pt-4">
                  <h2 class="text-sm font-medium text-muted-600 mb-2">Tags</h2>
                  <ClipTags :clip="clip" prominent @updated="clip = $event" />
                </section>

                <section class="border-t border-border pt-4">
                  <h2 class="text-sm font-medium text-muted-600 mb-2">Collections</h2>
                  <ClipCollections :clip="clip" />
                </section>

                <!--
                  Everything nobody opened a clip to find out, at the bottom of
                  the column and deliberately quiet.
                -->
                <ClipFacts
                  :clip="clip"
                  :metadata="metadata"
                  :show-exact-date="showExactDate"
                  @toggle-date="showExactDate = !showExactDate"
                />
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Transition>
    </DialogPortal>
  </DialogRoot>

  <ShareSheet
    v-if="clip"
    v-model:open="showShareSheet"
    :clip-id="clip.id"
    :url="shareUrl"
    :title="clip.displayName || clip.filename"
    @publish="publishFromShare"
  />
</template>
