<script setup lang="ts">
import { ref, watch } from 'vue';
import { gameArtUrl, type GameArt } from '../../utils/mediaUrl';

/**
 * A game's own artwork, with the old dot as the fallback.
 *
 * Steam has already cached the art for every game whose library page it has
 * drawn, so most games have this for free and offline. Plenty do not: a game
 * from another store, a folder named after an executable, a recording of a
 * browser. Those are ordinary, not errors, so this falls back silently to
 * exactly what the sidebar showed before.
 *
 * The slot is the fallback, which keeps the decision with the caller: the
 * sidebar wants its dot, a card might want an initial.
 */
const props = withDefaults(
  defineProps<{
    game: string;
    kind?: GameArt;
    /** Tailwind sizing for the image, so each caller keeps its own layout. */
    class?: string;
  }>(),
  { kind: 'icon', class: 'w-4 h-4 rounded' },
);

const failed = ref(false);

// A different game is a different question, so the answer is asked again.
watch(
  () => [props.game, props.kind],
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <img
    v-if="!failed"
    :src="gameArtUrl(props.game, props.kind)"
    :class="props.class"
    :alt="''"
    loading="lazy"
    decoding="async"
    @error="failed = true"
  />
  <slot v-else />
</template>
