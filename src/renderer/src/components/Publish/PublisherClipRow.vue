<script setup lang="ts">
import { computed } from 'vue';
import { MOTION } from '@renderer/components/Base/geometry';
import { thumbnailUrl } from '@renderer/utils/mediaUrl';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import type { Clip } from '@renderer/types/clip';

/**
 * One published clip, as a row.
 *
 * A grid rather than a flex row of guesses, so the picture, the name, the size
 * and the count each form a column whatever an individual row carries. The
 * numbers are mono, tabular and right-aligned with room for their largest
 * value, so a list does not shuffle sideways as the counts grow.
 */
interface Props {
  clip: Clip;
  selected?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'toggle'): void }>();

const { formatBytes } = useFormat();

const title = computed(() => props.clip.displayName?.trim() || props.clip.filename);

/**
 * What the count means, in words, because the number alone cannot say it.
 *
 * Null is "nobody has counted this", which happens on a publisher older than
 * the counter and on every clip before the first sync. Zero is "counting was
 * happening and nobody opened it". Printing both as `0` would be a lie in one
 * of the two cases.
 */
const watched = computed(() => {
  const views = props.clip.publisherViews;
  if (views == null) return { label: '—', hint: 'not counted yet' };
  if (views === 0) return { label: '0', hint: 'never opened' };
  return {
    label: String(views),
    hint: props.clip.publisherLastViewedAt
      ? `last ${formatRelativeTime(props.clip.publisherLastViewedAt)}`
      : '',
  };
});
</script>

<template>
  <label
    :class="[
      'grid grid-cols-[1.25rem_4rem_1fr_auto_auto] items-center gap-3 px-2 py-2 rounded-md cursor-pointer',
      MOTION,
      selected ? 'bg-accent-sunk' : 'hover:bg-muted-50',
    ]"
  >
    <input
      type="checkbox"
      class="size-4"
      :checked="selected"
      :aria-label="`Select ${title}`"
      @change="emit('toggle')"
    />

    <img
      :src="thumbnailUrl(clip.id)"
      :alt="title"
      class="aspect-21/9 w-16 rounded-sm object-cover bg-video-bed"
    />

    <div class="min-w-0">
      <div class="truncate text-sm text-foreground">{{ title }}</div>
      <div class="truncate text-xs text-muted-500">{{ clip.game }}</div>
    </div>

    <div class="w-20 text-right font-mono text-xs tabular-nums text-muted-400">
      {{ formatBytes(clip.sizeBytes) }}
    </div>

    <div class="w-28 text-right">
      <div class="font-mono text-sm tabular-nums text-foreground">{{ watched.label }}</div>
      <div class="text-[11px] text-muted-400">{{ watched.hint }}</div>
    </div>
  </label>
</template>
