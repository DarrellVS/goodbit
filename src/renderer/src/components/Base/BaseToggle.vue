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
    class="relative inline-flex h-8 w-[46px] shrink-0 items-center justify-start rounded-full outline-none focus-visible:focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
    @click="toggle"
  >
    <!--
      An outlined pill, not a filled one.

      A 44x24 track drawn inside a 46x32 target, so the thing you can hit is
      bigger than the thing you can see and still clears the 24px minimum in
      its smaller dimension. Off, the track is a raised surface with a hairline
      and the knob is muted; on, the track is the accent's own wash with an
      accent edge and the knob is the accent. So the switch says "on" by
      filling with the accent's colour at the accent's weight rather than by
      becoming a block of it.
    -->
    <span
      class="absolute left-px h-6 w-11 rounded-full border transition-colors duration-150"
      :class="modelValue ? 'bg-accent-sunk border-accent' : 'bg-muted-100 border-line-strong'"
    />
    <span
      class="absolute left-[5px] size-4 rounded-full transition-[transform,background-color] duration-150"
      :class="modelValue ? 'translate-x-5 bg-accent' : 'translate-x-0 bg-muted-400'"
    />
  </button>
</template>
