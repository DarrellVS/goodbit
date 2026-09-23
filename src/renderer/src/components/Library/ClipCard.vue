<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { sharedCardHeight } from '@renderer/composables/media/useNearViewport';
import { Icon } from '@iconify/vue';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import { useDragAndDrop } from '@renderer/composables/editor/useDragAndDrop';
import { beginOsDrag } from '@renderer/composables/clips/useOsDrag';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useClipActionsHandlers } from '@renderer/composables/clips/useClipActionsHandlers';
import { useHoverScrub, scrubBand } from '@renderer/composables/clips/useHoverScrub';
import { usePreviewPlayhead } from '@renderer/composables/clips/usePreviewPlayhead';
import { useBatchOperationsStore } from '@renderer/stores/batchOperations';
import { useCollectionsStore } from '@renderer/stores/collections';
import { useToastStore } from '@renderer/stores/toast';
import { useGamesStore } from '@renderer/stores/games';
import { moveClipToGame } from '@renderer/services/clips';
import { clipGoodBitRanges } from '@renderer/utils/goodBits';
import { liveGoodBitRanges } from '@renderer/composables/clips/useGoodBits';
import type { Clip } from '@renderer/types/clip';
import ClipGoodBitPips from './ClipGoodBitPips.vue';
import ClipActionsMenu from './ClipActionsMenu.vue';
import ClipStarButton from './ClipStarButton.vue';
import ClipPublishedBadge from './ClipPublishedBadge.vue';
import ClipExportBadge from '@renderer/components/Library/ClipExportBadge.vue';
import ClipSuggestedBadge from './ClipSuggestedBadge.vue';
import ClipNameInput from './ClipNameInput.vue';
import ClipMetadata from './ClipMetadata.vue';
import ClipTags from './ClipTags.vue';
import MoveClipDialog from './MoveClipDialog.vue';

interface Props {
  clip: Clip;
  clipIndex: number;
  posterUrl: string;
  videoUrl: string;
  collectionId?: number;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
  (e: 'is-hovered', isHovered: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
  isSelectionMode: false,
});

const emit = defineEmits<Emits>();

const config = useConfiguration();
const batchStore = useBatchOperationsStore();
const collectionsStore = useCollectionsStore();
const toastStore = useToastStore();
const gamesStore = useGamesStore();

/**
 * The game's own name where it has been given one, the folder's otherwise.
 *
 * The card drew `clip.game` raw, so a game renamed in the sidebar kept its
 * folder name on every tile: `Headliners-Win64-Shipping` under a clip and
 * `Headliners` beside it in the games list.
 */
const gameDisplayName = computed(() => {
  const known = gamesStore.items.find((g) => g.game === props.clip.game);
  return known?.displayName || props.clip.game;
});
const { startDrag, endDrag } = useDragAndDrop();
const { open: openClip } = useClipDetail();

const isSelected = computed(() => batchStore.isSelected(props.clip.id));
const showMoveDialog = ref(false);

/**
 * The GoodBits on this clip, if the row it came with carries any.
 *
 * The row carries them: the list routes attach every clip's ranges with one
 * query for the page, rather than this asking per card. Fifty requests on the
 * first page and more on every scroll is the thing not to do, and it is the
 * lesson the thumbnails already taught.
 *
 * **The live list wins when there is one.** A card holds whatever the list
 * query gave it, which goes stale the moment a GoodBit is marked in the panel
 * over the top: the row was fetched before the mark existed, and closing the
 * panel does not refetch the library. So if this clip's GoodBits have actually
 * been read, by the panel or the trimmer, the card follows that list and
 * updates as it changes. Otherwise it draws what it was handed, which is right
 * for the hundreds of clips nobody has opened.
 */
const goodBitRanges = computed(
  () => liveGoodBitRanges(props.clip.id) ?? clipGoodBitRanges(props.clip),
);

const videoEl = ref<HTMLVideoElement | null>(null);
const hoverScrubEnabled = computed(() => config.public.value.hoverScrub);
const {
  isScrubbing,
  scrubProgress,
  scrubTime,
  formatTime,
  handleMouseMove,
  handleMouseLeave,
} = useHoverScrub(videoEl, hoverScrubEnabled);

// Keep the time label from hanging off either edge of the card.
const scrubLabelLeft = computed(() => `${Math.min(92, Math.max(8, scrubProgress.value * 100))}%`);

/**
 * The strip is drawn exactly where the pointer scrubs: above the native
 * controls, never over them. Measured when scrubbing starts, since the card's
 * height is whatever the grid gave it.
 */
const previewEl = ref<HTMLElement | null>(null);

/**
 * The card's own box, measured so that an empty slot can stand in for it.
 *
 * `ClipCardSlot` only mounts this component while the clip is near the window,
 * and the slot it leaves behind has to be exactly as tall or the scrollbar
 * moves under the pointer. Every card in a view is the same height by
 * construction, so whichever ones are rendered keep the shared number honest.
 */
const cardEl = ref<HTMLElement | null>(null);
const cardHeight = sharedCardHeight();

onMounted(() => {
  const height = cardEl.value?.offsetHeight ?? 0;
  if (height > 0 && Math.abs(height - cardHeight.value) > 1) cardHeight.value = height;
});
const scrubStripStyle = computed(() => {
  const band = scrubBand(previewEl.value?.clientHeight ?? 0);
  return { bottom: `${band.bottomPx}px`, height: `${band.heightPx}px` };
});

// Where the preview has got to, shared with every tile that previews a clip.
const { fillStyle } = usePreviewPlayhead(videoEl, { isScrubbing, scrubProgress });

/**
 * Drag the file itself out of the window, into Discord, Explorer, anything.
 *
 * **Behind the grip, and not on the card body, because the two drags cannot
 * share one element.** `webContents.startDrag` takes the drag over completely:
 * it cancels the web drag and runs a nested message loop in the shell, so an
 * element that hands a file to the shell cannot also be an HTML5 drag source.
 *
 * The whole card was the file source for a while, on the argument that
 * dragging a clip out is what people reach for without being told. So is
 * dropping one on a collection, and that one the app promises in writing: an
 * empty collection says "Drag and drop clips from your library to add them
 * here". The card body is the clip, the collection tile is the shelf, and the
 * gesture between them was doing nothing. The grip is the odd one out, so the
 * grip is what gets a handle to find.
 *
 * `preventDefault` first, then hand off. The web drag has to be cancelled or
 * the shell ends up running two at once and neither finishes; this is the
 * shape Electron documents. `.stop` on the grip's own `dragstart` keeps the
 * card's from firing as well, or the clip would head for a collection at the
 * same time.
 */
function handleDragOut(event: DragEvent) {
  event.preventDefault();
  beginOsDrag();
  window.goodbit?.dragOutClip(props.clip.id);
}

/**
 * Drag this clip onto a collection tile, which is how clips get into one.
 *
 * Nothing but the clip's id travels: the tile hands it to
 * `useCollectionManagement`, which is where the shared drag state is read. The
 * `text/plain` payload is there so the drag has a type at all; nothing reads
 * it back.
 */
function handleCardDragStart(event: DragEvent) {
  startDrag({ type: 'clip', clipId: props.clip.id }, event);
}

function handleCheckboxClick(event: MouseEvent) {
  event.stopPropagation();
  batchStore.toggleClip(props.clip.id, props.clipIndex);
}

/**
 * Right click goes straight to the trimmer.
 *
 * Left click opens the clip, which is the thing to do with most of them, and
 * the one thing anybody does to a clip they have opened is cut it. The menu
 * behind the card's own dots still gets there; this is the shortcut for
 * somebody working through a session's worth of clips.
 *
 * `open(id, 'trim')` rather than a route, so the library underneath stays
 * mounted, and so backing out of the trimmer lands on the library rather than
 * on a details panel that was never opened.
 *
 * `preventDefault` is called here rather than with a `.prevent` modifier,
 * because a text field inside the card has a context menu worth more than this
 * one: copy and paste beat a shortcut in a box somebody is typing a name into.
 */
function handleCardContextMenu(event: MouseEvent) {
  if (props.isSelectionMode) return;

  const target = event.target as HTMLElement;
  if (target.closest('input') || target.closest('textarea')) return;

  event.preventDefault();
  openClip(props.clip.id, 'trim');
}

function handleCardClick(event: MouseEvent) {
  // The star, the menu, the name field and the tag editor each handle their own
  // click. Everything else on the card belongs to the card, including the
  // picture: it used to be excluded because the thumbnail is a `<video>`, so
  // clicking the most obvious part of a clip played a muted preview in a 270
  // pixel box instead of opening it. Every tester hit that.
  const target = event.target as HTMLElement;
  if (target.closest('button') || target.closest('input') || target.closest('a')) return;

  // In selection mode the whole card is the checkbox. Only a 32 pixel corner
  // square used to be live, which is about two percent of the card, and all
  // three testers concluded multi-select was broken.
  if (props.isSelectionMode) {
    batchStore.toggleClip(props.clip.id, props.clipIndex);
    return;
  }

  // A layer over the library, not a page instead of it. Nothing is torn down,
  // so there is no scroll position to save and restore.
  openClip(props.clip.id);
}
</script>

<template>
  <article
    ref="cardEl"
    draggable="true"
    :class="[
      'clip-card group relative rounded-md cursor-pointer outline-none',
      // Selection is an outline, which is painted outside the box and costs
      // no layout. It was a border going from 1px to 2px plus a ring, so
      // selecting a clip moved it and everything beside it by a pixel.
      isSelected ? 'outline-2 outline-accent outline-offset-2' : '',
    ]"
    @mouseenter="emit('is-hovered', true)"
    @mouseleave="emit('is-hovered', false)"
    @dragstart="handleCardDragStart"
    @dragend="endDrag"
    @click="handleCardClick"
    @contextmenu="handleCardContextMenu"
  >
    <!-- Selection Checkbox -->
    <div
      v-if="isSelectionMode"
      class="absolute top-3 left-3 z-20"
    >
      <button
        :aria-label="isSelected ? `Deselect ${clip.displayName ?? clip.filename}` : `Select ${clip.displayName ?? clip.filename}`"
        :aria-pressed="isSelected"
        :title="isSelected ? 'Selected. Click the clip to deselect it.' : 'Click anywhere on the clip to select it.'"
        class="w-8 h-8 rounded-lg flex items-center justify-center checkbox-animate"
        :class="[
          isSelected
            ? 'bg-accent text-on-video hover:bg-accent-hover'
            : 'bg-video-bed/60 backdrop-blur-sm border border-on-video/20 text-on-video hover:bg-video-bed/80'
        ]"
        @click="handleCheckboxClick"
      >
        <Icon
          :icon="isSelected ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'"
          class="size-5 shrink-0 block"
        />
      </button>
    </div>

    <ClipPublishedBadge :published="clip.published" />

    <!--
      The top left corner, as one column rather than two badges each claiming
      it. A clip can be an export that the sweep also found something in, and
      two absolutely positioned chips in one corner is how they end up on top
      of each other.
    -->
    <div class="absolute top-2 left-2 z-10 flex flex-col items-start gap-1">
      <ClipExportBadge :is-export="clip.isExport" />
      <ClipSuggestedBadge :count="clip.suggestedCount" />
    </div>

    <div
      ref="previewEl"
      class="aspect-21/9 bg-video-bed relative rounded-t-md overflow-hidden"
      @mousemove="handleMouseMove"
      @mouseleave="handleMouseLeave"
    >
      <!--
        Sound follows the playback setting, as it should.

        It was forced silent for a while, which fixed the wrong thing: previews
        were starting because the list re-drew under a stationary pointer, not
        because the setting allowed sound. `useClipHover` now waits for the
        pointer to actually move, so a hover is a hover.

        No `controls` here, and the element takes no clicks of its own.

        The browser's own play, mute, fullscreen and overflow buttons were
        painted onto every tile, competing with the app's star and menu twenty
        pixels away, and swallowing the click that should open the clip. Preview
        on this screen is hover: scrubbing and autoplay are both settings, and
        the scrub strip below draws the position. Watching properly happens on
        the clip's own page, which is where a click now goes.
      -->
      <video
        :id="`preview-video-${clip.id}`"
        ref="videoEl"
        :src="videoUrl"
        :poster="posterUrl"
        :muted="config.public.value.muteVideosByDefault"
        class="w-full h-full m-0 p-0 object-cover pointer-events-none"
        preload="none"
      />

      <!-- Scrub strip indicator, sitting above the native controls rather than
           over them. pointer-events-none so whatever is underneath stays
           clickable. -->
      <div
        v-if="isScrubbing"
        class="absolute inset-x-0 pointer-events-none z-10"
        :style="scrubStripStyle"
      >
        <div class="absolute inset-0 bg-linear-to-t from-video-bed/50 to-transparent"></div>
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-accent"
          :style="{ left: `${scrubProgress * 100}%` }"
        ></div>
        <div
          class="absolute top-1 px-1.5 py-0.5 rounded-sm bg-video-bed/80 text-on-video text-[10px] font-mono -translate-x-1/2 whitespace-nowrap"
          :style="{ left: scrubLabelLeft }"
        >
          {{ formatTime(scrubTime) }}
        </div>
      </div>

      <!--
        The bits of this clip somebody marked, over the bottom of the picture.

        Hidden while scrubbing, because the scrub strip draws its own band in
        the same place and two overlapping readouts of position is neither.
        See `ClipGoodBitPips` for what trying this on a card actually showed.
      -->
      <ClipGoodBitPips
        v-if="!isScrubbing"
        :ranges="goodBitRanges"
        :duration-sec="clip.durationSec"
      />

      <!--
        The length used to be printed here as well, over the picture.

        It is in the meta line under the card, next to the game, and the
        argument for saying it twice was that the line under a card is read
        once you are already looking at one while the chip is read while
        scanning. On a grid of 21:9 thumbnails that turned out to be one label
        too many: the same number, four lines apart.
      -->
    </div>

    <!--
      Where the preview has got to, drawn as the video's own bottom edge.

      A line rather than a control: it sits flush under the picture with no gap,
      two pixels tall, and takes no clicks. Scrubbing and playing both move it,
      so a tile always shows where it is without adding anything to look at.
    -->
    <!--
      Flush under the picture, and rounded on the bottom rather than the top.

      The thumbnail was rounded on all four corners with this line sitting
      squarely beneath it, so the page showed through two notches where the
      curves left off. The picture rounds its top corners, this rounds its
      bottom ones, and together they are one shape.
    -->
    <div class="h-0.5 rounded-b-md bg-border/40 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        class="h-full w-full bg-accent origin-left will-change-transform"
        :style="fillStyle"
      ></div>
    </div>

    <div :class="config.public.value.compactMode ? 'pt-2' : 'pt-3'">
      <!--
        The name, and the two tools on the right of it.

        They have been in three places now. Over the picture's bottom right,
        where a 21:9 thumbnail ends a third of the way up the card, so they sat
        in the middle of it. Then the card's own bottom right, absolutely
        positioned over the tag row. Now in flow, in the row that already had
        `justify-between` and one child in it, which is where a name and its
        actions belong: nothing overlaps, nothing has to dodge, and the group
        keeps a fixed column whatever the name does.
      -->
      <div class="flex items-start justify-between gap-2 mb-1">
        <ClipNameInput :clip="clip" @updated="emit('updated', $event)" />

        <div v-if="!isSelectionMode" class="flex items-center gap-0.5 shrink-0 -mt-1 -mr-1">
          <!--
            The file, out of the window. Its space is reserved at rest and only
            its opacity moves, like the menu beside it, because nothing on this
            card changes size on hover.

            `draggable` and `dragstart` of its own, with `.stop`: the card is
            already an HTML5 drag source aimed at the collections above the
            grid, and `webContents.startDrag` cannot share an element with one.
          -->
          <BaseButton
            tone="quiet"
            size="dense"
            icon-only
            class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-[opacity,color,background-color] cursor-grab active:cursor-grabbing"
            draggable="true"
            title="Drag the file out, into Discord or a folder"
            aria-label="Drag the file out of GoodBit"
            @click.stop
            @dragstart.stop="handleDragOut"
          >
            <Icon icon="material-symbols:drag-indicator" class="size-4 shrink-0 block" />
          </BaseButton>

          <ClipStarButton :clip="clip" @updated="emit('updated', $event)" />

          <div class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
            <ClipActionsMenu
              :clip="clip"
              :collection-id="collectionId"
              @updated="emit('updated', $event)"
              @deleted="emit('deleted')"
            />
          </div>
        </div>
      </div>

      <ClipMetadata
        :size-bytes="clip.sizeBytes"
        :duration-sec="clip.durationSec"
        :game="gameDisplayName"
        :recorded-at="clip.recordedAt ?? clip.fileModifiedAt ?? clip.createdAt"
      />

      <ClipTags :clip="clip" @updated="emit('updated', $event)" />
    </div>
  </article>
</template>
