<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '@renderer/utils/mediaUrl';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { useGoodBits } from '@renderer/composables/clips/useGoodBits';
import { useSpaceToToggle } from '@renderer/composables/media/useSpaceToToggle';
import { timecode } from '@renderer/utils/time';
import type { Clip } from '@renderer/types/clip';

/**
 * The clip, with controls of our own rather than Chromium's.
 *
 * The native bar was fine and told you nothing this app knows. Three things
 * it cannot do, and they are the reason this exists:
 *
 * - **Show where the good bits are.** A GoodBit is a range on this clip, and
 *   the one place it obviously belongs is the timeline you scrub. Drawn as
 *   bands under the progress bar, so a thirty second recording with two marked
 *   moments says so at a glance and you can drag straight to one.
 * - **Remember how loud you wanted it.** Every clip opens in a new `<video>`,
 *   which starts at full volume, so setting it was a chore that undid itself on
 *   the next clip. It is one stored preference now, `clipVolume`.
 * - **Match the app.** The native bar is drawn by Chromium at its own height,
 *   with its own focus ring and its own idea of a slider.
 *
 * What it deliberately does not do is reimplement the video element. Seeking is
 * `currentTime`, volume is `volume`, fullscreen is the Fullscreen API. The
 * element stays the source of truth and this reads it back, which is why
 * `timeupdate` is not trusted for the bar (see `frame` below).
 */
interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const config = useConfiguration();

const videoElement = ref<HTMLVideoElement | null>(null);
/** The frame around the video, which is what goes fullscreen. */
const stage = ref<HTMLElement | null>(null);

/*
 * Keyed on the file's own date, like every other media URL.
 *
 * This asked for the clip with no version at all, so after a trim the browser
 * went on serving the video it had already decoded and the page played nothing.
 */
const videoUrl = computed(() => videoUrlFor(props.clip.id, props.clip.fileModifiedAt));
const posterUrl = computed(() => thumbUrlFor(props.clip.id, props.clip.fileModifiedAt));

/*
 * The marks, from the list every other GoodBit surface reads.
 *
 * Nothing is fetched here: `useGoodBits` holds one list per clip, so this is
 * whatever the details panel or the trimmer has already loaded, and a GoodBit
 * marked or deleted down the page moves the bands up here without any wiring.
 */
const { goodBits } = useGoodBits(computed(() => props.clip.id));

const playing = ref(false);
const currentTime = ref(0);
/** The element's own duration, which is the truth for a bar drawn against it. */
const duration = ref(0);
const buffered = ref(0);

/**
 * Stored length as the opening guess.
 *
 * `durationSec` is on the row and the element's metadata is not there yet, so
 * without this the bar has no scale for the first moments and a GoodBit band
 * would be drawn at the wrong width and then jump.
 */
const scale = computed(() => duration.value || props.clip.durationSec || 0);

const percentOf = (seconds: number): number =>
  scale.value > 0 ? Math.min(100, Math.max(0, (seconds / scale.value) * 100)) : 0;

const progressPercent = computed(() => percentOf(currentTime.value));
const bufferedPercent = computed(() => percentOf(buffered.value));

/** Bands for the bar: only the ones that fit the clip, and never zero-width. */
const bands = computed(() =>
  goodBits.value
    .filter((mark) => mark.endSec > mark.startSec && scale.value > 0)
    .map((mark) => ({
      id: mark.id,
      label: mark.name ?? 'GoodBit',
      leftPercent: percentOf(mark.startSec),
      widthPercent: Math.max(0.6, percentOf(mark.endSec) - percentOf(mark.startSec)),
    })),
);

/*
 * Read on a frame, not on `timeupdate`.
 *
 * `timeupdate` fires about four times a second at irregular intervals, so a bar
 * driven by it steps rather than moves, and a CSS transition over the top only
 * smears the steps into each other. The same reasoning as the hover preview on
 * a library card.
 */
let frame = 0;
function follow(): void {
  const video = videoElement.value;
  if (video) {
    currentTime.value = video.currentTime;
    if (video.buffered.length > 0) {
      buffered.value = video.buffered.end(video.buffered.length - 1);
    }
  }
  frame = requestAnimationFrame(follow);
}
frame = requestAnimationFrame(follow);
onBeforeUnmount(() => cancelAnimationFrame(frame));

function onLoaded(): void {
  const video = videoElement.value;
  if (!video) return;

  duration.value = Number.isFinite(video.duration) ? video.duration : 0;
  // The stored preference, applied to this element the moment it exists.
  video.volume = config.public.value.clipVolume;
  video.muted = config.public.value.muteVideosByDefault;
}

function togglePlay(): void {
  const video = videoElement.value;
  if (!video) return;
  if (video.paused) void video.play();
  else video.pause();
}

/* ── Seeking ─────────────────────────────────────────────────────────────── */

const bar = ref<HTMLElement | null>(null);
const dragging = ref(false);
/** Where the pointer is along the bar, for the hover readout. */
const hoverPercent = ref<number | null>(null);

function fractionFromEvent(event: PointerEvent | MouseEvent): number {
  const box = bar.value?.getBoundingClientRect();
  if (!box || box.width === 0) return 0;
  return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
}

function seekTo(fraction: number): void {
  const video = videoElement.value;
  if (!video || scale.value <= 0) return;
  video.currentTime = fraction * scale.value;
  currentTime.value = video.currentTime;
}

/*
 * Pointer events with capture, not mousedown plus a window listener.
 *
 * `setPointerCapture` keeps the drag with the bar once it has started, so
 * dragging off the element, or past the edge of the window, keeps seeking
 * instead of silently stopping. It also gives touch and pen the same behaviour
 * for free.
 */
function onPointerDown(event: PointerEvent): void {
  dragging.value = true;
  bar.value?.setPointerCapture(event.pointerId);
  seekTo(fractionFromEvent(event));
}

function onPointerMove(event: PointerEvent): void {
  hoverPercent.value = fractionFromEvent(event) * 100;
  if (dragging.value) seekTo(fractionFromEvent(event));
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging.value) return;
  dragging.value = false;
  bar.value?.releasePointerCapture(event.pointerId);
}

const hoverTime = computed(() =>
  hoverPercent.value === null ? '' : timecode((hoverPercent.value / 100) * scale.value),
);

/** Keep the hover readout from hanging off either end of the bar. */
const hoverLabelLeft = computed(() => `${Math.min(94, Math.max(6, hoverPercent.value ?? 0))}%`);

/* ── Volume ──────────────────────────────────────────────────────────────── */

const volume = computed(() => config.public.value.clipVolume);
const muted = ref(false);

function setVolume(value: number): void {
  const clamped = Math.min(1, Math.max(0, value));
  config.public.value.clipVolume = clamped;

  const video = videoElement.value;
  if (!video) return;
  video.volume = clamped;
  // Moving the slider off zero is the clearest possible "unmute".
  if (clamped > 0 && video.muted) {
    video.muted = false;
    muted.value = false;
  }
}

function toggleMute(): void {
  const video = videoElement.value;
  if (!video) return;
  video.muted = !video.muted;
  muted.value = video.muted;
}

const volumeIcon = computed(() => {
  if (muted.value || volume.value === 0) return 'material-symbols:volume-off-rounded';
  if (volume.value < 0.5) return 'material-symbols:volume-down-rounded';
  return 'material-symbols:volume-up-rounded';
});

/* ── Fullscreen ──────────────────────────────────────────────────────────── */

const isFullscreen = ref(false);

function onFullscreenChange(): void {
  isFullscreen.value = document.fullscreenElement === stage.value;
}
document.addEventListener('fullscreenchange', onFullscreenChange);
onBeforeUnmount(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  await stage.value?.requestFullscreen();
}

/*
 * A new clip is a new element, so the remembered volume is applied again.
 *
 * `loadedmetadata` covers the normal path; this covers a `src` swap on the same
 * element, which is what changing clips in an open panel does.
 */
watch(videoUrl, () => {
  currentTime.value = 0;
  duration.value = 0;
  buffered.value = 0;
});

/*
 * Space, from anywhere in the panel.
 *
 * The button under the picture had it and nothing else did, so the way to
 * pause was to find a 36px target. It is scoped to this panel and skipped
 * whenever space already belongs to something focused: see the composable.
 */
useSpaceToToggle(togglePlay, stage);

defineExpose({
  videoElement,
});
</script>

<template>
  <div
    ref="stage"
    class="relative rounded-lg overflow-hidden bg-video-bed border border-border group/player"
  >
    <video
      ref="videoElement"
      :src="videoUrl"
      :poster="posterUrl"
      preload="metadata"
      class="w-full max-h-[62vh] object-contain bg-video-bed"
      :class="isFullscreen ? 'max-h-screen h-screen' : ''"
      disablePictureInPicture
      autoplay
      @loadedmetadata="onLoaded"
      @play="playing = true"
      @pause="playing = false"
      @volumechange="muted = ($event.target as HTMLVideoElement).muted"
      @click="togglePlay"
    />

    <!--
      The controls, over the picture.

      White and black are literal in here, which CLAUDE.md allows in exactly
      this case: this sits on a video frame, a fixed-dark ground that does not
      follow the theme, so a token would be the wrong colour in light mode.
    -->
    <div
      class="absolute inset-x-0 bottom-0 bg-linear-to-t from-video-bed/85 via-video-bed/55 to-transparent px-3 pb-2 pt-8"
    >
      <!--
        The bar, and the marks on it.

        Tall enough to hit: the row is 18px with the track drawn 5px inside it,
        because a 5px pointer target on a progress bar is the thing every video
        player gets wrong. The bands sit inside the track rather than over it,
        so the played portion still reads on top of a marked range.
      -->
      <div
        ref="bar"
        class="relative flex h-[18px] cursor-pointer items-center select-none"
        role="slider"
        tabindex="0"
        :aria-label="'Seek through the clip'"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(scale)"
        :aria-valuenow="Math.round(currentTime)"
        :aria-valuetext="`${timecode(currentTime)} of ${timecode(scale)}`"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="hoverPercent = null"
        @keydown.left.prevent="seekTo(Math.max(0, (currentTime - 5) / (scale || 1)))"
        @keydown.right.prevent="seekTo(Math.min(1, (currentTime + 5) / (scale || 1)))"
      >
        <div class="relative h-[5px] w-full rounded-full bg-on-video/25 overflow-hidden">
          <div class="absolute inset-y-0 left-0 bg-on-video/20" :style="{ width: `${bufferedPercent}%` }"></div>

          <span
            v-for="band in bands"
            :key="band.id"
            class="absolute inset-y-0 bg-accent/80"
            :style="{ left: `${band.leftPercent}%`, width: `${band.widthPercent}%` }"
            :title="band.label"
          ></span>

          <div class="absolute inset-y-0 left-0 bg-accent" :style="{ width: `${progressPercent}%` }"></div>
        </div>

        <!--
          The handle, always drawn rather than appearing on hover: this is the
          thing the instruction says to drag, so it has to be there to be found.
        -->
        <span
          class="pointer-events-none absolute h-3 w-3 -translate-x-1/2 rounded-full bg-on-video shadow-[0_0_0_1px_rgba(0,0,0,0.5)] transition-transform"
          :class="dragging ? 'scale-125' : ''"
          :style="{ left: `${progressPercent}%` }"
        ></span>

        <span
          v-if="hoverPercent !== null && !dragging"
          class="pointer-events-none absolute -top-6 -translate-x-1/2 rounded-sm bg-video-bed/80 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-on-video"
          :style="{ left: hoverLabelLeft }"
        >
          {{ hoverTime }}
        </span>
      </div>

      <div class="mt-1 flex items-center gap-2 text-on-video">
        <button
          type="button"
          class="rounded-lg p-1.5 transition-colors hover:bg-on-video/15"
          :title="playing ? 'Pause' : 'Play'"
          :aria-label="playing ? 'Pause' : 'Play'"
          @click="togglePlay"
        >
          <Icon
            :icon="playing ? 'material-symbols:pause-rounded' : 'material-symbols:play-arrow-rounded'"
            class="text-2xl"
          />
        </button>

        <!--
          One group for volume, and the slider only on hover.

          A slider that is always there is a second thing competing for a narrow
          row; the button alone says the state, and reaching for it is what
          reveals the rest.
        -->
        <div class="group/volume flex items-center">
          <button
            type="button"
            class="rounded-lg p-1.5 transition-colors hover:bg-on-video/15"
            :title="muted ? 'Unmute' : 'Mute'"
            :aria-label="muted ? 'Unmute' : 'Mute'"
            @click="toggleMute"
          >
            <Icon :icon="volumeIcon" class="text-xl" />
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            :value="muted ? 0 : volume"
            aria-label="Volume"
            class="clip-volume w-0 opacity-0 transition-all duration-150 group-hover/volume:w-20 group-hover/volume:opacity-100 focus-visible:w-20 focus-visible:opacity-100"
            @input="setVolume(Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <span class="ml-1 font-mono text-xs tabular-nums text-on-video/85">
          {{ timecode(currentTime) }} / {{ timecode(scale) }}
        </span>

        <span v-if="bands.length > 0" class="ml-auto text-[11px] text-on-video/70">
          {{ bands.length }} {{ bands.length === 1 ? 'GoodBit' : 'GoodBits' }}
        </span>

        <button
          type="button"
          class="rounded-lg p-1.5 transition-colors hover:bg-on-video/15"
          :class="bands.length > 0 ? '' : 'ml-auto'"
          :title="isFullscreen ? 'Leave fullscreen' : 'Fullscreen'"
          :aria-label="isFullscreen ? 'Leave fullscreen' : 'Fullscreen'"
          @click="toggleFullscreen"
        >
          <Icon
            :icon="isFullscreen
              ? 'material-symbols:fullscreen-exit-rounded'
              : 'material-symbols:fullscreen-rounded'"
            class="text-xl"
          />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * The volume slider, drawn rather than inherited.
 *
 * A range input is the one control Chromium styles from the OS theme, so it
 * arrives as a grey Windows slider on a black video and cannot be reached with
 * utilities. `appearance: none` and the two vendor thumb selectors are the
 * whole of what is needed; the track is the input's own background.
 */
.clip-volume {
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: var(--color-on-video-track);
  outline: none;
}

.clip-volume::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: var(--color-on-video);
  cursor: pointer;
}
</style>
