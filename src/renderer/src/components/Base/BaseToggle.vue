<script setup lang="ts">
/**
 * The on/off switch, wherever the app has one.
 *
 * Settings used a mix of native checkboxes and hand-rolled switches, which
 * read as two different kinds of control for the same kind of decision. This
 * is the only one now; anything that needs a label and a description beside it
 * wraps it in `Settings/SettingToggle.vue` rather than drawing its own.
 *
 * A button with `role="switch"` rather than an `<input type="checkbox">`,
 * because the visual is a track and a knob, not a box, and screen readers
 * should hear what is drawn.
 */
interface Props {
  modelValue: boolean;
  /** What this switch is called. Required: a switch with no name is a riddle. */
  label: string;
  disabled?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: boolean): void;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });
const emit = defineEmits<Emits>();

function toggle(): void {
  if (!props.disabled) emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
    :class="modelValue ? 'bg-accent' : 'bg-muted-400'"
    @click="toggle"
  >
    <!--
      The knob is the page colour, in both states and both palettes, so it
      reads as a hole punched in the track rather than as a second fill that
      has to be told apart from it. It was `bg-card`, which is near-white in
      light mode and near-black in dark, so the same knob was a light disc on
      one theme and a dark one on the other. The off track moved up a rung for
      the same reason: `muted-300` is the decorative step and the knob on it
      was 2.9:1, under the floor for a control's own edge.
    -->
    <span
      class="inline-block h-4 w-4 transform rounded-full bg-background transition-transform duration-150"
      :class="modelValue ? 'translate-x-6' : 'translate-x-1'"
    />
  </button>
</template>
