<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { TimelineClip } from '@renderer/types/editor';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import ClipAudioSection from '@renderer/components/ClipDetail/ClipAudioSection.vue';
import { useClipAudio } from '@renderer/composables/clips/useClipAudio';
import {
  hasSelection,
  isMutedIn,
  soloed,
  volumeIn,
  withMuteToggled,
  withVolume,
} from '@renderer/utils/clipAudioSelection';

interface Props {
  clip: TimelineClip | null;
  /** Where this clip sits, so the move buttons know when to stop. */
  position?: { index: number; total: number };
  /** What the audio analysis found in this clip, once it has been asked. */
  highlight?: { start: number; end: number } | null;
  highlightLoading?: boolean;
}

interface Emits {
  (e: 'update', updates: Partial<TimelineClip>): void;
  (e: 'trim-to-highlight'): void;
  /** Swap with the neighbour. The only findable way to change the order. */
  (e: 'reorder', direction: 'earlier' | 'later'): void;
  (e: 'remove'): void;
}

const props = withDefaults(defineProps<Props>(), {
  highlight: null,
  highlightLoading: false,
  position: undefined,
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

/**
 * The clip's own tracks, for the block below the fader.
 *
 * Only the list is borrowed from the composable. The decisions live on the
 * timeline clip, so that they are saved with the draft and survive the panel
 * being closed, which is the difference between this and the trimmer: there a
 * selection lasts as long as the screen, here it is part of the edit.
 */
const { tracks: audioTracks, loading: audioLoading } = useClipAudio(
  computed(() => props.clip?.clipId ?? 0),
);

const audioChanged = computed(() => hasSelection(props.clip?.audio));

const audioIsMuted = (index: number): boolean => isMutedIn(props.clip?.audio, index);
const audioVolumeOf = (index: number): number => volumeIn(props.clip?.audio, index);

function toggleAudioMute(index: number): void {
  emit('update', { audio: withMuteToggled(props.clip?.audio, index) });
}

function setAudioVolume(index: number, volume: number): void {
  emit('update', { audio: withVolume(props.clip?.audio, index, volume) });
}

function soloAudio(index: number): void {
  emit('update', { audio: soloed(props.clip?.audio, audioTracks.value, index) });
}

function resetAudio(): void {
  emit('update', { audio: [] });
}

function getVolumePercentage(volume: number): number {
  return Math.round(volume * 100);
}

function volumeToDecimal(percentage: number): number {
  return percentage / 100;
}
</script>

<template>
  <!-- No `overflow-hidden`: the body scrolls and clips for itself. -->
  <div class="flex flex-col h-full border-l border-border">
    <div class="shrink-0 h-11 px-4 flex items-center border-b border-border">
      <h3 class="text-sm font-medium text-muted-600">Clip Properties</h3>
    </div>

    <div v-if="!clip" class="flex-1 flex items-center justify-center text-muted-500 text-sm">
      <div class="text-center">
        <div class="mb-3 flex items-center justify-center">
          <Icon icon="material-symbols:info" class="text-2xl text-muted-500" />
        </div>
        <p class="font-medium text-muted-700">No clip selected</p>
        <p class="text-xs mt-1 text-muted-500">Click a clip to edit</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto scroll-p-1.5 p-4 space-y-4">
      <!--
        The same listen the Trim page does, offered where a montage is actually
        assembled: one button puts the clip on its loudest ten seconds.
      -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:auto-awesome" class="text-accent-ink" />
          Highlight
        </label>

        <div
          v-if="highlightLoading"
          class="flex items-center gap-2 px-3 py-2.5 rounded-md bg-muted-50 text-xs text-muted-600"
        >
          <BaseSpinner class="text-accent-ink text-base" />
          Listening to this clip…
        </div>

        <button
          v-else-if="highlight"
          class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border disabled:cursor-default"
          :class="onHighlight
            ? 'bg-accent/10 text-accent-ink border-accent/40'
            : 'bg-card/80 hover:bg-card text-muted-700 border-border hover:border-accent/50'"
          :disabled="onHighlight"
          @click="emit('trim-to-highlight')"
        >
          <Icon
            :icon="onHighlight ? 'material-symbols:check-circle' : 'material-symbols:bolt'"
            class="text-lg"
          />
          {{ onHighlight ? 'Trimmed to the highlight' : `Trim to ${formatDuration(highlight.start)}–${formatDuration(highlight.end)}` }}
        </button>

        <p v-else class="px-3 py-2.5 rounded-md bg-muted-50 text-xs text-muted-600">
          The sound of this clip never really changes, so there is nothing to point at.
        </p>
      </div>

      <!--
        Volume and mute are one concern, so they are one block.

        They were two headings, `VOLUME` and `AUDIO`, with `AUDIO` holding
        nothing but the mute button under a crossed-speaker icon that was drawn
        the same whether or not the clip was muted. Worse, a muted clip still
        read `100%` with the slider hard right, so the two controls disagreed
        on screen about whether you would hear anything.
      -->
      <div class="space-y-2 pt-4 border-t border-border">
        <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center justify-between">
          <span class="flex items-center gap-1">
            <Icon
              :icon="clip.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'"
              class="text-muted-500"
            />
            Volume
          </span>
          <span class="font-mono text-sm" :class="clip.muted ? 'text-muted-400' : 'text-foreground'">
            {{ clip.muted ? 'Muted' : `${getVolumePercentage(clip.volume)}%` }}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="100"
          :value="getVolumePercentage(clip.volume)"
          :disabled="clip.muted"
          class="w-full h-2 bg-accent/16 rounded-lg appearance-none cursor-pointer slider-thumb disabled:opacity-40 disabled:cursor-not-allowed"
          @input="emit('update', { volume: volumeToDecimal(($event.target as HTMLInputElement).valueAsNumber) })"
        />
      </div>

      <div class="space-y-2 -mt-1">
        <button
          class="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border"
          :class="clip.muted
            ? 'bg-danger/20 hover:bg-danger/30 text-danger-ink border-danger/40'
            : 'bg-card/80 hover:bg-card text-muted-700 border-border'"
          @click="emit('update', { muted: !clip.muted })"
        >
          <Icon :icon="clip.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'" class="text-lg" />
          {{ clip.muted ? 'Unmute Clip' : 'Mute Clip' }}
        </button>
      </div>

      <!--
        The tracks inside the clip, under the fader that turns all of them down
        together. Only a recording made through GoodBit's multi-track OBS setup
        has more than one, so on most clips this is one row.
      -->
      <ClipAudioSection
        v-if="audioTracks.length > 1"
        class="pt-4 border-t border-border"
        flush
        :tracks="audioTracks"
        :loading="audioLoading"
        :changed="audioChanged"
        :is-muted="audioIsMuted"
        :volume-of="audioVolumeOf"
        :disabled="clip.muted"
        @toggle-mute="toggleAudioMute"
        @set-volume="setAudioVolume"
        @solo="soloAudio"
        @reset="resetAudio"
      />

      <!--
        Order and removal, where you can see them.

        Reordering had no route at all: no grip, no hover state, no context
        menu, no keyboard, and nothing saying clips could be dragged. Removal
        worked on the Delete key and nowhere else, so it was found by guessing.
        Both are the ordinary business of a montage, so both are buttons.
      -->
      <div class="pt-4 border-t border-border space-y-2">
        <div class="text-xs font-semibold text-muted-700 uppercase tracking-wide">
          Order
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex-1 h-8 rounded-lg bg-muted-100 hover:bg-muted-200 text-xs font-medium text-muted-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
            :disabled="!position || position.index === 0"
            title="Swap with the clip before this one"
            @click="emit('reorder', 'earlier')"
          >
            <Icon icon="material-symbols:arrow-back" class="text-base" />
            Earlier
          </button>
          <button
            class="flex-1 h-8 rounded-lg bg-muted-100 hover:bg-muted-200 text-xs font-medium text-muted-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
            :disabled="!position || position.index >= position.total - 1"
            title="Swap with the clip after this one"
            @click="emit('reorder', 'later')"
          >
            Later
            <Icon icon="material-symbols:arrow-forward" class="text-base" />
          </button>
        </div>
        <button
          class="w-full h-8 rounded-lg text-xs font-medium text-danger-ink hover:bg-danger/10 transition-colors inline-flex items-center justify-center gap-1.5"
          title="Take this clip off the timeline"
          @click="emit('remove')"
        >
          <Icon icon="material-symbols:delete-outline" class="text-base" />
          Remove from timeline
        </button>
      </div>

      <div class="pt-4 border-t border-border space-y-2">
        <div class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
          <Icon icon="material-symbols:info" class="text-muted-500" />
          Clip Info
        </div>
        <div class="space-y-1.5 text-xs bg-muted-50 rounded-md p-3">
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
  background: hsl(var(--accent));
  cursor: pointer;
  border: 2px solid hsl(var(--card));
}

.slider-thumb::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--accent));
  cursor: pointer;
  border: 2px solid hsl(var(--card));
}
</style>
