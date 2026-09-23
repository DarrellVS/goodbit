<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { FOCUS_RING, MOTION } from '@renderer/components/Base/geometry';
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
  /**
   * Off means the row cannot be picked at all. "Most opened" is there to be
   * read, not cleaned up: offering to unpublish the links people actually watch
   * put a checkbox on the one list where pressing it is the wrong idea.
   */
  selectable?: boolean;
}

const props = withDefaults(defineProps<Props>(), { selectable: true });
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
  // Words rather than a dash or a zero: a dash is not allowed anywhere in this
  // app's UI, and a zero would claim nobody watched it.
  if (views == null) return { label: 'n/a', hint: 'not counted yet' };
  if (views === 0) return { label: '0', hint: 'never opened' };
  return {
    label: String(views),
    hint: props.clip.publisherLastViewedAt
      ? `last opened ${formatRelativeTime(props.clip.publisherLastViewedAt)}`
      : '',
  };
});
</script>

<template>
  <!--
    A label when it can be picked, so pressing anywhere on the row picks it,
    and a plain row when it cannot. The checkbox is the app's own drawing over
    a visually hidden input: a native one is painted by Chromium in white on
    the dark palette and matched nothing else on the screen.
  -->
  <component
    :is="selectable ? 'label' : 'div'"
    :class="[
      'grid items-center gap-3 px-2 py-2 rounded-md',
      selectable ? 'grid-cols-[1.25rem_4rem_1fr_auto_auto] cursor-pointer' : 'grid-cols-[4rem_1fr_auto_auto]',
      MOTION,
      selected ? 'bg-accent-sunk' : selectable ? 'hover:bg-muted-50' : '',
    ]"
  >
    <span v-if="selectable" class="relative inline-flex size-5 items-center justify-center">
      <input
        type="checkbox"
        :class="['peer absolute inset-0 opacity-0 cursor-pointer', FOCUS_RING]"
        :checked="selected"
        :aria-label="`Select ${title}`"
        @change="emit('toggle')"
      />
      <Icon
        :icon="selected ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'"
        :class="[
          'size-5 block pointer-events-none rounded-sm peer-focus-visible:focus-ring',
          selected ? 'text-accent' : 'text-muted-400',
        ]"
      />
    </span>

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

    <div class="w-36 text-right">
      <div class="font-mono text-sm tabular-nums text-foreground">{{ watched.label }}</div>
      <div class="text-[11px] text-muted-400">{{ watched.hint }}</div>
    </div>
  </component>
</template>
