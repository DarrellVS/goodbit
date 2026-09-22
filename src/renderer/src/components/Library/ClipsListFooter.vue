<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useLoadMoreWhenSeen } from '@renderer/composables/library/useLoadMoreWhenSeen';
import { pluralize } from '@renderer/utils/pluralize';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { ICON_BOX } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import { Icon } from '@iconify/vue';

/**
 * The end of a list that loads as you go.
 *
 * This replaces `ClipsPaginationControls.vue`, and a page bar was the wrong
 * control for a grid of pictures for three reasons: pressing Next puts the row
 * you were reading at the top of the screen, you lose your place in a way
 * scrolling never does, and a clip from three weeks ago is six presses away
 * instead of a flick of the wheel.
 *
 * Three things here are deliberate.
 *
 * **There is still a button.** An infinite list with only a scroll trigger is
 * unreachable by keyboard and invisible to a screen reader: nothing announces
 * that more exists, and nothing can ask for it without a pointer. The button is
 * the real control and the observer below is a convenience that presses it for
 * you. It is also the fallback when an `IntersectionObserver` never fires,
 * which happens when the container is shorter than its own content because a
 * filter left four clips in a window that fits twelve.
 *
 * **The trigger is `useLoadMoreWhenSeen`**, shared with the editor's clip
 * panel, and the reasoning for an observer rather than a scroll handler is
 * written down there.
 *
 * **And the end says so.** A grid that simply stops reads as a grid that
 * failed to load, which is the one thing the page bar did well: it always said
 * how many there were in total.
 */
interface Props {
  /** A page is in flight. Any page: the first one, or the next. */
  loading: boolean;
  /** Whether the server has more than what is on screen. */
  hasMore: boolean;
  /** How many are on screen. */
  loaded: number;
  /** How many the current filters match. */
  total: number;
}

interface Emits {
  (e: 'load-more'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/*
 * The first page is the grid's own business.
 *
 * While nothing is loaded there is no list to be at the end of, and a spinner
 * here under the empty state would be a second answer to the same question.
 */
const started = computed(() => props.loaded > 0);

const sentinel = useLoadMoreWhenSeen({
  loading: toRef(props, 'loading'),
  hasMore: toRef(props, 'hasMore'),
  load: () => emit('load-more'),
});
</script>

<template>
  <div v-if="started" class="pt-2">
<!--
      One pixel tall and pulled back out of the flow, so it cannot move
      anything. It needs the pixel: a zero-area target reports an intersection
      ratio of zero for ever and is never seen.
    -->
    <div ref="sentinel" class="h-px -mb-px" aria-hidden="true"></div>

    <div v-if="hasMore" class="flex flex-col items-center gap-3 py-6">
      <BaseButton
        :disabled="loading"
        @click="emit('load-more')"
      >
        <BaseSpinner v-if="loading" :class="ICON_BOX" />
        <Icon v-else icon="material-symbols:expand-more" :class="ICON_BOX" />
        {{ loading ? 'Loading' : 'Load more' }}
      </BaseButton>

      <p class="font-mono text-xs tabular-nums text-muted-400">
        {{ loaded }} of {{ total }}
      </p>
    </div>

    <!--
      The end, said plainly. This is the one thing the page bar did well: it
      always told you how many there were altogether.
    -->
    <p v-else class="py-8 text-center text-sm text-muted-400">
      That is all {{ total }} {{ pluralize(total, 'clip') }}.
    </p>
  </div>
</template>
