<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import BaseChip from '@renderer/components/Base/BaseChip.vue';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import { viewCountFigure, viewCountLabel } from '@renderer/utils/viewCount';

interface Props {
  published?: boolean;
  /** How often the published copy has been opened. See `viewCountFigure`. */
  views?: number | null;
  lastViewedAt?: string | null;
}

const props = defineProps<Props>();

const figure = computed(() => (props.published ? viewCountFigure(props.views) : ''));
const label = computed(() => viewCountLabel(props.views));
const hint = computed(() =>
  props.lastViewedAt
    ? `${label.value}, last opened ${formatRelativeTime(props.lastViewedAt)}`
    : label.value,
);
</script>

<template>
  <!--
    Top right, and it stays there.

    It used to slide from `right-4` to `right-14` on hover, to clear a menu
    button that was in that corner. The tools are all at the bottom right now,
    so there is nothing to dodge, and a badge that moves when you point at the
    card is the layout-shift rule broken by animation.

    The view count is a chip beside it rather than a word on the metadata line
    under the title: a count only exists for a published clip, so it belongs
    with the thing that says the clip is published, and the line under the
    title was one fact too long with it.
  -->
  <div v-if="published" class="absolute top-2 right-2 z-10 flex items-center gap-1">
    <BaseChip>
      Published
    </BaseChip>
    <BaseChip
      v-if="figure"
      numeric
      data-testid="clip-view-count"
      :title="hint"
      :aria-label="label"
    >
      <Icon icon="material-symbols:visibility-outline" class="size-3 shrink-0 block" aria-hidden="true" />
      {{ figure }}
    </BaseChip>
  </div>
</template>
