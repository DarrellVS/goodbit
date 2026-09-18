<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@renderer/stores/toast';
import { useMarkdown } from '@renderer/composables/ui/useMarkdown';
import { updateClipNotes } from '@renderer/services/clips';
import { formatTimestamp } from '@renderer/utils/timestampParser';
import { SECTION_HEADER } from '@renderer/components/Base/geometry';
import MarkdownToolbar from '@renderer/components/Base/MarkdownToolbar.vue';
import MarkdownTextarea from '@renderer/components/Base/MarkdownTextarea.vue';
import MarkdownPreview from '@renderer/components/Base/MarkdownPreview.vue';
import type { Clip } from '@renderer/types/clip';

/**
 * Notes, written where they are read, and read as a note rather than as source.
 *
 * This used to be a read-only card with an Add Notes button that opened a
 * dialog over the clip. That is two screens for one paragraph, and the dialog
 * covered the video the note is about. The clip's panel is already a full
 * window with room in it, so the editor lives in the panel and there is nothing
 * to open.
 *
 * **A note that nobody is editing renders.** It showed a textarea always, with
 * the rendered half behind a preview button that starts closed, so a saved note
 * was read as its own source every time and `0:04` was four characters instead
 * of a chip that seeks the player. One piece of state, `editing`, decides which
 * it is, and it is off until somebody asks: the pencil in the header, or a
 * click into the note itself.
 *
 * **The pieces are assembled here rather than through `MarkdownEditor`.** That
 * wrapper drew its own bordered box, which inside this card was a card in a
 * card with two headers stacked on top of each other. Composing the toolbar,
 * the textarea and the preview directly lets the toolbar share the one header
 * this section already has.
 *
 * **Saved on purpose, not on every keystroke.** A note is a paragraph rather
 * than a field, and a half-typed sentence is not a state worth persisting. Save
 * and Discard appear only once something has changed, and while editing with
 * nothing changed there is one button, which says the editor is what you are
 * finished with rather than the note.
 */
interface Props {
  clip: Clip;
  /**
   * Where the player is now, asked at the moment somebody presses the button.
   *
   * A getter rather than a number, because `timeupdate` fires several times a
   * second and a prop carrying it would re-render this card, and the note being
   * typed into it, for the whole length of the clip. The one instant that
   * matters is the press.
   */
  playhead?: () => number | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'updated', clip: Clip): void;
  (e: 'timestamp-click', seconds: number): void;
}>();

const toastStore = useToastStore();
const saving = ref(false);
const editing = ref(false);
const textareaComponent = ref<InstanceType<typeof MarkdownTextarea> | null>(null);

const {
  content: draft,
  showPreview,
  renderedMarkdown,
  insertMarkdown,
  togglePreview,
} = useMarkdown({
  initialValue: props.clip.notes ?? '',
  onTimestampClick: (seconds) => emit('timestamp-click', seconds),
});

/**
 * A different clip, or one whose notes were changed elsewhere, starts again.
 *
 * Guarded on the values rather than run on every new `clip` object. The panel
 * hands down a fresh clip whenever anything about it changes, so starring one
 * or adding a tag used to throw away whatever was half written in here.
 */
watch(
  () => [props.clip.id, props.clip.notes] as const,
  ([id, notes], previous) => {
    if (previous && id === previous[0] && notes === previous[1]) return;

    draft.value = notes ?? '';
    editing.value = false;
  },
);

const dirty = computed(() => draft.value !== (props.clip.notes ?? ''));

/** What is saved, which is what read mode shows. */
const hasNotes = computed(() => (props.clip.notes ?? '').trim().length > 0);

async function startEditing(): Promise<void> {
  if (editing.value) return;
  editing.value = true;

  await nextTick();
  const textarea = textareaComponent.value?.textareaRef;
  if (!textarea) return;

  textarea.focus();
  // The caret lands at the end, which is where a note is continued from. It
  // cannot land where the click did: that word is in a different element, and
  // in a rendered note it is not at the same offset as in the source.
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

/**
 * Clicking the note hands back the textarea, with two exceptions.
 *
 * A chip stops its own click in `MarkdownPreview`, so a press on one seeks and
 * nothing else. A real link in a note is still a link, and following one is not
 * asking to edit either.
 */
function editFromNote(event: MouseEvent): void {
  const pressed = event.target;
  if (pressed instanceof Element && pressed.closest('a')) return;

  void startEditing();
}

function handleInsert(prefix: string, suffix?: string): void {
  insertMarkdown(prefix, suffix, textareaComponent.value?.textareaRef);
}

/**
 * Write the frame on screen into the note.
 *
 * `formatTimestamp` floors, which is the whole reason it is used here rather
 * than a round: a chip reading 0:30 on a 29.97 second clip points past the last
 * frame.
 */
function insertPlayhead(): void {
  const seconds = props.playhead?.();
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return;

  // A trailing space, because what follows a timestamp is a sentence.
  handleInsert(`${formatTimestamp(seconds)} `);
}

async function save(): Promise<void> {
  if (saving.value || !dirty.value) return;

  saving.value = true;
  try {
    const updated = await updateClipNotes(props.clip.id, draft.value || null);
    emit('updated', { ...updated });
    // Saving is the end of editing, and it is also the only way to see what the
    // timestamps just became.
    editing.value = false;
  } catch (error) {
    console.error('Failed to save notes:', error);
    toastStore.error('Could not save these notes');
  } finally {
    saving.value = false;
  }
}

function discard(): void {
  draft.value = props.clip.notes ?? '';
  editing.value = false;
}
</script>

<template>
  <section class="border-t border-border pt-5">
    <!--
      One header, holding everything. The title, the formatting buttons and the
      preview toggle were on two rows with a border between them, which read as
      a panel inside a panel rather than as one thing.
    -->
    <!--
      It wraps. The row holds a title, six formatting buttons, a preview
      toggle, Discard and Save, and in half the width of the picture column
      that is wider than the column: everything is `shrink-0`, so it did not
      shrink, it overflowed, and the Save button ended up painted underneath
      the column beside it where nothing could press it.
    -->
    <div :class="SECTION_HEADER">
      <h2 class="text-sm font-medium text-muted-600 shrink-0">Notes &amp; Annotations</h2>

      <!--
        Read mode has one control, and the note itself is the other. It sits
        where the toolbar sits while editing, so the header holds one thing at
        a time rather than growing a row.
      -->
      <button
        v-if="!editing && hasNotes"
        class="ml-auto px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors flex items-center gap-1.5 shrink-0"
        title="Edit this note"
        @click="startEditing"
      >
        <Icon icon="material-symbols:edit-rounded" class="text-base" />
        Edit
      </button>

      <template v-if="editing">
        <MarkdownToolbar
          split
          bare
          class="ml-auto"
          :show-preview="showPreview"
          :has-playhead="playhead !== undefined"
          @insert="handleInsert"
          @insert-playhead="insertPlayhead"
          @toggle-preview="togglePreview"
        />

        <div class="w-px h-6 bg-border shrink-0" role="presentation"></div>

        <!--
          Nothing to press about the note until there is something to press it
          about. While it matches what is saved, the only thing left to say is
          that you are finished with the editor.
        -->
        <template v-if="dirty">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors shrink-0"
            :disabled="saving"
            @click="discard"
          >
            Discard
          </button>
          <button
            class="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-1.5 shrink-0"
            :disabled="saving"
            @click="save"
          >
            <Icon
              v-if="saving"
              icon="material-symbols:progress-activity"
              class="text-base animate-spin"
            />
            {{ saving ? 'Saving' : 'Save notes' }}
          </button>
        </template>
        <button
          v-else
          class="px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors shrink-0"
          @click="editing = false"
        >
          Done
        </button>
      </template>
    </div>

    <!--
      The preview sits beside the text rather than replacing it: the reason to
      look at one is to check what you are typing, and swapping the two hides
      the thing being checked. It starts closed, because read mode is now what
      a note looks like when nobody is typing into it.
    -->
    <div
      v-if="editing"
      class="rounded-md border border-border overflow-hidden bg-card"
      :class="showPreview ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border' : ''"
    >
      <MarkdownTextarea
        ref="textareaComponent"
        v-model="draft"
        :rows="7"
        placeholder="What happened here? Markdown works, and a timestamp like 0:12 becomes a chip that seeks the clip."
      />

      <MarkdownPreview
        v-if="showPreview"
        :html="renderedMarkdown"
        @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
      />
    </div>

    <!--
      The note, read. Clicking it hands back the textarea, so there is no step
      between noticing a typo and fixing it, and a chip is pressable here
      because this is where a note is actually looked at.
    -->
    <div
      v-else-if="hasNotes"
      class="rounded-md border border-border bg-card cursor-text hover:border-line-strong transition-colors"
      @click="editFromNote"
    >
      <MarkdownPreview
        :html="renderedMarkdown"
        @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
      />
    </div>

    <!--
      Empty, and saying so in one line. The read mode this was salvaged from
      spent a circled icon, a heading and a paragraph explaining what a note
      is, which is a lot of screen to tell somebody there is nothing here. The
      whole of it is the button, since there is nothing else in here to press.
    -->
    <button
      v-else
      class="w-full rounded-md border border-dashed border-border bg-card px-4 py-6 text-center hover:border-accent/50 hover:bg-accent/4 transition-colors"
      @click="startEditing"
    >
      <p class="text-sm text-muted-500">
        No notes yet. Add context, or mark a moment with a timestamp.
      </p>
      <span class="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink">
        <Icon icon="material-symbols:add" class="text-lg" />
        Write a note
      </span>
    </button>
  </section>
</template>
