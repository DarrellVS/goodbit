<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTime } from '@renderer/utils/timeFormat';
import type { TimelineAudio } from '@renderer/types/editor';

interface Props {
  item: TimelineAudio;
}

interface Emits {
  (e: 'update', updates: Partial<Pick<TimelineAudio, 'volume' | 'muted' | 'fadeIn' | 'fadeOut'>>): void;
  (e: 'remove'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/** Fades cannot overlap, so each is capped at what the other leaves. */
const maxFadeIn = computed(() => Math.max(0, props.item.duration - props.item.fadeOut));
const maxFadeOut = computed(() => Math.max(0, props.item.duration - props.item.fadeIn));

const volumePercent = computed(() => Math.round(props.item.volume * 100));

/** Volume in dB reads truer to the ear than a percentage of amplitude. */
const volumeDb = computed(() => {
  if (props.item.volume <= 0) return '−∞';
  const db = 20 * Math.log10(props.item.volume);
  return `${db > 0 ? '+' : ''}${db.toFixed(1)}`;
});

function setVolume(percent: number): void {
  emit('update', { volume: percent / 100 });
}

function setFadeIn(seconds: number): void {
  emit('update', { fadeIn: seconds });
}

function setFadeOut(seconds: number): void {
  emit('update', { fadeOut: seconds });
}

function applyFadePreset(seconds: number): void {
  const capped = Math.min(seconds, props.item.duration / 2);
  emit('update', { fadeIn: capped });
  emit('update', { fadeOut: capped });
}
</script>

<template>
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
    <div class="shrink-0 px-4 py-3 bg-accent/4 border-b border-border">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Icon icon="material-symbols:tune" class="text-accent-ink" />
        Track Properties
      </h3>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
    <div class="flex items-start gap-2">
      <div class="w-9 h-9 rounded-lg bg-linear-to-br from-accent to-accent-hover flex items-center justify-center shrink-0">
        <Icon icon="material-symbols:music-note" class="text-card" />
      </div>
      <div class="min-w-0">
        <div class="text-sm font-semibold text-foreground line-clamp-2 leading-tight">{{ item.name }}</div>
        <div class="text-[10px] text-muted-500 font-mono mt-0.5">
          starts at {{ formatTime(item.startTime) }}
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <label class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center justify-between">
        <span class="flex items-center gap-1">
          <Icon icon="material-symbols:volume-up" class="text-accent-ink" />
          Level
        </span>
        <span class="text-foreground font-mono text-sm">{{ volumePercent }}% · {{ volumeDb }} dB</span>
      </label>
      <input
        type="range"
        min="0"
        max="100"
        :value="volumePercent"
        class="w-full h-2 bg-accent/16 rounded-lg appearance-none cursor-pointer slider-thumb"
        @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
      />
      <div class="flex gap-1">
        <button
          v-for="preset in [15, 25, 35, 50, 100]"
          :key="preset"
          class="flex-1 py-1 rounded-md text-[10px] font-medium border transition-colors"
          :class="volumePercent === preset
            ? 'bg-accent text-accent-fg border-accent'
            : 'bg-card/80 text-muted-700 border-border hover:border-accent'"
          @click="setVolume(preset)"
        >
          {{ preset }}%
        </button>
      </div>
    </div>

    <div class="space-y-3">
      <div class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
        <Icon icon="material-symbols:gradient" class="text-accent-ink" />
        Fades
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between text-[11px] text-muted-600">
          <span>Fade in</span>
          <span class="font-mono text-foreground">{{ item.fadeIn.toFixed(1) }}s</span>
        </div>
        <input
          type="range"
          min="0"
          :max="Math.max(0.1, maxFadeIn)"
          step="0.1"
          :value="item.fadeIn"
          class="w-full h-2 bg-accent/16 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="setFadeIn(($event.target as HTMLInputElement).valueAsNumber)"
        />
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between text-[11px] text-muted-600">
          <span>Fade out</span>
          <span class="font-mono text-foreground">{{ item.fadeOut.toFixed(1) }}s</span>
        </div>
        <input
          type="range"
          min="0"
          :max="Math.max(0.1, maxFadeOut)"
          step="0.1"
          :value="item.fadeOut"
          class="w-full h-2 bg-accent/16 rounded-lg appearance-none cursor-pointer slider-thumb"
          @input="setFadeOut(($event.target as HTMLInputElement).valueAsNumber)"
        />
      </div>

      <div class="flex gap-1">
        <button
          v-for="preset in [0, 1, 2, 4]"
          :key="preset"
          class="flex-1 py-1 rounded-md text-[10px] font-medium border bg-card/80 text-muted-700 border-border hover:border-accent transition-colors"
          @click="applyFadePreset(preset)"
        >
          {{ preset === 0 ? 'none' : `${preset}s` }}
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <button
        class="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border"
        :class="item.muted
          ? 'bg-danger/20 hover:bg-danger/30 text-danger-ink border-danger/40'
          : 'bg-card/80 hover:bg-card text-muted-700 border-border'"
        @click="emit('update', { muted: !item.muted })"
      >
        <Icon :icon="item.muted ? 'material-symbols:volume-off' : 'material-symbols:volume-up'" class="text-lg" />
        {{ item.muted ? 'Unmute Track' : 'Mute Track' }}
      </button>
    </div>

    <div class="pt-4 border-t border-border space-y-2">
      <div class="text-xs font-semibold text-muted-700 uppercase tracking-wide flex items-center gap-1">
        <Icon icon="material-symbols:info" class="text-accent-ink" />
        Track Info
      </div>
      <div class="space-y-1.5 text-xs bg-card/80 rounded-lg p-3 border border-border">
        <div class="flex justify-between">
          <span class="text-muted-600">Original:</span>
          <span class="font-mono text-foreground">{{ formatTime(item.originalDuration) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-600">Used:</span>
          <span class="font-mono text-foreground">{{ formatTime(item.duration) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-600">Trim Start:</span>
          <span class="font-mono text-foreground">{{ formatTime(item.trimStart) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-600">Trim End:</span>
          <span class="font-mono text-foreground">{{ formatTime(item.trimEnd) }}</span>
        </div>
      </div>
    </div>

      <button
        class="w-full px-4 py-2.5 rounded-lg text-sm font-medium border border-danger/40 bg-danger/10 hover:bg-danger/20 text-danger-ink transition-colors flex items-center justify-center gap-2"
        @click="emit('remove')"
      >
        <Icon icon="material-symbols:delete-outline" class="text-lg" />
        Remove from timeline
      </button>
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
