<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import ObsSetupDialog from '../Settings/ObsSetupDialog.vue';
import { getObsStatus, type ObsStatus } from '../../services/obs';
import { useToastStore } from '../../stores/toast';

/**
 * The library saying why it is empty, where the library is.
 *
 * Settings has the full diagnostic, but nobody goes to Settings to find out
 * why nothing is happening: they sit in front of a library that never fills up
 * and assume the app is broken. The three things that stop clips arriving are
 * all in OBS, and none of them announce themselves.
 *
 * Only blockers put this on screen. A warning, like clips not being sorted
 * into folders, is worth saying in Settings and not worth a banner over
 * somebody's library every time they open it.
 */

const toast = useToastStore();

const status = ref<ObsStatus | null>(null);
const dismissed = ref(false);
const showDialog = ref(false);

/**
 * Dismissed for this run, not for ever.
 *
 * `sessionStorage` rather than `localStorage` on purpose. If OBS is still not
 * recording tomorrow, tomorrow's library is still empty, and a banner that
 * hides itself permanently the first time it is inconvenient is a banner that
 * fails at the one job it has.
 */
const DISMISS_KEY = 'goodbit.obs-banner-dismissed';

const blockers = computed(() => status.value?.findings.filter((f) => f.level === 'blocker') ?? []);

const visible = computed(() => {
  if (!status.value || dismissed.value) return false;
  if (!status.value.installed) return true;
  return blockers.value.length > 0;
});

const headline = computed(() => {
  if (!status.value?.installed) return 'OBS is not installed, so nothing is recording';
  return 'OBS is not set up to record into your library';
});

onMounted(async () => {
  try {
    dismissed.value = sessionStorage.getItem(DISMISS_KEY) === 'yes';
  } catch {
    // Private window, or storage turned off. Showing it is the safe side.
  }

  try {
    status.value = await getObsStatus();
  } catch {
    // The banner is an extra, not a feature the library depends on.
  }
});

function dismiss(): void {
  toast.confirm(
    'Settings, Recording has the setup waiting whenever you want it. This comes back next time GoodBit starts.',
    () => hide(),
    'Hide this for now?',
  );
}

function hide(): void {
  dismissed.value = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, 'yes');
  } catch {
    // Then it comes back on the next screen, which is the lesser problem.
  }
}

async function recheck(): Promise<void> {
  try {
    status.value = await getObsStatus();
  } catch {
    // Leave what is on screen.
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="mx-6 mt-4 rounded-xl border border-orange-500/40 bg-orange-500/5 p-4"
  >
    <div class="flex items-start gap-3">
      <Icon
        icon="material-symbols:error-circle-rounded"
        class="text-xl text-orange-500 flex-shrink-0 mt-0.5"
      />

      <div class="min-w-0 flex-1">
        <p class="font-medium text-foreground">{{ headline }}</p>
        <p class="text-sm text-muted-500 mt-0.5">
          GoodBit keeps the clips OBS records. Until these are sorted, pressing your replay key
          saves nothing and this page stays empty.
        </p>

        <ul v-if="blockers.length" class="mt-2 space-y-1">
          <li v-for="finding in blockers" :key="finding.id" class="text-sm text-muted-500 flex gap-2">
            <span class="text-orange-500/60">&middot;</span>
            <span><span class="text-foreground">{{ finding.title }}.</span> {{ finding.detail }}</span>
          </li>
        </ul>

        <div class="flex items-center gap-2 mt-3">
          <button
            class="px-3.5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
            @click="showDialog = true"
          >
            Set up OBS for me
          </button>
          <button
            class="px-3.5 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm text-foreground"
            @click="dismiss"
          >
            Not now
          </button>
        </div>
      </div>
    </div>

    <ObsSetupDialog v-model:open="showDialog" @done="recheck" />
  </div>
</template>
