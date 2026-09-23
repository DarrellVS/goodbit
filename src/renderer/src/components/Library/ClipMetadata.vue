<script setup lang="ts">
import { ref, computed } from 'vue';
import { useConfiguration } from '@renderer/composables/app/useConfiguration';
import { formatRelativeTime, formatExactDate } from '@renderer/helpers/dateFormat';
import { useFormat } from '@renderer/composables/ui/useFormat';

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
   * The game, on the same line as the rest.
   *
   * It had a row to itself above this one, which made every card a two-part
   * meta block and gave the name of the folder the same weight as the clip's
   * own title.
   */
  game?: string;
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
  <!--
    One line: how long, which game, how long ago, how big.

    It was the duration and the file size on the left with the date pushed to
    the right edge, so each card carried a two-column layout of its own and a
    grid of forty drew a ragged column of dates down its right. The size is
    back, last on the line rather than in a column of its own, because a
    library on a filling drive is read by size and the tile was the only
    place that could answer it without opening every clip.
  -->
  <div
    v-if="config.public.value.showMetadata"
    class="flex items-center gap-1.5 min-w-0 font-mono text-xs text-muted-400"
  >
    <span v-if="length" class="shrink-0 tabular-nums">{{ length }}</span>
    <span v-if="length && game" aria-hidden="true" class="shrink-0">·</span>
    <span v-if="game" class="truncate">{{ game }}</span>
    <span v-if="displayDate" aria-hidden="true" class="shrink-0">·</span>
    <time
      v-if="displayDate"
      :datetime="recordedAt"
      class="shrink-0 cursor-default transition-colors duration-150 hover:text-foreground"
      @mouseenter="showExactDate = true"
      @mouseleave="showExactDate = false"
    >
      {{ displayDate }}
    </time>
    <span v-if="displayDate && sizeBytes" aria-hidden="true" class="shrink-0">·</span>
    <span v-if="sizeBytes" class="shrink-0 tabular-nums">{{ formatBytes(sizeBytes) }}</span>
  </div>
</template>

