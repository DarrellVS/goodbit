<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';

/**
 * One question, in the middle, waiting for an answer.
 *
 * Deliberately not `BaseDialog`. That one carries a titled header bar, a
 * gradient and a close button, which is right for the export sheet or the OBS
 * setup and is three pieces of furniture too many for a sentence and two
 * buttons. A confirmation should be the smallest thing on screen that can
 * still stop you.
 *
 * What it replaced: a toast in the corner with `duration: 10000`. That drew
 * the question over the button that had just been pressed, and then answered
 * "no" on the user's behalf when the timer ran out.
 *
 * The cancel is the wide, quiet one and the action is the filled one, so the
 * safe answer is the easy answer and the irreversible one has to be aimed at.
 */

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  /** `danger` paints the action red. Anything that deletes or replaces. */
  tone?: 'danger' | 'normal';
  icon?: string;
  /** A part of the description to set in bold, the first place it appears. */
  emphasis?: string;
}

interface Emits {
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}

const props = withDefaults(defineProps<Props>(), {
  confirmLabel: 'Confirm',
  tone: 'danger',
  icon: 'material-symbols:warning-rounded',
});

/** The description around its emphasised part. Plain text either side, never HTML. */
const descriptionParts = computed(() => {
  const at = props.emphasis ? props.description.indexOf(props.emphasis) : -1;
  if (at < 0 || !props.emphasis) return { before: '', bold: '', after: '' };
  return {
    before: props.description.slice(0, at),
    bold: props.emphasis,
    after: props.description.slice(at + props.emphasis.length),
  };
});

const emit = defineEmits<Emits>();

/*
 * Focus the safe button, not the destructive one.
 *
 * Something has to hold focus or Escape and Tab have nowhere to start, and
 * whatever holds it is what Enter presses. Cancel is the answer to give
 * somebody who hit the keyboard without reading.
 */
const cancelButton = ref<HTMLButtonElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    await nextTick();
    cancelButton.value?.focus();
  },
  { immediate: true },
);

function onBackdrop(event: MouseEvent): void {
  // Clicking away is a cancel, never a confirm.
  if (event.target === event.currentTarget) emit('cancel');
}

/*
 * ## Why the overlay stops `pointerdown`
 *
 * The same defect as the Escape one below, one input away, and it survived the
 * Escape fix because it looks like nothing: the question answered correctly
 * and the panel it was asked over closed anyway, about two tenths of a second
 * later, which reads as the app deciding the job was over.
 *
 * This teleports to `body`, so every press inside it is a press *outside* the
 * Reka dialog underneath, and a modal Reka dialog dismisses itself on a
 * pointer down outside its own content. Both buttons did it, so cancelling a
 * question over the trimmer shut the trimmer, which is the one answer that is
 * supposed to change nothing.
 *
 * Stopped on the overlay, in the bubble phase, rather than on `window` in the
 * capture phase the way Escape is. Capture at `window` runs before the target
 * sees the event, so stopping it there would stop the buttons from being
 * pressed at all. Here the event reaches whatever was clicked, including the
 * backdrop, and then goes no further: Reka listens on `document`, which is one
 * step above this.
 *
 * `pointerdown` alone is enough, and deliberately so. That is the event Reka
 * dismisses on, `click` is already stopped at the card by `@click.stop`, and
 * swallowing more than the one event that causes the problem would take the
 * question further out of the document than it needs to be.
 */

/**
 * Escape answers the question, and only the question.
 *
 * This is nearly always raised from inside something else that is already
 * open: a clip panel, the trimmer inside it, the export sheet. Those are Reka
 * dialogs and they close themselves on Escape from a listener on `document`,
 * so one press cancelled the question *and* shut the panel underneath it.
 * Somebody who thought better of forgetting a GoodBit lost the clip they were
 * working on as well.
 *
 * On `window`, in the capture phase, which is the first place an event can be
 * seen: capture runs window, document, then down to the target, so stopping it
 * here means no document listener anywhere ever hears it.
 * `stopImmediatePropagation` covers anything else registered on `window`
 * itself.
 *
 * Only while the question is up. Closed, this is not in the way of anything.
 */
function onEscape(event: KeyboardEvent): void {
  if (!props.open || event.key !== 'Escape') return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  emit('cancel');
}

onMounted(() => window.addEventListener('keydown', onEscape, true));
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape, true));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-backdrop">
      <!--
        `pointer-events-auto`, and it is the difference between a dialog and a
        picture of one.

        This teleports to `body`, and a Reka dialog that is already open, the
        clip panel or the trimmer inside it, sets `pointer-events: none` on
        `body` so that nothing outside itself can be clicked. Everything
        teleported there inherits that. The question painted on top, looked
        entirely normal, and passed every click straight through to whatever
        was underneath: pressing *Confirm* over the trimmer played and paused
        the video and left the question standing. Re-enabling events on this
        subtree is what puts the buttons back.
      -->
      <div
        v-if="open"
        class="fixed inset-0 z-70 flex items-center justify-center bg-scrim-modal p-4 pointer-events-auto"
        @click="onBackdrop"
        @pointerdown.stop
      >
        <Transition name="modal-content">
          <div
            v-if="open"
            role="alertdialog"
            aria-modal="true"
            :aria-label="title"
            :aria-description="description"
            class="bg-card rounded-lg shadow-pop border border-border w-full max-w-md p-5"
            @click.stop
          >
            <div class="flex gap-3">
              <Icon
                :icon="icon"
                class="size-5 shrink-0 block mt-0.5"
                :class="tone === 'danger' ? 'text-danger-ink' : 'text-muted-500'"
              />
              <div class="min-w-0">
                <h2 class="font-display text-lg font-medium text-foreground">
                  {{ title }}
                </h2>
                <p class="mt-1 text-sm text-muted-500 whitespace-pre-line">
                  <template v-if="descriptionParts.bold"
                    >{{ descriptionParts.before
                    }}<strong class="font-semibold text-foreground">{{ descriptionParts.bold }}</strong
                    >{{ descriptionParts.after }}</template
                  >
                  <template v-else>{{ description }}</template>
                </p>
              </div>
            </div>

            <div class="mt-5 flex items-center justify-end gap-2">
              <button
                ref="cancelButton"
                type="button"
                class="h-9 px-3.5 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
                @click="emit('cancel')"
              >
                Cancel
              </button>
              <button
                type="button"
                class="h-9 px-3.5 rounded-md border border-transparent text-sm font-medium outline-none focus-visible:focus-ring transition-colors duration-150"
                :class="tone === 'danger'
                  ? 'bg-danger text-danger-fg hover:opacity-90'
                  : 'bg-accent text-accent-fg hover:bg-accent-hover'"
                @click="emit('confirm')"
              >
                {{ confirmLabel }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
