<template>
  <div class="flex items-center gap-2" :class="containerClass">
    <div class="w-2 h-2 rounded-full bg-accent shrink-0" />
    <span class="text-muted-400">{{ label }}:</span>

    <span class="flex items-baseline gap-1.5">
      <span class="font-mono font-semibold tabular-nums" :class="textClass">{{ time }}</span>
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
        class="w-5 h-5 flex items-center justify-center rounded-sm border border-transparent text-muted-400 hover:text-accent-ink hover:border-line-strong transition-colors disabled:opacity-40 disabled:pointer-events-none"
        :title="`Back ${stepName} (left arrow, with this handle selected)`"
        :aria-label="`Move ${label.toLowerCase()} back ${stepName}`"
        :disabled="disabled"
        @click="emit('step', -1)"
      >
        <Icon icon="material-symbols:chevron-left" class="text-base" />
      </button>
      <button
        type="button"
        class="w-5 h-5 flex items-center justify-center rounded-sm border border-transparent text-muted-400 hover:text-accent-ink hover:border-line-strong transition-colors disabled:opacity-40 disabled:pointer-events-none"
        :title="`Forward ${stepName} (right arrow, with this handle selected)`"
        :aria-label="`Move ${label.toLowerCase()} forward ${stepName}`"
        :disabled="disabled"
        @click="emit('step', 1)"
      >
        <Icon icon="material-symbols:chevron-right" class="text-base" />
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

const containerClass = computed(() =>
  isPrimary.value
    ? 'px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20'
    : ''
);

const textClass = computed(() =>
  isPrimary.value ? 'text-accent-ink' : ''
);
</script>
