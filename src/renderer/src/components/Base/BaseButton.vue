<script lang="ts" setup>
import { computed, useAttrs } from 'vue';
import { Icon } from '@iconify/vue';
import type { ClassValue } from 'clsx';
import { cn } from './cn';
import { ICON_BOX } from './geometry';
import { buttonVariants, type ButtonSize, type ButtonTone } from './variants';

/**
 * A button, at the one height buttons are.
 *
 * The classes are `buttonVariants` in `variants.ts`, which is where the rules
 * about tones live: one `strong` per region, `danger` outlined and never
 * filled, nothing changing size between states.
 *
 * What it used to be: a violet-to-cyan gradient for `primary`, a drop shadow
 * that grew on hover, and `active:scale-[0.98]`. The scale is the one worth
 * naming, because it changes the element's measured size on press, which is
 * the same class of defect as a card growing on hover: the box moves when the
 * state does. Colour moves; geometry does not.
 *
 * `inheritAttrs` is off so a caller's `class` goes through `cn` rather than
 * being appended: `class="px-2"` on a button whose recipe says `px-3.5` should
 * mean `px-2`, not both with the stylesheet deciding.
 */
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    tone?: ButtonTone;
    size?: ButtonSize;
    /** An Iconify name, drawn before the label in a fixed 16px box. */
    icon?: string;
    /**
     * Reserve the icon column even with no icon.
     *
     * For a row of triggers where only some have a glyph. Without it their
     * labels start at different x, which is `07-editor-filter-dropdowns`.
     */
    reserveIcon?: boolean;
    /** No label, so the box is square. Give it an `aria-label`. */
    iconOnly?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { tone: 'default', size: 'md', type: 'button' },
);

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    buttonVariants({ tone: props.tone, size: props.size, iconOnly: props.iconOnly }),
    attrs.class as ClassValue,
  ),
);

const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});
</script>

<template>
  <button :type="type" v-bind="rest" :class="classes">
    <Icon v-if="icon" :icon="icon" :class="ICON_BOX" />
    <span v-else-if="reserveIcon" :class="ICON_BOX" aria-hidden="true" />
    <slot />
  </button>
</template>
