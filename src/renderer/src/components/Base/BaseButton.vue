<script lang="ts" setup>
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { ButtonVariant } from './types';
import { CONTROL_HEIGHT, CONTROL_HEIGHT_DENSE, FOCUS_RING, ICON_BOX, ICON_GAP, MOTION } from './geometry';

/**
 * A button, at the one height buttons are.
 *
 * What it used to be: a violet-to-cyan gradient for `primary`, a drop shadow
 * that grew on hover, and `active:scale-[0.98]`. The scale is the one worth
 * naming, because it changes the element's measured size on press, which is
 * the same class of defect as a card growing on hover: the box moves when the
 * state does. Colour moves; geometry does not.
 *
 * At most one `primary` per region. Everything else is `outline` or `ghost`,
 * which is what makes the filled one mean something.
 */
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    /** An Iconify name, drawn before the label in a fixed 16px box. */
    icon?: string;
    /**
     * Reserve the icon column even with no icon.
     *
     * For a row of triggers where only some have a glyph. Without it their
     * labels start at different x, which is `07-editor-filter-dropdowns`.
     */
    reserveIcon?: boolean;
    /** Only inside a dense toolbar. See `CONTROL_HEIGHT_DENSE`. */
    dense?: boolean;
    /** No label, so the box is square. */
    iconOnly?: boolean;
  }>(),
  { variant: 'default' },
);

const variantClass = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-accent text-accent-fg border-transparent hover:bg-accent-hover';
    case 'danger':
      return 'bg-danger text-danger-fg border-transparent hover:opacity-90';
    case 'ghost':
      return 'bg-transparent border-transparent text-muted-600 hover:bg-muted-50 hover:text-foreground';
    case 'outline':
    case 'muted':
      return 'bg-transparent border-border text-foreground hover:bg-muted-50';
    default:
      return 'bg-muted-50 border-transparent text-foreground hover:bg-muted-100';
  }
});

const sizeClass = computed(() => {
  const height = props.dense ? CONTROL_HEIGHT_DENSE : CONTROL_HEIGHT;
  if (props.iconOnly) return `${height} ${props.dense ? 'w-7' : 'w-9'} px-0`;
  return `${height} ${props.dense ? 'px-2.5' : 'px-3.5'}`;
});
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center justify-center rounded-md border text-sm font-medium disabled:opacity-50 disabled:pointer-events-none"
    :class="[variantClass, sizeClass, ICON_GAP, FOCUS_RING, MOTION]"
  >
    <Icon v-if="icon" :icon="icon" :class="ICON_BOX" />
    <span v-else-if="reserveIcon" :class="ICON_BOX" aria-hidden="true" />
    <slot />
  </button>
</template>
