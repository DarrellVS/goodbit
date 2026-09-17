<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { formatTime } from '@renderer/utils/timeFormat';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { EDITOR_CONSTANTS } from '@renderer/constants/editor';

/*
 * The transport buttons carried no text and no tooltip, so the only way to
 * learn what the two arrows did was to press one and watch. Naming the step
 * from the constant means the label cannot drift from the behaviour.
 */
const SKIP_SECONDS = EDITOR_CONSTANTS.SKIP_SECONDS;

interface Props {
  playing: boolean;
  currentTime: number;
  duration: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  exporting?: boolean;
  exportProgress?: number;
  /** True while every clip on the timeline is being listened to. */
  trimmingHighlights?: boolean;
  clipCount?: number;
}

interface Emits {
  (e: 'play'): void;
  (e: 'pause'): void;
  (e: 'skip-backward'): void;
  (e: 'skip-forward'): void;
  (e: 'zoom-in'): void;
  (e: 'zoom-out'): void;
  /** Zoom until the whole movie is on screen. */
  (e: 'zoom-fit'): void;
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'export'): void;
  (e: 'trim-to-highlights'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <div class="flex items-center justify-between gap-4 px-4 h-14 bg-card border-t border-border">
    <div class="flex items-center gap-1.5">
      <button
        type="button"
        class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :disabled="!canUndo"
        title="Undo"
        aria-label="Undo"
        @click="emit('undo')"
      >
        <Icon icon="material-symbols:undo" class="size-5 shrink-0 block" />
      </button>

      <button
        type="button"
        class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :disabled="!canRedo"
        title="Redo"
        aria-label="Redo"
        @click="emit('redo')"
      >
        <Icon icon="material-symbols:redo" class="size-5 shrink-0 block" />
      </button>

      <div class="w-px h-5 bg-line-strong mx-1 shrink-0" aria-hidden="true" />

      <button
        type="button"
        class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :title="`Back ${SKIP_SECONDS} seconds`"
        :aria-label="`Back ${SKIP_SECONDS} seconds`"
        @click="emit('skip-backward')"
      >
        <Icon icon="material-symbols:fast-rewind" class="size-5 shrink-0 block" />
      </button>

      <!--
        The one filled control in this row, and the only one allowed to be
        bigger. Its centre is on the same axis as the arrows either side, so
        the gaps around it are equal by construction. Nothing plays while a
        render is reading the same files.
      -->
      <button
        type="button"
        class="size-9 inline-flex items-center justify-center shrink-0 rounded-full bg-accent text-accent-fg hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :disabled="props.exporting"
        :title="props.exporting ? 'Playback is paused while the export runs' : playing ? 'Pause' : 'Play'"
        :aria-label="playing ? 'Pause' : 'Play'"
        @click="playing ? emit('pause') : emit('play')"
      >
        <Icon :icon="playing ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="size-5 shrink-0 block" />
      </button>

      <button
        type="button"
        class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :title="`Forward ${SKIP_SECONDS} seconds`"
        :aria-label="`Forward ${SKIP_SECONDS} seconds`"
        @click="emit('skip-forward')"
      >
        <Icon icon="material-symbols:fast-forward" class="size-5 shrink-0 block" />
      </button>
    </div>

    <div class="flex items-center gap-4">
      <div class="text-sm font-mono text-muted-700">
        {{ formatTime(currentTime) }} <span class="text-muted-400">/</span> {{ formatTime(duration) }}
      </div>

      <div class="w-px h-5 bg-line-strong shrink-0" aria-hidden="true" />

      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
          title="Zoom out"
          aria-label="Zoom out"
          :disabled="zoom <= 0.25"
          @click="emit('zoom-out')"
        >
          <Icon icon="material-symbols:zoom-out" class="size-5 shrink-0 block" />
        </button>

        <!--
          The zoom floor is 25%, which is not far enough: a three clip, eighty
          second montage did not fit at the minimum, so there was no way to see
          the arrangement, which is the whole job of a montage. Every editor
          has this button; this one did not.
        -->
        <button
          type="button"
          class="h-8 w-14 inline-flex items-center justify-center shrink-0 rounded-md font-mono text-xs tabular-nums text-muted-500 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
          title="Fit the whole timeline on screen"
          @click="emit('zoom-fit')"
        >
          {{ Math.round(zoom * 100) }}%
        </button>

        <button
          type="button"
          class="size-8 inline-flex items-center justify-center shrink-0 rounded-md text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
          title="Zoom in"
          aria-label="Zoom in"
          :disabled="zoom >= 3"
          @click="emit('zoom-in')"
        >
          <Icon icon="material-symbols:zoom-in" class="size-5 shrink-0 block" />
        </button>
      </div>

      <div class="w-px h-5 bg-line-strong shrink-0" aria-hidden="true" />

      <!--
        A whole day dropped on the timeline is mostly dead air. This is the one
        button that turns it into a montage.
      -->
      <button
        type="button"
        class="h-8 px-2.5 inline-flex items-center gap-2 rounded-md text-sm font-medium text-muted-600 hover:bg-muted-100 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        title="Trim every clip to the moment its sound spikes"
        :disabled="props.trimmingHighlights || !props.clipCount"
        @click="emit('trim-to-highlights')"
      >
        <BaseSpinner v-if="trimmingHighlights" class="size-4 shrink-0 block" />
        <Icon v-else icon="material-symbols:auto-awesome" class="size-4 shrink-0 block" />
        <span class="hidden xl:inline">
          <!--
            "Trim to highlights" and the properties panel's "Trim to 19.90s-25.90s"
            sat in opposite corners with no stated relationship, and a reviewer
            could not tell whether this one applied to the selected clip, to all
            of them, or was simply the other one's twin. One word says which.
          -->
          {{ props.trimmingHighlights ? 'Listening…' : 'Trim all to highlights' }}
        </span>
      </button>

      <div class="w-px h-5 bg-line-strong shrink-0" aria-hidden="true" />

      <button
        type="button"
        class="h-8 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-accent-fg font-medium inline-flex items-center gap-2 text-sm outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden"
        :disabled="props.exporting"
        @click="emit('export')"
      >
        <div
          v-if="props.exporting && props.exportProgress !== undefined"
          class="absolute inset-0 bg-accent-hover/30 transition-all duration-300"
          :style="{ width: `${props.exportProgress}%` }"
        />
        <Icon
          :icon="props.exporting ? 'material-symbols:hourglass-top' : 'material-symbols:download'"
          class="text-lg relative z-10"
          :class="{ 'animate-spin': props.exporting }"
        />
        <span class="relative z-10">
          {{ props.exporting ? `Exporting ${props.exportProgress || 0}%` : 'Export' }}
        </span>
      </button>
    </div>
  </div>
</template>
