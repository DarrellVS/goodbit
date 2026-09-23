<script setup lang="ts">
import BaseChip from '@renderer/components/Base/BaseChip.vue';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { ICON_BOX, FOCUS_RING, MOTION } from '@renderer/components/Base/geometry';
import { thumbnailUrl } from '@renderer/utils/mediaUrl';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import type { Clip } from '@renderer/types/clip';

/**
 * One clip, small, on a screen whose verb is delete.
 *
 * Not `Library/ClipCard.vue`. That card is for browsing: it previews on hover,
 * it drags, it stars, it opens a menu, and every one of those is a way to
 * touch a clip that is about to be destroyed. What this screen needs is the
 * picture, the size, the age and a way to say yes or no, which is a different
 * component rather than the same one with six things disabled.
 *
 * The size is the loudest number on it, deliberately: it is the reason
 * somebody is looking at this list.
 */
interface Props {
  clip: Clip;
  selected?: boolean;
  /** Draws it as the one being kept rather than as one being chosen. */
  keeper?: boolean;
  /** What the tile does when pressed. "select" ticks it, "keep" saves it. */
  mode?: 'select' | 'keep';
}

const props = withDefaults(defineProps<Props>(), { mode: 'select' });
const emit = defineEmits<{ (e: 'toggle'): void }>();

const { formatBytes } = useFormat();

const length = computed(() => {
  const seconds = props.clip.durationSec;
  if (!seconds || seconds <= 0) return '';
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
});

const age = computed(() =>
  formatRelativeTime(props.clip.recordedAt ?? props.clip.fileModifiedAt),
);

const title = computed(() => props.clip.displayName?.trim() || props.clip.filename);
</script>

<template>
  <button
    type="button"
    :class="[
      'group relative block w-full text-left rounded-md overflow-hidden border border-border',
      FOCUS_RING,
      MOTION,
      /*
       * Picked is a ring, painted as a shadow outside the box, rather than a
       * border colour: a one pixel hairline turning red was the only sign a
       * tile had been picked, and across a grid of forty it did not read.
       */
      keeper
        ? 'ring-2 ring-accent'
        : selected
          ? 'ring-2 ring-danger'
          : 'hover:border-line-strong',
    ]"
    :aria-pressed="mode === 'keep' ? keeper : selected"
    @click="emit('toggle')"
  >
    <div class="aspect-21/9 bg-video-bed relative">
      <!--
        The ones about to go are dimmed, so the one being kept is the picture
        the eye lands on. Opacity only, which is the one property allowed to
        move with a state.
      -->
      <img
        :src="thumbnailUrl(clip.id)"
        :alt="title"
        :class="[
          'size-full object-cover transition-opacity duration-150',
          mode === 'keep' && !keeper ? 'opacity-50' : '',
        ]"
      />

      <!--
        The one thing that reaches outside this machine. A published clip has a
        link somebody may already have shared, and no Recycle Bin covers that,
        so it is said on the tile rather than only in the question.
      -->
      <BaseChip
        v-if="clip.published"
        class="absolute top-1.5 right-1.5"
      >
        Published
      </BaseChip>

      <BaseChip
        v-if="length"
        numeric
        class="absolute bottom-1.5 right-1.5"
      >
        {{ length }}
      </BaseChip>

      <!--
        The state, over the picture, in a fixed box so nothing moves when it
        changes. Colour moves; geometry does not.
      -->
      <BaseChip
        v-if="mode === 'keep'"
        class="absolute top-1.5 left-1.5"
      >
        <Icon
          :icon="keeper ? 'material-symbols:check-circle' : 'material-symbols:delete-outline'"
          :class="ICON_BOX"
        />
        {{ keeper ? 'Keeping' : 'Deleting' }}
      </BaseChip>
      <!--
        On a scrim of its own. White on the frame vanished into every bright
        thumbnail, which is a lot of them: the box to press was the one thing on
        the tile that could not always be seen.
      -->
      <span
        v-else
        class="absolute top-1.5 left-1.5 inline-flex rounded-sm bg-scrim p-0.5"
      >
        <Icon
          :icon="
            selected ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'
          "
          :class="['size-5 block', selected ? 'text-danger' : 'text-on-video']"
        />
      </span>
    </div>

    <div class="px-2 py-1.5">
      <div class="truncate text-xs text-foreground">{{ title }}</div>
      <div class="flex items-center gap-1.5 font-mono text-[11px] text-muted-400">
        <span class="tabular-nums">{{ formatBytes(clip.sizeBytes) }}</span>
        <span aria-hidden="true">·</span>
        <span class="truncate">{{ age }}</span>
      </div>
    </div>
  </button>
</template>
