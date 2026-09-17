<script setup lang="ts">
import { Icon } from '@iconify/vue';

/**
 * A field that is a line, not a box.
 *
 * The app's inputs were rounded boxes with their own ground and a ring on
 * focus, which is four pieces of furniture around a place to type. On a page
 * whose depth comes from tone steps and hairlines, a filled box with a border
 * is the loudest thing on the screen, and the library's search field was
 * exactly that: a 384px pill sitting beside a 34px title.
 *
 * So the rule is the field. It sits under the text, one hairline, and turns
 * accent when something inside it has focus. The hairline is `line-strong`
 * rather than `border` because this one is doing a job: it is the only thing
 * saying "you can type here", where a panel's edge is only confirming a shape
 * you can already see.
 *
 * The icon is optional and lives in a fixed box, so a field with one and a
 * field without it start their text at different x on purpose rather than by
 * accident, and two fields that do have one agree.
 */
withDefaults(
  defineProps<{
    /** An Iconify name, drawn before the input. */
    icon?: string;
    /** For numbers: timecodes, sizes, counts. */
    mono?: boolean;
  }>(),
  { mono: false },
);
</script>

<template>
  <div
    class="flex items-center gap-2 min-h-9 px-0.5 pb-1.5 border-b border-line-strong transition-colors duration-150 focus-within:border-accent"
  >
    <Icon v-if="icon" :icon="icon" class="size-4 shrink-0 block text-muted-400" />
    <!--
      The input itself carries no border, no ground and no ring: the wrapper is
      the control, so a ring here would draw a second one inside the first.
    -->
    <slot />
    <slot name="trailing" />
  </div>
</template>

<style scoped>
:slotted(input),
:slotted(textarea) {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  font-size: var(--text-base);
  color: hsl(var(--foreground));
}

:slotted(input::placeholder),
:slotted(textarea::placeholder) {
  color: hsl(var(--muted-400));
}

/* `search` draws its own clear button in Chromium, and the app has one. */
:slotted(input[type='search']::-webkit-search-cancel-button) {
  display: none;
}
</style>
