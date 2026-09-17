<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { TimelineClip } from '@renderer/types/editor';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  clip: TimelineClip | null;
  /** What the audio analysis found in this clip, once it has been asked. */
  highlight?: { start: number; end: number } | null;
  highlightLoading?: boolean;
}

interface Emits {
  (e: 'update', updates: Partial<TimelineClip>): void;
  (e: 'trim-to-highlight'): void;
}

const props = withDefaults(defineProps<Props>(), {
  highlight: null,
  highlightLoading: false,
});
const emit = defineEmits<Emits>();

/** True once the clip already sits on its highlight, within a rounding error. */
const onHighlight = computed(() => {
  if (!props.clip || !props.highlight) return false;
  return (
    Math.abs(props.clip.trimStart - props.highlight.start) < 0.15 &&
    Math.abs(props.clip.trimEnd - props.highlight.end) < 0.15
  );
});

function formatDuration(seconds: number): string {
  return seconds.toFixed(2) + 's';
}

function getVolumePercentage(volume: number): number {
  return Math.round(volume * 100);
}

function volumeToDecimal(percentage: number): number {
  return percentage / 100;
}
</script>

<template>
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
    <div class="shrink-0 px-4 py-3 bg-orange-500/4 border-b border-border">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Icon icon="material-symbols:tune" class="text-orange-500" />
        Clip Properties
      </h3>
    </div>

    <div v-if="!clip" class="flex-1 flex items-center justify-center text-muted-500 text-sm">
      <div class="text-center">
        <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-orange-500/16 flex items-center justify-center">
          <Icon icon="material-symbols:info" class="text-2xl text-orange-400" />
        </div>
        <p class="font-medium text-muted-700">No clip selected</p>
        <p class="text-xs mt-1 text-muted-500">Click a clip to edit</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-4 space-y-4">
      <!--
        The same listen the Trim page does, offered where a montage is actually
        assembled: one button puts the clip on its loudest ten seconds.
      -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:auto-awesome" class="text-orange-500" />
          Highlight
        </label>

        <div
          v-if="highlightLoading"
          class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card/80 border border-border text-xs text-muted-600"
        >
          <BaseSpinner class="text-orange-400 text-base" />
          Listening to this clip…
        </div>

        <button
          v-else-if="highlight"
          class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border disabled:cursor-default"
          :class="onHighlight
            ? 'bg-orange-500/10 text-orange-700 border-orange-500/40'
            : 'bg-card/80 hover:bg-card text-muted-700 border-border hover:border-orange-500/50'"
          :disabled="onHighlight"
          @click="emit('trim-to-highlight')"
        >
          <Icon
            :icon="onHighlight ? 'material-symbols:check-circle' : 'material-symbols:bolt'"
            class="text-lg"
          />
          {{ onHighlight ? 'Trimmed to the highlight' : `Trim to ${formatDuration(highlight.start)}–${formatDuration(highlight.end)}` }}
        </button>

        <p v-else class="px-3 py-2.5 rounded-lg bg-card/80 border border-border text-xs text-muted-600">
          The sound of this clip never really changes, so there is nothing to point at.
        </p>
      </div>

      <div class="space-y-2 pt-4 border-t border-border">
        <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center justify-between">
          <span class="flex items-center gap-1">
            <Icon icon="material-symbols:volume-up" class="text-orange-500" />
            Volume
          </span>
          <span class="text-foreground font-mono text-sm">{{ getVolumePercentage(clip.volume) }}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          :value="getVolumePercentage(clip.volume)"
          class="w-full h-2 bg-orange-500/16 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="emit('update', { volume: volumeToDecimal(($event.target as HTMLInputElement).valueAsNumber) })"
        />
      </div>

      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:volume-off" class="text-orange-500" />
          Audio
        </label>
        <button
          class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border"
          :class="clip.muted 
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-600 border-red-500/40' 
            : 'bg-card/80 hover:bg-card text-muted-700 border-border'"
          @click="emit('update', { muted: !clip.muted })"
        >
          <Icon :icon="clip.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'" class="text-lg" />
          {{ clip.muted ? 'Unmute Clip' : 'Mute Clip' }}
        </button>
      </div>

      <div class="pt-4 border-t border-border space-y-2">
        <div class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:info" class="text-orange-500" />
          Clip Info
        </div>
        <div class="space-y-1.5 text-xs bg-card/80 rounded-lg p-3 border border-border">
          <div class="flex justify-between">
            <span class="text-muted-600">Original:</span>
            <span class="font-mono text-foreground">{{ formatDuration(clip.originalDuration) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-600">Current:</span>
            <span class="font-mono text-foreground">{{ formatDuration(clip.duration) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-600">Trim Start:</span>
            <span class="font-mono text-foreground">{{ formatDuration(clip.trimStart) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-600">Trim End:</span>
            <span class="font-mono text-foreground">{{ formatDuration(clip.trimEnd) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider-thumb::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
  border: 2px solid white;
}

.slider-thumb::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(135deg, #f97316, #ea580c);
  cursor: pointer;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.5);
}
</style>
