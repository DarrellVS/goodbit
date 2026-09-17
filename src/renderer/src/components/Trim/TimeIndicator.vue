<template>
  <!--
    Three readouts on one line, and they were three different objects: an
    accent dot in front of each label, and a tinted pill with an accent border
    around whichever one was `primary`. The dot pointed at a number rather than
    at a good bit, and the pill made Length look like a control while Start and
    End, which are the two you can actually change, looked like text.
  -->
  <div class="flex items-center gap-2 text-sm" :class="containerClass">
    <span class="text-muted-500">{{ label }}</span>

    <span class="flex items-baseline gap-1.5">
      <span class="font-mono font-medium tabular-nums" :class="textClass">{{ time }}</span>
      <!--
        The count of frames beside the length, in the muted ladder so it reads
        as a gloss on the number rather than a second number.
      -->
      <span v-if="sub" class="text-xs text-muted-400 whitespace-nowrap">{{ sub }}</span>
    </span>

    <!--
      Frame stepping for a hand that is on the mouse.

      The arrow keys do this too, and they are the binding anybody who edits
      video will reach for, but they only reach a handle once it has focus. A
      pair of buttons where the number already is means the feature can be found
      by looking at the screen, which a key binding cannot be.
    -->
    <span v-if="steppable" class="flex items-center gap-0.5 ml-0.5">
      <button
        type="button"
        class="size-6 inline-flex items-center justify-center shrink-0 rounded-sm text-muted-400 hover:text-foreground hover:bg-muted-100 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :title="`Back ${stepName} (left arrow, with this handle selected)`"
        :aria-label="`Move ${label.toLowerCase()} back ${stepName}`"
        :disabled="disabled"
        @click="emit('step', -1)"
      >
        <Icon icon="material-symbols:chevron-left" class="size-4 shrink-0 block" />
      </button>
      <button
        type="button"
        class="size-6 inline-flex items-center justify-center shrink-0 rounded-sm text-muted-400 hover:text-foreground hover:bg-muted-100 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
        :title="`Forward ${stepName} (right arrow, with this handle selected)`"
        :aria-label="`Move ${label.toLowerCase()} forward ${stepName}`"
        :disabled="disabled"
        @click="emit('step', 1)"
      >
        <Icon icon="material-symbols:chevron-right" class="size-4 shrink-0 block" />
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  label: string;
  time: string;
  variant?: 'default' | 'primary';
  /** A gloss under the number, such as the count of frames in a range. */
  sub?: string | null;
  /** Whether this one can be nudged, which the Length indicator cannot. */
  steppable?: boolean;
  /** What one press moves, said in words, for the tooltip. */
  stepName?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  sub: null,
  steppable: false,
  stepName: 'one frame',
  disabled: false,
});

const emit = defineEmits<{ (e: 'step', delta: number): void }>();

const isPrimary = computed(() => props.variant === 'primary');

/**
 * `primary` is a weight, not a container.
 *
 * It was a tinted pill with an accent border, which made Length look like a
 * control while Start and End, the two you can actually change, looked like
 * text.
 */
const containerClass = computed(() => (isPrimary.value ? '' : ''));

const textClass = computed(() => (isPrimary.value ? 'text-foreground' : 'text-muted-700'));
</script>
