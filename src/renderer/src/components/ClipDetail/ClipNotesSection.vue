<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import { useMarkdown } from '../../composables/useMarkdown';
import { updateClipNotes } from '../../services/clips';
import MarkdownToolbar from '../Base/MarkdownToolbar.vue';
import MarkdownTextarea from '../Base/MarkdownTextarea.vue';
import MarkdownPreview from '../Base/MarkdownPreview.vue';
import type { Clip } from '../../types/clip';

/**
 * Notes, written where they are read.
 *
 * This used to be a read-only card with an Add Notes button that opened a
 * dialog over the clip. That is two screens for one paragraph, and the dialog
 * covered the video the note is about. The clip's panel is already a full
 * window with room in it, so the editor lives in the panel and there is nothing
 * to open.
 *
 * **The pieces are assembled here rather than through `MarkdownEditor`.** That
 * wrapper draws its own bordered box, which inside this card was a card in a
 * card with two headers stacked on top of each other. Composing the toolbar,
 * the textarea and the preview directly lets the toolbar share the one header
 * this section already has.
 *
 * **Saved on purpose, not on every keystroke.** A note is a paragraph rather
 * than a field, and a half-typed sentence is not a state worth persisting. The
 * buttons appear only once something has changed, so a clip nobody is editing
 * shows no controls at all.
 */
interface Props {
  clip: Clip;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'updated', clip: Clip): void;
  (e: 'timestamp-click', seconds: number): void;
}>();

const toastStore = useToastStore();
const saving = ref(false);
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

/** A different clip, or one whose notes were changed elsewhere, starts again. */
watch(
  () => [props.clip.id, props.clip.notes] as const,
  () => {
    draft.value = props.clip.notes ?? '';
  },
);

const dirty = computed(() => draft.value !== (props.clip.notes ?? ''));

function handleInsert(prefix: string, suffix?: string): void {
  insertMarkdown(prefix, suffix, textareaComponent.value?.textareaRef);
}

async function save(): Promise<void> {
  if (saving.value || !dirty.value) return;

  saving.value = true;
  try {
    const updated = await updateClipNotes(props.clip.id, draft.value || null);
    emit('updated', { ...updated });
  } catch (error) {
    console.error('Failed to save notes:', error);
    toastStore.error('Could not save these notes');
  } finally {
    saving.value = false;
  }
}

function discard(): void {
  draft.value = props.clip.notes ?? '';
}
</script>

<template>
  <div class="bg-gradient-to-br from-card to-orange-500/4 rounded-2xl p-5 border border-border">
    <!--
      One header, holding everything. The title, the formatting buttons and the
      preview toggle were on two rows with a border between them, which read as
      a panel inside a panel rather than as one thing.
    -->
    <div class="flex items-center gap-3 mb-3">
      <div
        class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0"
      >
        <Icon icon="material-symbols:note-rounded" class="text-lg text-card" />
      </div>
      <h2 class="font-semibold text-foreground flex-shrink-0">Notes &amp; Annotations</h2>

      <MarkdownToolbar
        split
        bare
        class="ml-auto"
        :show-preview="showPreview"
        @insert="handleInsert"
        @toggle-preview="togglePreview"
      />

      <!--
        Nothing to press until there is something to press it about. An empty
        note and a saved one look the same, which is the point: the only time
        this says anything is when there is work that would be lost.
      -->
      <template v-if="dirty">
        <div class="w-px h-6 bg-border flex-shrink-0" role="presentation"></div>
        <button
          class="px-3 py-1.5 rounded-lg text-sm text-muted-600 hover:bg-muted-50 transition-colors flex-shrink-0"
          :disabled="saving"
          @click="discard"
        >
          Discard
        </button>
        <button
          class="px-3 py-1.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
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
    </div>

    <!--
      The preview sits beside the text rather than replacing it: the reason to
      look at one is to check what you are typing, and swapping the two hides
      the thing being checked. It starts closed, because most notes are a
      sentence and do not need proving.
    -->
    <div
      class="rounded-xl border border-border overflow-hidden bg-card"
      :class="showPreview ? 'grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-border' : ''"
    >
      <MarkdownTextarea
        ref="textareaComponent"
        v-model="draft"
        :rows="7"
        placeholder="What happened here? Markdown works, and a timestamp like 0:12 becomes a link into the clip."
      />

      <MarkdownPreview
        v-if="showPreview"
        :html="renderedMarkdown"
        @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
      />
    </div>
  </div>
</template>
