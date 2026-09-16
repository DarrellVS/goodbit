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
import { useToastStore } from '../../stores/toast';
import { useCollectionsStore } from '../../stores/collections';
import { useClipLoader } from '../../composables/useClipLoader';
import { useClipDetail } from '../../composables/useClipDetail';
import { publishClip } from '../../services/clips';
import { formatRelativeTime } from '../../helpers/dateFormat';
import { forgetFrameStrip } from '../../utils/mediaUrl';
import ClipNameInput from '../App/ClipNameInput.vue';
import ClipTags from '../App/ClipTags.vue';
import ClipCollections from '../App/ClipCollections.vue';
import ClipVideoPlayer from './ClipVideoPlayer.vue';
import ClipActionsCard from './ClipActionsCard.vue';
import ClipFacts from './ClipFacts.vue';
import TrimPanel from '../Trim/TrimPanel.vue';
import ClipNotesSection from './ClipNotesSection.vue';
import ShareSheet from '../App/ShareSheet.vue';
import AppLoading from '../App/AppLoading.vue';

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
const { openClipId, view, close, show, back } = useClipDetail();
const toastStore = useToastStore();
const collectionsStore = useCollectionsStore();

const showExactDate = ref(false);
const showShareSheet = ref(false);
const videoPlayerRef = ref<InstanceType<typeof ClipVideoPlayer> | null>(null);

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
      <DialogOverlay class="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm modal-overlay-animate" />
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
          class="fixed inset-8 z-50 bg-card rounded-2xl shadow-2xl border border-border flex flex-col outline-none overflow-hidden"
          @open-auto-focus="(event: Event) => event.preventDefault()"
        >
        <!--
          The header is the clip's identity and the way out, and nothing else.
          The name is editable in place, which is where anybody would try to
          rename it first.
        -->
        <header class="flex items-start gap-4 px-6 py-4 border-b border-border flex-shrink-0">
          <!--
            Back out of the trimmer without closing the clip. Trimming is a face
            of this layer, so leaving it lands on the other face rather than on
            the library.
          -->
          <button
            v-if="view === 'trim'"
            class="flex-shrink-0 w-9 h-9 mt-1 rounded-lg flex items-center justify-center text-muted-500 hover:text-foreground hover:bg-muted-50 transition-colors"
            aria-label="Back to the clip"
            title="Back to the clip"
            @click="back"
          >
            <Icon icon="material-symbols:arrow-back-rounded" class="text-xl" />
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

          <button
            class="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-muted-500 hover:text-foreground hover:bg-muted-50 transition-colors"
            aria-label="Close"
            title="Close (Esc)"
            @click="close"
          >
            <Icon icon="material-symbols:close-rounded" class="text-xl" />
          </button>
        </header>

        <div v-if="loading" class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-3">
            <AppLoading
              class="text-5xl text-orange-500" />
            <p class="text-muted-600">Loading clip…</p>
          </div>
        </div>

        <div v-else-if="error || !clip" class="flex-1 flex items-center justify-center">
          <div class="text-center space-y-3 max-w-md px-6">
            <Icon icon="material-symbols:error-outline" class="text-5xl text-red-500" />
            <h2 class="text-xl font-bold text-foreground">Clip not found</h2>
            <p class="text-muted-600">
              {{ error || 'This clip does not exist any more.' }}
            </p>
            <button
              class="px-5 py-2.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
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
        />

        <div v-else class="flex-1 min-h-0 overflow-y-auto">
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
                  Under the picture, at the picture's width. Spanning the whole
                  modal made a one line empty state two thousand pixels wide on
                  an ultrawide screen, and left the column beside it ending in
                  dead space.
                -->
                <ClipNotesSection
                  :clip="clip"
                  :playhead="playheadSeconds"
                  @updated="handleClipUpdated"
                  @timestamp-click="handleTimestampClick"
                />
              </div>

              <div class="space-y-4">
                <ClipActionsCard
                  :clip="clip"
                  @updated="handleClipUpdated"
                  @deleted="handleClipDeleted"
                  @share="showShareSheet = true"
                />

                <div class="bg-background/40 rounded-2xl p-5 border border-border">
                  <div class="flex items-center gap-2 mb-3">
                    <Icon icon="material-symbols:label-rounded" class="text-lg text-orange-500" />
                    <h2 class="font-semibold text-foreground">Tags</h2>
                  </div>
                  <ClipTags :clip="clip" @updated="clip = $event" />
                </div>

                <div class="bg-background/40 rounded-2xl p-5 border border-border">
                  <div class="flex items-center gap-2 mb-3">
                    <Icon
                      icon="material-symbols:folder-special-rounded"
                      class="text-lg text-purple-500"
                    />
                    <h2 class="font-semibold text-foreground">Collections</h2>
                  </div>
                  <ClipCollections :clip="clip" />
                </div>

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
