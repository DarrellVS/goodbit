<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed, useSlots } from 'vue';
import BaseButton from './BaseButton.vue';
import { emptyStateVariants, type EmptyStateSize, type EmptyStateTone } from './variants';

/**
 * Nothing here, and what to do about it.
 *
 * An empty state that only reports an absence is a dead end. The same three
 * words used to appear whether the library was empty, a filter had hidden
 * everything, or a search had matched nothing, and the advice, "try adding
 * some clips to your library", was wrong in two of those three cases. Every
 * caller now says which case it is and offers the way out of it.
 *
 * **Two sizes.** `page` is a whole screen with nothing on it. `panel` is one
 * section of a screen that has other things, drawn in the bordered panel the
 * rest of that screen uses. Six of the second kind were written out by hand in
 * 3.5.0, and one of them first shipped telling the reader to go and find a
 * setting rather than offering a button to it: a component with an `actions`
 * slot is harder to forget than a paragraph is.
 *
 * **The tone is the icon's, and only the icon's.** `success` is news, like a
 * list that is empty because everything was done; `warning` is a service that
 * did not answer. The words stay the body colour either way.
 */
interface Props {
  icon?: string;
  title: string;
  description?: string;
  /** Text for a single way out. For more than one, use the `actions` slot. */
  actionLabel?: string;
  size?: EmptyStateSize;
  tone?: EmptyStateTone;
}

interface Emits {
  (e: 'action'): void;
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'material-symbols:inbox',
  description: '',
  actionLabel: '',
  size: 'page',
  tone: 'neutral',
});

const emit = defineEmits<Emits>();
const slots = useSlots();

const parts = computed(() => emptyStateVariants({ size: props.size, tone: props.tone }));
const hasActions = computed(() => Boolean(props.actionLabel || slots.actions));
</script>

<template>
  <div :class="parts.root()">
    <Icon :icon="icon" :class="parts.icon()" />
    <div :class="parts.text()">
      <h2 :class="parts.title()">{{ title }}</h2>
      <p v-if="description || $slots.default" :class="parts.description()">
        <slot>{{ description }}</slot>
      </p>
    </div>
    <div v-if="hasActions" :class="parts.actions()">
      <slot name="actions">
        <BaseButton tone="strong" @click="emit('action')">{{ actionLabel }}</BaseButton>
      </slot>
    </div>
  </div>
</template>
