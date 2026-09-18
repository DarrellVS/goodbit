<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useObsSetup } from '@renderer/composables/obs/useObsSetup';
import { useObsSetupWizard } from '@renderer/composables/obs/useObsSetupWizard';
import { useToastStore } from '@renderer/stores/toast';
import ObsSetupAudioStep from './ObsSetup/ObsSetupAudioStep.vue';
import ObsSetupDoneStep from './ObsSetup/ObsSetupDoneStep.vue';
import ObsSetupInstallStep from './ObsSetup/ObsSetupInstallStep.vue';
import ObsSetupRecordingStep from './ObsSetup/ObsSetupRecordingStep.vue';
import ObsSetupReviewStep from './ObsSetup/ObsSetupReviewStep.vue';
import ObsSetupRouteStep from './ObsSetup/ObsSetupRouteStep.vue';
import ObsSetupScreenStep from './ObsSetup/ObsSetupScreenStep.vue';
import ObsSetupSortingStep from './ObsSetup/ObsSetupSortingStep.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

/**
 * The setup, by one of two routes.
 *
 * Almost everybody wants the same thing: the main screen, thirty seconds, a
 * key, the system's sound, clips in folders. **Quick** does that and shows the
 * changes. **Step by step** asks about each of them for the people who have a
 * second monitor, a voice chat on its own device, or an opinion about
 * hotkeys.
 *
 * Both end at the same preview, because nothing is written until it has been
 * seen: this edits another program's configuration, and the honest version of
 * that is showing the edit.
 *
 * This file is the frame and nothing else: the overlay, the title, the step
 * bar and the two buttons at the bottom. One component per page lives in
 * `ObsSetup/`, the data is `useObsSetup`, and where the wizard is up to is
 * `useObsSetupWizard`. It was 1,096 lines of all four at once, which is the
 * wrong shape for the first screen a new user meets and for the part of the app
 * most likely to fail on an unfamiliar machine.
 */

interface Props {
  open: boolean;
  /**
   * What the website's guide asked for, when the dialog was opened by a link.
   *
   * Choices only. A link cannot name a folder, cannot carry a secret and
   * cannot apply anything: it ticks boxes, and a person still reads the list
   * of changes and presses the button.
   */
  invitedSteps?: string[] | null;
  invitedBuffer?: number | null;
  invitedHotkey?: string | null;
  /**
   * Skip the quick-or-thorough question and go straight to the questions.
   *
   * Changing a setup that already works is not the same job as making one.
   * The quick route exists to get somebody recording without asking anything,
   * and offering it to a person who came here specifically to change a setting
   * is offering to overwrite their answers with the defaults.
   */
  directToFull?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'done'): void;
}

const props = withDefaults(defineProps<Props>(), {
  invitedSteps: null,
  invitedBuffer: null,
  invitedHotkey: null,
  directToFull: false,
});
const emit = defineEmits<Emits>();

const setup = useObsSetup();
const toast = useToastStore();
const {
  status,
  plan,
  installPlan,
  bufferSeconds,
  hotkey,
  displays,
  displayId,
  display,
  audio,
  audioIds,
  working,
  error,
  result,
} = setup;

const wizard = useObsSetupWizard({
  setup,
  open: () => props.open,
  directToFull: () => props.directToFull,
  invitedSteps: () => props.invitedSteps,
  invitedBuffer: () => props.invitedBuffer,
  invitedHotkey: () => props.invitedHotkey,
});

const {
  route,
  at,
  pages,
  page,
  showEverything,
  waitingForClip,
  firstClip,
  installing,
  installProgress,
  closingObs,
  tiles,
  sceneStep,
  desktopStep,
  bufferStep,
  hotkeyStep,
  forwardDisabled,
} = wizard;

/** Whether OBS is here. An unread status is not a yes. */
const installed = computed(() => Boolean(status.value?.installed));

function toggleAudio(id: string): void {
  const chosen = new Set(audioIds.value);
  if (chosen.has(id)) chosen.delete(id);
  else chosen.add(id);
  audioIds.value = [...chosen];
}

function close(): void {
  emit('update:open', false);
  emit('done');
}

/**
 * Leaving, with somewhere to come back to.
 *
 * Walking out of this is a fine thing to do, and somebody who does it should
 * not be left wondering whether they have just permanently declined the only
 * offer. Settings has the same wizard behind a button, and saying so costs one
 * sentence.
 */
function notNow(): void {
  confirmAction(
    'Settings, Recording has this waiting whenever you want it, and can replay the whole first run.',
    () => close(),
    'Leave the setup for now?',
  );
}
</script>

<template>
  <!--
    Above the floating toolbars, which are z-50 and were drawing over this.
  -->
  <div
    v-if="open"
    data-testid="obs-setup"
    class="fixed inset-0 z-100 flex items-center justify-center bg-scrim-modal p-6"
    @click.self="close"
  >
    <div class="w-full max-w-2xl max-h-full flex flex-col bg-card rounded-lg border border-border shadow-pop">
      <header class="flex items-start justify-between gap-4 p-5 pb-3 shrink-0">
        <div class="min-w-0">
          <h2 class="font-display text-lg font-medium text-foreground">{{ pages[at]?.title ?? 'Set up OBS' }}</h2>
          <p v-if="page !== 'route'" class="text-sm text-muted-500 mt-0.5">
            Step {{ at + 1 }} of {{ pages.length }}
          </p>
          <p v-else class="text-sm text-muted-500 mt-0.5">
            GoodBit keeps the clips OBS records. This is the part in between.
          </p>
        </div>
        <button class="p-1.5 rounded-lg hover:bg-muted-100 text-muted-500" @click="close">
          <Icon icon="material-symbols:close" class="text-xl" />
        </button>
      </header>

      <ol v-if="page !== 'route'" class="flex items-center gap-1.5 px-5 pb-4 shrink-0">
        <li
          v-for="(entry, index) in pages"
          :key="entry.id"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="index <= at ? 'bg-accent' : 'bg-muted-100'"
          :title="entry.title"
        ></li>
      </ol>
      <div v-else class="pb-1"></div>

      <!--
        `space-y-3` spaces this element's own children, so every step component
        below has a fragment root rather than a wrapper: a wrapper would be one
        child and the gaps between a step's cards would go.
      -->
      <div class="px-5 pb-5 space-y-3 overflow-y-auto scroll-p-1.5">
        <!-- 0. Which way -->
        <ObsSetupRouteStep v-if="page === 'route'" @choose="wizard.choose" />

        <!-- 1. No OBS, no clips -->
        <ObsSetupInstallStep
          v-else-if="page === 'install'"
          :install-plan="installPlan"
          :installed="installed"
          :installing="installing"
          :progress="installProgress"
          :error="error"
          @install="wizard.install"
        />

        <!-- 2. The screen, which decides resolution and colour -->
        <ObsSetupScreenStep
          v-else-if="page === 'screen'"
          :displays="displays"
          :display-id="displayId"
          :display="display"
          :desktop-step="desktopStep"
          :scene-step="sceneStep"
          @update:display-id="displayId = $event"
          @toggle-step="wizard.setStepEnabled"
        />

        <!-- 3. The buffer and the key -->
        <ObsSetupRecordingStep
          v-else-if="page === 'recording'"
          :buffer-seconds="bufferSeconds"
          :hotkey="hotkey"
          :current-hotkey="status?.hotkey ?? null"
          :buffer-step="bufferStep"
          :hotkey-step="hotkeyStep"
          @update:buffer-seconds="bufferSeconds = $event"
          @update:hotkey="hotkey = $event"
          @toggle-step="wizard.setStepEnabled"
        />

        <!-- 4. Audio -->
        <ObsSetupAudioStep
          v-else-if="page === 'audio'"
          :devices="audio"
          :chosen-ids="audioIds"
          @toggle="toggleAudio"
        />

        <!-- 5. Sorting, which is not optional -->
        <ObsSetupSortingStep v-else-if="page === 'sorting'" />

        <!-- 6. What changes, before anything changes -->
        <ObsSetupReviewStep
          v-else-if="page === 'review'"
          :plan="plan"
          :route="route"
          :tiles="tiles"
          :show-everything="showEverything"
          :closing-obs="closingObs"
          :working="working"
          :progress="installProgress"
          :error="error"
          @update:show-everything="showEverything = $event"
          @close-obs="wizard.askObsToClose"
        />

        <!-- 7. Proof that it works -->
        <ObsSetupDoneStep
          v-else
          :result="result"
          :hotkey="hotkey"
          :first-clip="firstClip"
          :waiting="waitingForClip"
          @start="wizard.startObs"
        />
      </div>

      <footer
        v-if="page !== 'route'"
        class="flex items-center justify-between gap-2 p-5 pt-3 border-t border-border shrink-0"
      >
        <button
          v-if="at > 0 && page !== 'done'"
          class="h-9 px-3.5 inline-flex items-center justify-center rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
          @click="wizard.back"
        >
          Back
        </button>
        <span v-else></span>

        <div class="flex items-center gap-2">
          <button
            v-if="page !== 'done'"
            class="h-9 px-3.5 inline-flex items-center justify-center rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            @click="notNow"
          >
            Not now
          </button>
          <!--
            Disabled rather than allowed and then failing. On the preview that
            is the guard: nothing may be written while OBS is running, and the
            plan's blockers are the reason. See `continueDisabled`.
          -->
          <button
            class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium disabled:opacity-50"
            :disabled="forwardDisabled"
            @click="page === 'done' ? close() : wizard.next()"
          >
            <template v-if="page === 'review'">{{ working ? 'Writing…' : 'Apply' }}</template>
            <template v-else-if="page === 'done'">Done</template>
            <template v-else-if="page === 'install'">OBS is installed, continue</template>
            <template v-else>Continue</template>
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
