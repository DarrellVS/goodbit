<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';

/**
 * One row of the sidebar, and the reason every row is the same component.
 *
 * `01-sidebar-nav-icon-misaligned` and `03-games-list-counts-not-aligned` are
 * the same defect twice: a flex row of guesses, where each row decided its own
 * spacing, so the glyphs did not form a column and neither did the counts. The
 * games list had it worst, because `All` had no count and every other row did,
 * so the numbers sat at two different x positions in one list.
 *
 * So a row is a grid with three named columns, and every row in both lists
 * uses this one. A glyph always occupies its 16px box whether or not there is
 * a glyph; a count always occupies its column whether or not there is a count.
 * Nothing can drift, because nothing is positioned.
 *
 * The active marker is a hairline rule at the sidebar's left edge, absolutely
 * positioned, so it takes no width in flow. A filled pill was tried and it is
 * the loudest thing on a page whose whole subject is elsewhere. Weight and a
 * rule say the same thing at a fraction of the volume.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    /** An Iconify name. Omit for a row that draws its own glyph in the slot. */
    icon?: string;
    /** Where this row goes. Omit and it is a button that emits `select`. */
    to?: string;
    /** The route matches exactly, or the caller decides for a non-route row. */
    active?: boolean;
    /** A number about the row. Right-aligned, mono, tabular. */
    count?: number;
    disabled?: boolean;
    title?: string;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{ (e: 'select'): void }>();

const tag = computed(() => (props.to ? RouterLink : 'button'));

function onClick(): void {
  if (!props.disabled && !props.to) emit('select');
}
</script>

<template>
  <component
    :is="tag"
    :to="to"
    :type="to ? undefined : 'button'"
    :title="title"
    :aria-current="active ? 'page' : undefined"
    class="group relative grid grid-cols-[1rem_1fr_auto] items-center gap-2.5 w-full h-9 pl-4 pr-3 rounded-md text-left outline-none focus-visible:focus-ring transition-colors duration-150"
    :class="[
      active ? 'text-foreground font-medium' : 'text-muted-600',
      disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted-100 hover:text-foreground',
    ]"
    @click="onClick"
  >
    <!--
      The rule, not a pill. Absolute, so an active row is exactly as wide as
      an inactive one and the labels down the list do not move by a pixel.
    -->
    <span
      v-if="active"
      aria-hidden="true"
      class="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"
    />

    <!-- The glyph's box exists whether or not there is a glyph in it. -->
    <span class="size-4 inline-flex items-center justify-center shrink-0">
      <slot name="icon">
        <Icon v-if="icon" :icon="icon" class="size-4 shrink-0 block" />
      </slot>
    </span>

    <span class="truncate text-sm">{{ label }}</span>

    <!--
      The trailing column. A count and whatever the row wants to swap in for
      it on hover occupy the same slot, so the row's width never changes.
    -->
    <span class="justify-self-end min-w-6 flex items-center justify-end">
      <slot name="trailing">
        <span v-if="count !== undefined" class="font-mono text-xs tabular-nums text-muted-400">
          {{ count }}
        </span>
      </slot>
    </span>
  </component>
</template>
