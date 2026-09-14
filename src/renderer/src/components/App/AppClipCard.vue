<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useDragAndDrop } from '../../composables/useDragAndDrop';
import { useConfiguration } from '../../composables/useConfiguration';
import { useClipActionsHandlers } from '../../composables/useClipActionsHandlers';
import { useHoverScrub, scrubBand } from '../../composables/useHoverScrub';
import { useBatchOperationsStore } from '../../stores/batchOperations';
import { useCollectionsStore } from '../../stores/collections';
import { useToastStore } from '../../stores/toast';
import { useGamesStore } from '../../stores/games';
import { moveClipToGame } from '../../services/clips';
import { saveScrollPosition } from '../../utils/scroll';
import type { Clip } from '../../types/clip';
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

const router = useRouter();
const config = useConfiguration();
const batchStore = useBatchOperationsStore();
const collectionsStore = useCollectionsStore();
const toastStore = useToastStore();
const gamesStore = useGamesStore();
const { startDrag, endDrag } = useDragAndDrop();

const isSelected = computed(() => batchStore.isSelected(props.clip.id));
const showMoveDialog = ref(false);

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

  saveScrollPosition();
  router.push(`/clips/${props.clip.id}`);
}
</script>

<template>
  <article 
    draggable="true"
    :class="[
      'clip-card shadow group relative bg-card/5 rounded-xl overflow-hidden border transition-all hover:shadow-lg cursor-pointer',
      isSelected 
        ? 'border-orange-500 border-2 ring-2 ring-2 ring-orange-500/30' 
        : 'border-border hover:border-orange-500/50'
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
            ? 'bg-orange-500 text-white hover:bg-orange-600' 
            : 'bg-black/60 backdrop-blur-sm border border-white/20 text-white hover:bg-black/80'
        ]"
        @click="handleCheckboxClick"
      >
        <Icon 
          :icon="isSelected ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'" 
          class="text-xl transform-transition"
          :class="{ 'scale-110': isSelected }"
        />
      </button>
    </div>

    <ClipPublishedBadge :published="clip.published" />
    
    <ClipStarButton v-if="!isSelectionMode" :clip="clip" @updated="emit('updated', $event)" />
    
    <div 
      v-if="!isSelectionMode"
      class="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 opacity-transition"
    >
      <ClipActionsMenu
        :clip="clip"
        :collection-id="collectionId"
        @updated="emit('updated', $event)"
        @deleted="emit('deleted')"
      />
    </div>

    <div 
      ref="previewEl"
      class="aspect-[21/9] bg-black relative"
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
        <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
        <div
          class="absolute top-0 bottom-0 w-0.5 bg-orange-500"
          :style="{ left: `${scrubProgress * 100}%` }"
        ></div>
        <div
          class="absolute top-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-mono -translate-x-1/2 whitespace-nowrap"
          :style="{ left: scrubLabelLeft }"
        >
          {{ formatTime(scrubTime) }}
        </div>
      </div>
    </div>
    
    <!--
      Where the preview has got to, drawn as the video's own bottom edge.

      A line rather than a control: it sits flush under the picture with no gap,
      two pixels tall, and takes no clicks. Scrubbing and playing both move it,
      so a tile always shows where it is without adding anything to look at.
    -->
    <div class="h-0.5 bg-border/40 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        class="h-full w-full bg-orange-500 origin-left will-change-transform"
        :style="fillStyle"
      ></div>
    </div>

    <div :class="config.public.value.compactMode ? 'p-2' : 'p-3'">
      <div class="flex items-start justify-between gap-2 mb-2">
        <ClipNameInput :clip="clip" @updated="emit('updated', $event)" />
      </div>
      
      <ClipMetadata
        :size-bytes="clip.sizeBytes"
        :duration-sec="clip.durationSec"
        :recorded-at="clip.recordedAt ?? clip.fileModifiedAt ?? clip.createdAt"
      />

      <ClipTags :clip="clip" @updated="emit('updated', $event)" />
    </div>
  </article>
</template>
