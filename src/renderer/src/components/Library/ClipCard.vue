<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useDragAndDrop } from '@renderer/composables/editor/useDragAndDrop';
import { beginOsDrag } from '@renderer/composables/clips/useOsDrag';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useClipActionsHandlers } from '@renderer/composables/clips/useClipActionsHandlers';
import { useHoverScrub, scrubBand } from '@renderer/composables/clips/useHoverScrub';
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

/** `M:SS`, for the chip on the picture. Empty when the scan has no length yet. */
const durationLabel = computed(() => {
  const seconds = props.clip.durationSec;
  if (!seconds || seconds <= 0) return '';
  const whole = Math.round(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
});

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
const scrubStripStyle = computed(() => {
  const band = scrubBand(previewEl.value?.clientHeight ?? 0);
  return { bottom: `${band.bottomPx}px`, height: `${band.heightPx}px` };
});

/**
 * How far through the preview is, from 0 to 1.
 *
 * Read once per animation frame while something is playing, not from
 * `timeupdate`. That event fires about four times a second at irregular
 * intervals, so a bar driven by it steps rather than moves, and a CSS
 * transition laid over the top only smears the steps into each other.
 *
 * The loop only runs while this card's preview is actually playing, and only
 * one preview plays at a time, so this is one frame callback for the window.
 */
const played = ref(0);
let frame: number | null = null;

function readPlayhead(): void {
  const video = videoEl.value;
  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    played.value = Math.min(1, video.currentTime / video.duration);
  }
}

function follow(): void {
  readPlayhead();
  frame = requestAnimationFrame(follow);
}

function startFollowing(): void {
  if (frame === null) frame = requestAnimationFrame(follow);
}

function stopFollowing(): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  // One last read, so a pause lands on the frame it paused at rather than
  // wherever the previous tick left the bar.
  readPlayhead();
}

/**
 * Scaled rather than resized.
 *
 * `width` is a layout property: changing it every frame makes the browser
 * reflow the card sixty times a second. A transform is handed to the
 * compositor and costs nothing.
 */
const fillStyle = computed(() => ({
  transform: `scaleX(${played.value})`,
}));

watch(isScrubbing, (scrubbing) => {
  if (scrubbing) {
    stopFollowing();
    played.value = scrubProgress.value;
  }
});

watch(scrubProgress, (fraction) => {
  if (isScrubbing.value) played.value = fraction;
});

watch(videoEl, (element, previous) => {
  if (previous) {
    previous.removeEventListener('play', startFollowing);
    previous.removeEventListener('playing', startFollowing);
    previous.removeEventListener('pause', stopFollowing);
    previous.removeEventListener('ended', stopFollowing);
    previous.removeEventListener('seeked', readPlayhead);
  }
  if (element) {
    element.addEventListener('play', startFollowing);
    element.addEventListener('playing', startFollowing);
    element.addEventListener('pause', stopFollowing);
    element.addEventListener('ended', stopFollowing);
    element.addEventListener('seeked', readPlayhead);
    if (!element.paused) startFollowing();
  }
});

onBeforeUnmount(() => {
  stopFollowing();
  const video = videoEl.value;
  if (!video) return;
  video.removeEventListener('play', startFollowing);
  video.removeEventListener('playing', startFollowing);
  video.removeEventListener('pause', stopFollowing);
  video.removeEventListener('ended', stopFollowing);
  video.removeEventListener('seeked', readPlayhead);
});

function handleDragStart(event: DragEvent) {
  startDrag({ type: 'clip', clipId: props.clip.id }, event);
}

/**
 * Drag the file itself out of the window, into Discord, Explorer, anything.
 *
 * Its own grip rather than the card body, because the card body already drags:
 * `handleDragStart` moves a clip into a collection, and `webContents.startDrag`
 * takes the drag over completely. One element cannot do both, so the two live
 * next to each other and the pointer says which is which.
 *
 * `preventDefault` first, then hand off. The web drag has to be cancelled or
 * the shell ends up running two at once and neither finishes; this is the shape
 * Electron documents.
 */
function handleDragOut(event: DragEvent) {
  event.preventDefault();
  beginOsDrag();
  window.goodbit?.dragOutClip(props.clip.id);
}

function handleCheckboxClick(event: MouseEvent) {
  event.stopPropagation();
  batchStore.toggleClip(props.clip.id, props.clipIndex);
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
    @dragstart="handleDragStart"
    @dragend="endDrag"
    @click="handleCardClick"
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
        How long it is, on the picture.

        The meta line under the card says it too, but that line is read once you
        are already looking at one card; this is read while scanning a grid of
        them, which is why the design puts it here as well.
      -->
      <span
        v-if="durationLabel"
        class="absolute left-2 bottom-2 z-10 rounded-sm bg-scrim px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-on-video pointer-events-none"
      >
        {{ durationLabel }}
      </span>

      <!--
        The card's three tools, in one group.

        They were in three places: the star top left, a drag grip beside it and
        the menu top right, each a bordered circle. The design has one group at
        the bottom right, flat squares on a scrim, fading in with the card's own
        hover. The published badge keeps the top right corner to itself, so
        nothing has to dodge anything.
      -->
      <div
        v-if="!isSelectionMode"
        class="absolute right-1.5 bottom-1.5 z-10 flex items-center gap-0.5"
      >
        <ClipStarButton :clip="clip" @updated="emit('updated', $event)" />

        <!--
          `.stop` on the dragstart matters. Without it the card's own dragstart
          runs too and the clip starts moving into a collection at the same
          time.
        -->
        <button
          draggable="true"
          type="button"
          title="Drag this clip into another program"
          aria-label="Drag this clip into another program"
          class="size-8 inline-flex items-center justify-center shrink-0 rounded-sm bg-scrim text-on-video hover:bg-scrim-strong opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 outline-none focus-visible:focus-ring transition-[opacity,background-color] duration-150 cursor-grab active:cursor-grabbing"
          @dragstart.stop="handleDragOut"
          @click.stop
        >
          <Icon icon="material-symbols:drag-pan" class="size-4 shrink-0 block" />
        </button>

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
      <div class="flex items-start justify-between gap-2 mb-1">
        <ClipNameInput :clip="clip" @updated="emit('updated', $event)" />
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
