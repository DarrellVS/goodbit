<script setup lang="ts">
import { computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import Wordmark from './Wordmark.vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from '@renderer/composables/ui/useTheme';

/**
 * The window's own title bar.
 *
 * Windows still draws minimise, maximise and close, `titleBarStyle: 'hidden'`
 * with an overlay, rather than `frame: false`, so the snap layouts that appear
 * on hovering maximise keep working, along with the system double-click and
 * drag behaviour. What is drawn here is everything to the left of those.
 *
 * The whole bar is a drag region; anything clickable has to opt out, or it
 * moves the window instead of taking the click.
 */
const route = useRoute();
const router = useRouter();
const { isDark } = useTheme();

/** Each page draws its own heading; repeating it here only doubled it up. */
const APP_NAME = 'GoodBit';

/** The library is the root, and first run has nothing behind it either. */
const canGoBack = computed(() => route.name !== 'clips' && route.name !== 'welcome');

// Windows keeps whatever colour the caption glyphs were last given, so light
// glyphs stay light on a light page and become invisible.
watch(
  isDark,
  (dark) => {
    void window.goodbit?.window.setOverlay({ symbolColor: dark ? '#a0a4ac' : '#5c6068' });
  },
  { immediate: true },
);
</script>

<template>
  <header class="titlebar flex items-center gap-2 px-3 select-none border-b border-border bg-card">
    <button
      v-if="canGoBack"
      class="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-muted-100 transition-colors"
      title="Back"
      @click="router.back()"
    >
      <Icon icon="material-symbols:arrow-back-rounded" class="text-lg text-muted-600" />
    </button>

    <div class="flex items-center gap-2 min-w-0">
      <Wordmark :size="20" />
      <span class="text-[13px] font-semibold text-foreground truncate">{{ APP_NAME }}</span>
    </div>

    <!-- Everything past here is the caption buttons' strip; content must stop. -->
    <div class="flex-1" />
  </header>
</template>

<style scoped>
.titlebar {
  height: var(--titlebar-height, 40px);
  /*
   * The bar moves the window. Children that take clicks opt back out below, or
   * a button press turns into a drag.
   */
  -webkit-app-region: drag;
  /*
   * Stop before the caption buttons. `titlebar-area-width` is what the overlay
   * reserves for them; the fallback matters only if the overlay is unavailable.
   */
  padding-right: calc(100vw - env(titlebar-area-width, calc(100vw - 140px)));
}

.titlebar button {
  -webkit-app-region: no-drag;
}
</style>
