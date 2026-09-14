<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { TITLEBAR_HEIGHT } from '@shared/index';
import { useUpdater } from '../../composables/useUpdater';

/**
 * "There is a new version". The one interruption the app is allowed.
 *
 * Two details it got wrong and now does not. It sat at the very top of the
 * window, which is inside the title bar's drag region: on Windows that band is
 * hit-tested as caption, so the button under the cursor never saw the click and
 * the whole thing read as broken. It now clears the bar and opts out of
 * dragging as well, because either alone is one accident away from the same
 * bug. And it was a line of small text with a link in it, which for the only
 * thing the app ever asks of you is too quiet to notice.
 */
const { state, install } = useUpdater();

/** Only the two states worth interrupting for. */
const show = computed(() => state.value.status === 'downloading' || state.value.status === 'ready');
const ready = computed(() => state.value.status === 'ready');
const percent = computed(() => (state.value.status === 'downloading' ? state.value.percent : 100));
const version = computed(() => (state.value.status === 'ready' ? state.value.version : ''));

/** Clear of the title bar, with a little air under it. */
const top = `${TITLEBAR_HEIGHT + 14}px`;
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-3"
    leave-active-class="transition-all duration-150 ease-in"
    leave-to-class="opacity-0 -translate-y-3"
  >
    <div
      v-if="show"
      class="update-banner fixed left-1/2 -translate-x-1/2 z-[100] w-[min(620px,calc(100vw-48px))]
             rounded-2xl border border-orange-400/40 bg-card shadow-2xl overflow-hidden"
      :style="{ top }"
      role="status"
    >
      <div class="flex items-center gap-4 px-5 py-4">
        <div
          class="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center"
        >
          <Icon icon="material-symbols:rocket-launch" class="text-white text-2xl" />
        </div>

        <div class="min-w-0 flex-1">
          <p class="font-semibold text-foreground leading-tight">
            {{ ready ? 'A new version is ready' : 'Downloading an update' }}
          </p>
          <p class="text-sm text-muted-500 mt-0.5">
            {{
              ready
                ? `GoodBit ${version} installs when you restart. Nothing is lost.`
                : `${percent}% of the way there. You can keep working.`
            }}
          </p>
        </div>

        <button
          v-if="ready"
          class="flex-shrink-0 px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold
                 hover:bg-orange-600 active:bg-orange-700 transition-colors"
          @click="install"
        >
          Restart now
        </button>
      </div>

      <!-- The bar doubles as the progress readout, and stays full when ready. -->
      <div class="h-1 bg-muted-200">
        <div
          class="h-full bg-orange-500 transition-[width] duration-300 ease-out"
          :style="{ width: `${percent}%` }"
        ></div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/*
 * Belt and braces with the offset above: an element that overlaps the title
 * bar's drag region is hit-tested as caption on Windows, and its buttons stop
 * responding. Saying so here means moving this thing later cannot quietly
 * reintroduce that.
 */
.update-banner {
  -webkit-app-region: no-drag;
}
</style>
