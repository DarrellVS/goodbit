<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import ObsSetupDialog from '@renderer/components/Settings/ObsSetupDialog.vue';
import { getObsStatus, type ObsStatus } from '@renderer/services/obs';
import { useToastStore } from '@renderer/stores/toast';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

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

/**
 * One line, not a report.
 *
 * This used to print every blocker's title *and* its full explanation as a
 * bulleted list, which is the right level of detail for Settings and far too
 * much for a banner sitting over somebody's library. Here the only questions
 * worth answering are what is wrong and what to press, so the blockers are
 * named and nothing is explained: the button leads to the screen that does.
 */
const summary = computed(() => {
  if (!status.value?.installed) return 'GoodBit keeps what OBS records. It can install and set it up for you.';

  // The titles as written, never lowercased: half of them open with "OBS",
  // and "obs and goodbit are looking at different folders" reads like a bug.
  const titles = blockers.value.map((finding) => finding.title.replace(/\.$/, ''));
  if (titles.length === 0) return 'Your replay key saves nothing until this is sorted.';

  return `${titles.join('. ')}.`;
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
  confirmAction(
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
  <!--
    A line, not a panel.

    It was an accent-tinted card with an accent border and a filled button,
    which is the treatment the design keeps for the one primary action in a
    region. Nothing about "OBS is not set up" is the primary action of the
    library: it is a notice, so it is a line at the top of the content with a
    hairline under it, and its two actions are words.
  -->
  <div v-if="visible" class="px-12 py-3 border-b border-border">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon
        icon="material-symbols:error-circle-rounded"
        class="size-4 shrink-0 block text-warning"
      />

      <div class="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2">
        <p class="text-sm font-medium text-foreground">{{ headline }}</p>
        <p class="text-sm text-muted-500">{{ summary }}</p>
      </div>

      <!--
        Beside the text rather than under it. The banner is one sentence and an
        action, and stacking the buttons underneath gave a four row block the
        height of a clip card.
      -->
      <div class="flex items-center gap-4 shrink-0">
        <button
          type="button"
          class="h-8 inline-flex items-center text-sm font-medium text-accent-ink whitespace-nowrap border-b border-accent/50 hover:border-accent outline-none focus-visible:focus-ring transition-colors duration-150"
          @click="showDialog = true"
        >
          Set up OBS for me
        </button>
        <button
          type="button"
          class="h-8 inline-flex items-center rounded-sm text-sm text-muted-500 hover:text-foreground whitespace-nowrap outline-none focus-visible:focus-ring transition-colors duration-150"
          @click="dismiss"
        >
          Not now
        </button>
      </div>
    </div>

    <ObsSetupDialog v-model:open="showDialog" @done="recheck" />
  </div>
</template>
