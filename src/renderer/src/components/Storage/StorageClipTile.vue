<script setup lang="ts">
import BaseChip from '@renderer/components/Base/BaseChip.vue';
import { computed, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { ICON_BOX, FOCUS_RING, MOTION } from '@renderer/components/Base/geometry';
import { thumbnailUrl, videoUrl } from '@renderer/utils/mediaUrl';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useHoverScrub } from '@renderer/composables/clips/useHoverScrub';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import type { Clip } from '@renderer/types/clip';

/**
 * One clip, small, on a screen whose verb is delete.
 *
 * Not `Library/ClipCard.vue`. That card is for browsing: it drags, it stars,
 * it opens a menu, and every one of those is a way to touch a clip that is
 * about to be destroyed.
 *
 * **But it has to be watchable**, and the first version was not: the whole
 * tile was one button that ticked the clip, so the only way to find out what a
 * recording held before throwing it away was to leave the screen and go and
 * find it in the library. A delete screen you cannot look at is a screen that
 * teaches you to delete blind, or not at all.
 *
 * So the tile has two parts, and they do different things:
 *
 * - **The picture is the clip.** Hovering scrubs through it exactly like a
 *   library card, from the same `useHoverScrub` and the same setting, and
 *   pressing it opens the clip itself, full size, where it plays and can be
 *   trimmed or deleted.
 * - **The box and the caption are the choice.** The checkbox in the corner and
 *   the name and size underneath tick it, or in a burst, keep it.
 *
 * The size is the loudest number on it, deliberately: it is the reason
 * somebody is looking at this list.
 */
interface Props {
  clip: Clip;
  selected?: boolean;
  /** Draws it as the one being kept rather than as one being chosen. */
  keeper?: boolean;
  /** What the choice does. "select" ticks it, "keep" saves it. */
  mode?: 'select' | 'keep';
}

const props = withDefaults(defineProps<Props>(), { mode: 'select' });
const emit = defineEmits<{ (e: 'toggle'): void }>();

const { formatBytes } = useFormat();
const config = useConfiguration();
const { open: openClip } = useClipDetail();

const length = computed(() => {
  const seconds = props.clip.durationSec;
  if (!seconds || seconds <= 0) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
});

const age = computed(() =>
  formatRelativeTime(props.clip.recordedAt ?? props.clip.fileModifiedAt),
);

const title = computed(() => props.clip.displayName?.trim() || props.clip.filename);

const videoEl = ref<HTMLVideoElement | null>(null);
const scrubEnabled = computed(() => config.public.value.hoverScrub);
const { isScrubbing, scrubProgress, scrubTime, formatTime, handleMouseMove, handleMouseLeave } =
  useHoverScrub(videoEl, scrubEnabled);

const src = computed(() => videoUrl(props.clip.id, props.clip.fileModifiedAt));

/*
 * Hover plays, like a library card, under the same setting.
 *
 * Started on the first move over the picture rather than on enter, which is
 * the lesson `useClipHover` learned: a grid re-drawing under a pointer that
 * has not moved is not somebody pointing at a clip. One plays at a time, and
 * leaving puts it back to the start, so the grid is never a wall of motion.
 */
let previewing = false;
function preview(event: MouseEvent): void {
  handleMouseMove(event);
  if (previewing || isScrubbing.value || !config.public.value.autoPlayOnHover) return;
  const video = videoEl.value;
  if (!video) return;
  previewing = true;
  for (const other of document.querySelectorAll<HTMLVideoElement>('video[data-storage-preview]')) {
    if (other !== video && !other.paused) {
      other.pause();
      other.currentTime = 0;
    }
  }
  video.play().catch(() => {});
}

function stopPreview(): void {
  handleMouseLeave();
  previewing = false;
  const video = videoEl.value;
  if (!video) return;
  video.pause();
  video.currentTime = 0;
}
const scrubLabelLeft = computed(() => `${Math.min(90, Math.max(10, scrubProgress.value * 100))}%`);

const choiceLabel = computed(() => {
  if (props.mode === 'keep') return props.keeper ? `Keeping ${title.value}` : `Keep ${title.value} instead`;
  return props.selected ? `Unselect ${title.value}` : `Select ${title.value}`;
});

/*
 * Picked is a ring, painted as a shadow outside the box, rather than a
 * border colour: a one pixel hairline turning red was the only sign a tile
 * had been picked, and across a grid of forty it did not read.
 */
const frame = computed(() => [
  'group relative rounded-md overflow-hidden border border-border bg-card',
  MOTION,
  props.keeper
    ? 'ring-2 ring-accent'
    : props.selected
      ? 'ring-2 ring-danger'
      : 'hover:border-line-strong',
]);
</script>

<template>
  <div :class="frame">
    <!-- The picture: scrub on hover, press to watch. -->
    <button
      type="button"
      :class="['group/pic relative block w-full aspect-21/9 bg-video-bed cursor-pointer', FOCUS_RING]"
      :aria-label="`Watch ${title}`"
      @click="openClip(clip.id, 'details', { countAsOpen: false })"
      @mousemove="preview"
      @mouseleave="stopPreview"
    >
      <!--
        The ones about to go are dimmed, so the one being kept is the picture
        the eye lands on. Opacity only, which is the one property allowed to
        move with a state.
      -->
      <video
        ref="videoEl"
        data-storage-preview
        :src="src"
        :poster="thumbnailUrl(clip.id)"
        muted
        preload="none"
        :class="[
          'size-full object-cover pointer-events-none transition-opacity duration-150',
          mode === 'keep' && !keeper && !isScrubbing ? 'opacity-50' : '',
        ]"
      />

      <!-- Where the scrub is, the same strip the library card draws. -->
      <div v-if="isScrubbing" class="absolute inset-x-0 bottom-0 h-9 pointer-events-none">
        <div class="absolute inset-0 bg-linear-to-t from-video-bed/60 to-transparent" />
        <div class="absolute top-0 bottom-0 w-0.5 bg-accent" :style="{ left: `${scrubProgress * 100}%` }" />
        <div
          class="absolute top-1 -translate-x-1/2 whitespace-nowrap rounded-sm bg-video-bed/80 px-1.5 py-0.5 font-mono text-[10px] text-on-video"
          :style="{ left: scrubLabelLeft }"
        >
          {{ formatTime(scrubTime) }}
        </div>
      </div>

      <!--
        The one thing that reaches outside this machine. A published clip has a
        link somebody may already have shared, and no Recycle Bin covers that,
        so it is said on the tile rather than only in the question.
      -->
      <BaseChip v-if="clip.published" class="absolute top-1.5 right-1.5">Published</BaseChip>

      <BaseChip v-if="length && !isScrubbing" numeric class="absolute bottom-1.5 right-1.5">
        {{ length }}
      </BaseChip>

      <!-- A hint that the picture is the clip, on hover, where it costs nothing at rest. -->
      <span
        v-show="!isScrubbing && !config.public.value.autoPlayOnHover"
        class="absolute inset-0 m-auto size-10 rounded-full bg-scrim text-on-video inline-flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover/pic:opacity-100 pointer-events-none"
        aria-hidden="true"
      >
        <Icon icon="material-symbols:play-arrow-rounded" class="size-6 block" />
      </span>
    </button>

    <!--
      The choice, over the picture's corner. A sibling of the picture's button
      rather than inside it, so there are two targets and not one nested in
      the other. On a scrim of its own, because white on the frame vanished
      into every bright thumbnail.
    -->
    <button
      type="button"
      :class="['absolute top-1.5 left-1.5 rounded-sm', FOCUS_RING]"
      :aria-label="choiceLabel"
      :aria-pressed="mode === 'keep' ? keeper : selected"
      @click="emit('toggle')"
    >
      <BaseChip v-if="mode === 'keep'" class="cursor-pointer">
        <Icon
          :icon="keeper ? 'material-symbols:check-circle' : 'material-symbols:delete-outline'"
          :class="ICON_BOX"
        />
        {{ keeper ? 'Keeping' : 'Deleting' }}
      </BaseChip>
      <span v-else class="inline-flex rounded-sm bg-scrim p-0.5 cursor-pointer">
        <Icon
          :icon="selected ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'"
          :class="['size-5 block', selected ? 'text-danger' : 'text-on-video']"
        />
      </span>
    </button>

    <!-- The caption is part of the choice too: the name and the size, pressed, pick it. -->
    <button
      type="button"
      :class="['block w-full px-2 py-1.5 text-left', FOCUS_RING]"
      :aria-label="choiceLabel"
      @click="emit('toggle')"
    >
      <div class="truncate text-xs text-foreground">{{ title }}</div>
      <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-400">
        <span class="tabular-nums">{{ formatBytes(clip.sizeBytes) }}</span>
        <span aria-hidden="true">·</span>
        <span class="truncate">{{ age }}</span>
      </div>
    </button>
  </div>
</template>
