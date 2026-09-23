<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { AnimatePresence, motion } from 'motion-v';
import type { NotchTileData, NotchTilePress } from '@shared/notch';
import type { TileSize } from '@shared/notchWings';
import { gameArtUrl, thumbUrl } from '@renderer/utils/mediaUrl';

/**
 * One tile in a wing, in whichever shape it was placed.
 *
 * Drawn on the notch's black, so always in the dark palette: the notch page is
 * dark by its own `<html>`, and Settings wraps its copies in `.dark`. Every
 * tile is sized by the grid, not by its content, so each shape says less
 * rather than growing: a tall Recent clips shows two pictures where a wide one
 * shows three.
 *
 * `inert` is the layout editor's copy: the same picture, nothing pressable,
 * so dragging one never presses it.
 */
const props = defineProps<{ data: NotchTileData; size: TileSize; inert?: boolean }>();
const emit = defineEmits<{ press: [press: NotchTilePress] }>();

const tall = computed(() => props.size.w === 1 && props.size.h === 2);
const wide = computed(() => props.size.w === 2 && props.size.h === 1);

/** A press on the whole tile, for the tiles that are one action. */
const whole = computed<NotchTilePress | null>(() => {
  const d = props.data;
  switch (d.id) {
    case 'found':
      return d.clips ? { tile: 'found' } : null;
    case 'star':
      return d.hasLatest ? { tile: 'star' } : null;
    case 'share':
      return d.hasLatest && d.state !== 'working' ? { tile: 'share' } : null;
    case 'play':
    case 'jobs':
    case 'drive':
    case 'views':
    case 'week':
    case 'obs':
      return { tile: d.id };
    default:
      return null;
  }
});

function press(value: NotchTilePress | null): void {
  if (!props.inert && value) emit('press', value);
}

const SPRING = { type: 'spring', visualDuration: 0.32, bounce: 0.45 } as const;

const recentClips = computed(() =>
  props.data.id === 'recent' ? props.data.clips.slice(0, tall.value ? 2 : 3) : [],
);

const shareText = computed(() => {
  if (props.data.id !== 'share') return '';
  if (!props.data.hasLatest) return 'No clip yet';
  return {
    idle: props.data.published ? 'Copy link' : 'Share latest',
    working: 'Uploading',
    copied: 'Link copied',
    failed: 'Could not share',
  }[props.data.state];
});

const shareIcon = computed(() => {
  if (props.data.id !== 'share') return '';
  return {
    idle: 'material-symbols:link',
    working: 'material-symbols:progress-activity',
    copied: 'material-symbols:check',
    failed: 'material-symbols:error-outline',
  }[props.data.state];
});

const hoursValue = computed(() =>
  props.data.id === 'drive' && props.data.hours ? props.data.hours.split(' ') : null,
);
</script>

<template>
  <motion.div
    class="notch-tile group relative flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[11px] bg-muted-50 px-2.5 py-2 text-[11.5px] leading-snug text-muted-900"
    :class="[
      whole && !inert ? 'cursor-pointer hover:bg-muted-100' : '',
      inert ? 'pointer-events-none' : '',
      'transition-colors duration-150',
    ]"
    :while-press="whole && !inert ? { scale: 0.95 } : undefined"
    :transition="SPRING"
    :role="whole && !inert ? 'button' : undefined"
    :tabindex="whole && !inert ? 0 : undefined"
    @click="press(whole)"
    @keydown.enter.prevent="press(whole)"
    @keydown.space.prevent="press(whole)"
  >
    <!-- Recent clips: a row of pictures, or a column of two standing up. -->
    <template v-if="data.id === 'recent'">
      <span class="tile-label">Before that</span>
      <p v-if="!data.clips.length" class="mt-auto text-muted-400">Nothing older yet.</p>
      <div v-else class="mt-auto flex min-h-0 flex-1 gap-1.5 pt-1.5" :class="tall ? 'flex-col' : 'items-end'">
        <motion.button
          v-for="(clip, i) in recentClips"
          :key="clip.id"
          type="button"
          class="relative min-h-0 flex-1 overflow-hidden rounded-md bg-video-bed outline-none focus-visible:focus-ring"
          :class="wide ? 'h-[38px] flex-1' : ''"
          :initial="{ opacity: 0, y: 6 }"
          :animate="{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.05 * i } }"
          :while-hover="inert ? undefined : { y: -2 }"
          :while-press="inert ? undefined : { scale: 0.93 }"
          :tabindex="inert ? -1 : 0"
          :aria-label="`Trim the clip from ${clip.length}`"
          @click.stop="press({ tile: 'recent', clipId: clip.id })"
        >
          <img :src="thumbUrl(clip.id, clip.modifiedAt)" alt="" class="size-full object-cover" draggable="false" />
          <span v-if="clip.length" class="tile-length">{{ clip.length }}</span>
        </motion.button>
      </div>
    </template>

    <!-- Tonight: the last game played, today, as a two by two of its clips. -->
    <template v-else-if="data.id === 'session'">
      <span class="tile-label">Today · {{ data.game || 'no game yet' }}</span>
      <p v-if="!data.clips.length" class="m-auto text-center text-muted-400">Nothing recorded today.</p>
      <div v-else class="mt-1.5 grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5">
        <motion.button
          v-for="(clip, i) in data.clips"
          :key="clip.id"
          type="button"
          class="relative min-h-0 overflow-hidden rounded-md bg-video-bed outline-none focus-visible:focus-ring"
          :initial="{ opacity: 0, scale: 0.85 }"
          :animate="{ opacity: 1, scale: 1, transition: { ...SPRING, delay: 0.04 * i } }"
          :while-press="inert ? undefined : { scale: 0.93 }"
          :tabindex="inert ? -1 : 0"
          :aria-label="`Trim the clip from ${clip.length}`"
          @click.stop="press({ tile: 'session', clipId: clip.id })"
        >
          <img :src="thumbUrl(clip.id, clip.modifiedAt)" alt="" class="size-full object-cover" draggable="false" />
          <span
            v-if="clip.moments"
            class="absolute left-1 top-1 rounded-[3px] bg-accent px-1 font-mono text-[9px] font-semibold text-accent-fg"
          >{{ clip.moments }}</span>
          <span v-if="clip.length" class="tile-length">{{ clip.length }}</span>
        </motion.button>
      </div>
      <span class="mt-1.5 truncate text-[11px] text-muted-400">
        {{ data.count }} {{ data.count === 1 ? 'clip' : 'clips' }}
        <template v-if="data.moments">
          · <span class="text-accent-ink">{{ data.moments }} {{ data.moments === 1 ? 'moment' : 'moments' }} found</span>
        </template>
      </span>
    </template>

    <!-- Found moments: one number, and the press that goes through them. -->
    <template v-else-if="data.id === 'found'">
      <span class="tile-label">Found today</span>
      <span class="mt-auto flex items-baseline gap-1.5">
        <span class="tile-number" :class="data.moments ? 'text-accent-ink' : 'text-muted-400'">{{ data.moments }}</span>
        <span class="truncate" :class="data.moments ? 'text-accent-ink' : 'text-muted-400'">
          {{ data.moments === 1 ? 'moment' : 'moments' }}
        </span>
      </span>
      <span class="tile-quiet">{{ data.clips ? `in ${data.clips} ${data.clips === 1 ? 'clip' : 'clips'}` : 'none yet' }}</span>
    </template>

    <!-- Running jobs. -->
    <template v-else-if="data.id === 'jobs'">
      <span class="tile-label">{{ data.jobs.length ? 'Working on' : 'Jobs' }}</span>
      <p v-if="!data.jobs.length" class="mt-auto text-muted-400">Nothing running.</p>
      <div v-else class="mt-auto flex min-h-0 flex-col gap-1.5">
        <div v-for="job in data.jobs.slice(0, tall ? 2 : 1)" :key="job.label" class="flex min-w-0 flex-col gap-1">
          <div class="flex min-w-0 items-baseline justify-between gap-2">
            <span class="truncate">{{ job.label }}</span>
            <span v-if="job.eta && !tall" class="shrink-0 font-mono text-[11px] tabular-nums text-muted-400">{{ job.eta }} left</span>
          </div>
          <div class="h-1 overflow-hidden rounded-full bg-muted-200">
            <motion.div
              class="h-full rounded-full bg-accent"
              :initial="false"
              :animate="{ width: `${Math.max(2, job.progress)}%` }"
              :transition="{ type: 'spring', visualDuration: 0.5, bounce: 0 }"
            />
          </div>
        </div>
        <span v-if="data.jobs.length > (tall ? 2 : 1)" class="tile-quiet">
          then {{ data.jobs.length - (tall ? 2 : 1) }} more
        </span>
      </div>
    </template>

    <!-- The drive, in hours of recording. -->
    <template v-else-if="data.id === 'drive'">
      <span class="tile-label">{{ data.drive }} free</span>
      <span class="mt-auto flex items-baseline justify-between gap-1.5">
        <span v-if="hoursValue" class="tile-number">
          {{ hoursValue[0] }}<span class="ml-0.5 text-[12px]">{{ hoursValue[1] }}</span>
        </span>
        <span v-if="hoursValue" class="shrink-0 font-mono text-[11px] tabular-nums text-muted-400">
          {{ data.percent }}%
        </span>
        <span v-else class="tile-number text-[18px]">{{ data.free }}</span>
      </span>
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-muted-200">
        <motion.div
          class="h-full rounded-full"
          :class="data.percent >= 90 ? 'bg-danger' : data.percent >= 75 ? 'bg-warning' : 'bg-muted-500'"
          :initial="{ width: 0 }"
          :animate="{ width: `${data.percent}%` }"
          :transition="{ type: 'spring', visualDuration: 0.6, bounce: 0.2 }"
        />
      </div>
    </template>

    <!-- Play again, in the game's own art. -->
    <template v-else-if="data.id === 'play'">
      <img
        :src="gameArtUrl(data.game, tall ? 'portrait' : 'hero')"
        alt=""
        class="absolute inset-0 size-full object-cover"
        draggable="false"
      />
      <span class="absolute inset-0 bg-linear-to-t from-video-bed/85 via-video-bed/40 to-transparent" />
      <span class="relative mt-auto flex min-w-0 items-center gap-2" :class="tall ? 'flex-col items-start' : ''">
        <motion.span
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-on-video text-video-bed"
          :while-hover="inert ? undefined : { scale: 1.12 }"
          :transition="SPRING"
        >
          <Icon icon="material-symbols:play-arrow-rounded" class="size-4" />
        </motion.span>
        <span class="min-w-0">
          <span class="block truncate text-[12.5px] font-semibold text-on-video">{{ data.name }}</span>
          <span class="block text-[11px] text-on-video/80">Play again</span>
        </span>
      </span>
    </template>

    <!-- Tag the latest. -->
    <template v-else-if="data.id === 'tags'">
      <span class="tile-label">Tag the latest</span>
      <p v-if="!data.tags.length" class="mt-auto text-muted-400">No tags yet.</p>
      <div v-else class="mt-auto flex min-h-0 flex-wrap content-end gap-1.5 overflow-hidden">
        <motion.button
          v-for="tag in data.tags"
          :key="tag.name"
          type="button"
          class="max-w-full truncate rounded-full border px-2 py-px text-[11px] outline-none focus-visible:focus-ring"
          :class="tag.on ? 'border-accent bg-accent-sunk text-accent-ink' : 'border-line-strong text-muted-800 hover:bg-muted-100'"
          :disabled="inert || tag.on || !data.hasLatest"
          :tabindex="inert ? -1 : 0"
          :animate="{ scale: tag.on ? [1, 1.18, 1] : 1 }"
          :while-press="inert || tag.on ? undefined : { scale: 0.9 }"
          :transition="SPRING"
          :title="tag.on ? 'Already on the latest clip' : `Tag the latest clip ${tag.name}`"
          @click.stop="press({ tile: 'tags', tag: tag.name })"
        >
          <span v-if="tag.on" aria-hidden="true">✓ </span>{{ tag.name }}
        </motion.button>
      </div>
    </template>

    <!-- Star the latest: a pop when it takes. -->
    <template v-else-if="data.id === 'star'">
      <span class="m-auto flex flex-col items-center gap-1 text-center">
        <AnimatePresence mode="popLayout" :initial="false">
          <motion.span
            :key="data.starred ? 'on' : 'off'"
            class="block"
            :initial="{ scale: 0.3, rotate: -40, opacity: 0 }"
            :animate="{ scale: 1, rotate: 0, opacity: 1 }"
            :exit="{ scale: 0.3, opacity: 0, transition: { duration: 0.1 } }"
            :transition="{ type: 'spring', visualDuration: 0.36, bounce: 0.6 }"
          >
            <Icon
              :icon="data.starred ? 'material-symbols:star-rounded' : 'material-symbols:star-outline-rounded'"
              class="size-6"
              :class="data.starred ? 'text-accent' : 'text-muted-500'"
            />
          </motion.span>
        </AnimatePresence>
        <span class="text-[11px] text-muted-400">
          {{ !data.hasLatest ? 'No clip yet' : data.starred ? 'Starred' : 'Star latest' }}
        </span>
      </span>
    </template>

    <!-- Share the latest. -->
    <template v-else-if="data.id === 'share'">
      <span class="m-auto flex flex-col items-center gap-1 text-center">
        <AnimatePresence mode="popLayout" :initial="false">
          <motion.span
            :key="data.state"
            class="block"
            :initial="{ scale: 0.5, opacity: 0 }"
            :animate="{ scale: 1, opacity: 1 }"
            :exit="{ scale: 0.5, opacity: 0, transition: { duration: 0.1 } }"
            :transition="SPRING"
          >
            <Icon
              :icon="shareIcon"
              class="size-6"
              :class="[
                data.state === 'copied' ? 'text-success' : data.state === 'failed' ? 'text-danger-ink' : 'text-muted-800',
                data.state === 'working' ? 'animate-spin' : '',
              ]"
            />
          </motion.span>
        </AnimatePresence>
        <span class="text-[11px] text-muted-400">{{ shareText }}</span>
      </span>
    </template>

    <!-- Views of published clips. -->
    <template v-else-if="data.id === 'views'">
      <span class="tile-label">Views</span>
      <div class="mt-auto flex min-w-0 gap-2" :class="tall ? 'flex-col' : 'items-end justify-between'">
        <span class="flex flex-col">
          <span class="tile-number">{{ data.total }}</span>
          <span class="tile-quiet">on {{ data.published }} published</span>
        </span>
        <span v-if="data.top" class="min-w-0 text-[11px] text-muted-400" :class="tall ? '' : 'text-right'">
          <span class="block">Most watched</span>
          <span class="block truncate text-muted-800">
            {{ data.top.name }} <span class="font-mono tabular-nums text-muted-400">{{ data.top.views }}</span>
          </span>
        </span>
      </div>
    </template>

    <!-- OBS, and the key that saves. -->
    <template v-else-if="data.id === 'obs'">
      <span class="tile-label">OBS</span>
      <span class="mt-auto flex items-center gap-1.5 font-medium">
        <span
          class="size-2 shrink-0 rounded-full"
          :class="data.recording === 'running' ? 'bg-success' : data.recording === 'closed' ? 'bg-warning' : 'bg-muted-400'"
        />
        {{ data.recording === 'running' ? 'Running' : data.recording === 'closed' ? 'Closed' : 'Not installed' }}
      </span>
      <span class="tile-quiet">
        <template v-if="data.key">saves on <span class="font-mono text-muted-900">{{ data.key }}</span></template>
        <template v-else-if="data.recording !== 'missing'">no save key bound</template>
        <template v-else>&nbsp;</template>
      </span>
    </template>

    <!-- This week. -->
    <template v-else-if="data.id === 'week'">
      <span class="tile-label">Last 7 days</span>
      <div class="mt-auto flex min-w-0 gap-2" :class="tall ? 'flex-col' : 'items-end justify-between'">
        <span class="flex flex-col">
          <span class="tile-number">{{ data.count }}</span>
          <span class="tile-quiet">clips · {{ data.total }}</span>
        </span>
        <span v-if="data.games.length" class="flex min-w-0 flex-col text-[11px] text-muted-400" :class="tall ? '' : 'items-end'">
          <span v-for="game in data.games" :key="game.name" class="flex max-w-full gap-1">
            <span class="truncate">{{ game.name }}</span>
            <span class="font-mono tabular-nums text-muted-800">{{ game.count }}</span>
          </span>
        </span>
      </div>
    </template>
  </motion.div>
</template>

<style scoped>
@reference "../../styles.css";

.tile-label {
  @apply block truncate text-[9.5px] font-semibold uppercase tracking-[0.09em] text-muted-400;
}
.tile-number {
  @apply font-mono text-[22px] font-medium leading-none tabular-nums;
}
.tile-quiet {
  @apply mt-0.5 block truncate text-[11px] text-muted-400;
}
.tile-length {
  @apply absolute bottom-0.5 right-0.5 rounded-[3px] bg-scrim-strong px-1 font-mono text-[9px] leading-tight text-on-video;
}
</style>
