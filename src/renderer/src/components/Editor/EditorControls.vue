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
  <div class="flex items-center justify-between px-6 py-3 bg-card/60 backdrop-blur-sm border-t border-border">
    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canUndo"
        title="Undo"
        aria-label="Undo"
        @click="emit('undo')"
      >
        <Icon icon="material-symbols:undo" class="text-lg text-muted-700" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!canRedo"
        title="Redo"
        aria-label="Redo"
        @click="emit('redo')"
      >
        <Icon icon="material-symbols:redo" class="text-lg text-muted-700" />
      </button>
      
      <div class="w-px h-6 bg-muted-300 mx-2" />
      
      <button
        class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors"
        :title="`Back ${SKIP_SECONDS} seconds`"
        :aria-label="`Back ${SKIP_SECONDS} seconds`"
        @click="emit('skip-backward')"
      >
        <Icon icon="material-symbols:fast-rewind" class="text-lg text-muted-700" />
      </button>
      
      <!-- Nothing plays while a render is reading the same files. -->
      <button
        class="p-2.5 rounded-lg bg-linear-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent-hover transition-all shadow-lg shadow-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="props.exporting"
        :title="props.exporting ? 'Playback is paused while the export runs' : playing ? 'Pause' : 'Play'"
        :aria-label="playing ? 'Pause' : 'Play'"
        @click="playing ? emit('pause') : emit('play')"
      >
        <Icon :icon="playing ? 'material-symbols:pause' : 'material-symbols:play-arrow'" class="text-xl text-card" />
      </button>
      
      <button
        class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors"
        :title="`Forward ${SKIP_SECONDS} seconds`"
        :aria-label="`Forward ${SKIP_SECONDS} seconds`"
        @click="emit('skip-forward')"
      >
        <Icon icon="material-symbols:fast-forward" class="text-lg text-muted-700" />
      </button>
    </div>

    <div class="flex items-center gap-4">
      <div class="text-sm font-mono text-muted-700">
        {{ formatTime(currentTime) }} <span class="text-muted-400">/</span> {{ formatTime(duration) }}
      </div>
      
      <div class="w-px h-6 bg-muted-300" />
      
      <div class="flex items-center gap-2">
        <button
          class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors disabled:opacity-40"
          title="Zoom out"
          :disabled="zoom <= 0.25"
          @click="emit('zoom-out')"
        >
          <Icon icon="material-symbols:zoom-out" class="text-lg text-muted-700" />
        </button>
        
        <!--
          The zoom floor is 25%, which is not far enough: a three clip, eighty
          second montage did not fit at the minimum, so there was no way to see
          the arrangement, which is the whole job of a montage. Every editor
          has this button; this one did not.
        -->
        <button
          class="text-xs font-medium text-muted-600 w-12 text-center rounded-md py-1 hover:bg-muted-100 hover:text-accent-ink transition-colors"
          title="Fit the whole timeline on screen"
          @click="emit('zoom-fit')"
        >
          {{ Math.round(zoom * 100) }}%
        </button>
        
        <button
          class="p-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors disabled:opacity-40"
          title="Zoom in"
          :disabled="zoom >= 3"
          @click="emit('zoom-in')"
        >
          <Icon icon="material-symbols:zoom-in" class="text-lg text-muted-700" />
        </button>
      </div>
      
      <div class="w-px h-6 bg-muted-300" />

      <!--
        A whole day dropped on the timeline is mostly dead air. This is the one
        button that turns it into a montage.
      -->
      <button
        class="px-3 py-2 rounded-lg bg-muted-100 hover:bg-muted-200 transition-colors flex items-center gap-1.5 text-sm font-medium text-muted-700 disabled:opacity-40 disabled:cursor-not-allowed"
        title="Trim every clip to the moment its sound spikes"
        :disabled="props.trimmingHighlights || !props.clipCount"
        @click="emit('trim-to-highlights')"
      >
        <BaseSpinner v-if="trimmingHighlights" class="text-lg" />
        <Icon v-else icon="material-symbols:auto-awesome" class="text-lg" />
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

      <div class="w-px h-6 bg-muted-300" />

      <button
        class="px-4 py-2 rounded-lg bg-linear-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent-hover transition-all font-medium shadow-lg shadow-accent/20 flex items-center gap-2 text-sm text-card disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
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
