<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { starClip, unstarClip } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

interface Props {
  clip: Clip;
  /**
   * `overlay` floats over a clip card and appears on hover; `row` is a normal
   * labelled button in a list of actions. The overlay was the only shape for a
   * while, which is why it turned up invisible and absolutely positioned in the
   * clip detail sidebar.
   */
  variant?: 'overlay' | 'row';
}

interface Emits {
  (e: 'updated', clip: Clip): void;
}

const props = withDefaults(defineProps<Props>(), { variant: 'overlay' });
const emit = defineEmits<Emits>();

async function handleToggleStar(): Promise<void> {
  try {
    const updated = props.clip.starred
      ? await unstarClip(props.clip.id)
      : await starClip(props.clip.id);
    emit('updated', updated);
  } catch (error) {
    console.error('Failed to toggle star:', error);
  }
}
</script>

<template>
  <button
    v-if="variant === 'row'"
    type="button"
    class="w-full h-11 grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-3 rounded-md text-left hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
    :title="clip.starred ? 'Remove the star' : 'Star this clip'"
    @click.stop="handleToggleStar"
  >
    <Icon
      icon="material-symbols:star"
      class="size-5 shrink-0 block"
      :class="clip.starred ? 'text-accent' : 'text-muted-400'"
    />
    <span class="text-sm font-medium text-foreground">
      {{ clip.starred ? 'Starred' : 'Star this clip' }}
    </span>
  </button>

  <!--
    One of the card's three tools, in the group at the bottom right.

    It was a bordered circle in the top left corner, on its own, so the card
    had tools in three places. A starred clip keeps its button visible when
    the rest fade out, because that is the one that is carrying state.
  -->
  <button
    v-else
    type="button"
    class="size-8 inline-flex items-center justify-center shrink-0 rounded-sm bg-scrim text-on-video hover:bg-scrim-strong outline-none focus-visible:focus-ring transition-[opacity,background-color] duration-150"
    :class="clip.starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'"
    :title="clip.starred ? 'Unstar' : 'Star'"
    :aria-label="clip.starred ? 'Unstar this clip' : 'Star this clip'"
    @click.stop="handleToggleStar"
  >
    <Icon
      icon="material-symbols:star"
      class="size-4 shrink-0 block"
      :class="clip.starred ? 'text-accent-hover' : 'text-on-video'"
    />
  </button>
</template>
