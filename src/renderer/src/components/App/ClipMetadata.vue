<script setup lang="ts">
import { ref, computed } from 'vue';
import { useFormat } from '../../composables/useFormat';
import { useConfiguration } from '../../composables/useConfiguration';
import { formatRelativeTime, formatExactDate } from '../../helpers/dateFormat';

/**
 * When the clip was recorded, which is the file's own date.
 *
 * Not when GoodBit first saw it. Those are the same number for a recording
 * that arrives while the app is running and wildly different for a library
 * that existed before it was installed, where every clip would otherwise be
 * dated the afternoon of the install.
 */
interface Props {
  sizeBytes: number;
  /**
   * How long the clip is. The first thing anyone wants when deciding what to
   * cut, and it used to appear nowhere in the library: the tile showed only a
   * file size, which nobody has ever needed to know about a recording.
   */
  durationSec?: number | null;
  recordedAt?: string;
}

const props = defineProps<Props>();
const config = useConfiguration();
const { formatBytes } = useFormat();
const showExactDate = ref(false);

const length = computed(() => {
  const seconds = props.durationSec;
  if (!seconds || seconds <= 0) return '';
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const two = (n: number): string => String(n).padStart(2, '0');
  return hours ? `${hours}:${two(mins)}:${two(secs)}` : `${mins}:${two(secs)}`;
});

const displayDate = computed(() => {
  // No date is no date. Falling back to now would put a confident, wrong
  // "just now" on a clip whose age is simply not known.
  if (!props.recordedAt) return '';
  if (config.public.value.dateFormat === 'absolute' || showExactDate.value) {
    return formatExactDate(props.recordedAt);
  }
  return formatRelativeTime(props.recordedAt);
});
</script>

<template>
  <div v-if="config.public.value.showMetadata" class="flex items-center justify-between gap-2 text-xs text-muted-500">
    <span class="flex items-center gap-2 min-w-0">
      <span v-if="length" class="tabular-nums text-foreground/70">{{ length }}</span>
      <span v-if="length" aria-hidden="true">·</span>
      <span>{{ formatBytes(sizeBytes) }}</span>
    </span>
    <time 
      :datetime="recordedAt"
      class="cursor-default transition-colors hover:text-orange-500"
      @mouseenter="showExactDate = true"
      @mouseleave="showExactDate = false"
    >
      {{ displayDate }}
    </time>
  </div>
</template>

