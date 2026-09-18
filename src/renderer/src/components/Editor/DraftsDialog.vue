<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BaseField from '@renderer/components/Base/BaseField.vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import { formatRelativeTime } from '@renderer/helpers/dateFormat';
import { useToastStore } from '@renderer/stores/toast';
import { downloadDraft, parseDraftFile, type DraftFilePayload } from '@renderer/utils/draftFile';
import type { EditorDraft } from '@renderer/types/editor';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  open: boolean;
  drafts: EditorDraft[];
  /** The draft the timeline is currently autosaving into, if any. */
  activeId: number | null;
  /** Nothing on the timeline means there is nothing worth saving. */
  canSave: boolean;
  saving?: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'save', name: string): void;
  (e: 'import', payload: DraftFilePayload): void;
  (e: 'open-draft', draft: EditorDraft): void;
  (e: 'delete-draft', draft: EditorDraft): void;
}

const props = withDefaults(defineProps<Props>(), {
  saving: false,
});
const emit = defineEmits<Emits>();

const toastStore = useToastStore();

const name = ref('');
const input = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

/** A parsed file waiting for the user to confirm (and possibly rename) it. */
const pendingImport = ref<DraftFilePayload | null>(null);
const importName = ref('');

function defaultName(): string {
  const now = new Date();
  return `Draft ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function save(): void {
  if (!props.canSave || props.saving) return;
  emit('save', name.value.trim() || defaultName());
  name.value = '';
}

async function handleFilePick(event: Event): Promise<void> {
  const picker = event.target as HTMLInputElement;
  const file = picker.files?.[0];
  // Same file twice in a row would not fire change without this.
  picker.value = '';
  if (!file) return;

  try {
    const payload = parseDraftFile(await file.text());
    pendingImport.value = payload;
    // The name the draft was exported under, ready to be overwritten.
    importName.value = payload.name;
  } catch (error) {
    toastStore.error((error as Error).message, 'Could not read that draft');
  }
}

function confirmImport(): void {
  const payload = pendingImport.value;
  if (!payload) return;

  emit('import', { ...payload, name: importName.value.trim() || payload.name });
  pendingImport.value = null;
  importName.value = '';
}

function cancelImport(): void {
  pendingImport.value = null;
  importName.value = '';
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) {
      cancelImport();
      return;
    }

    name.value = '';
    await nextTick();
    input.value?.focus();
  }
);
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-scrim-modal z-50 modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-lg shadow-pop border border-border w-full max-w-xl flex flex-col outline-hidden modal-content-animate max-h-[85vh] px-9 pt-8 pb-9"
      >
        <!--
          One sheet with padding, not four ruled bands each with padding of
          their own. `.b-modal` has no internal borders at all: the only rule
          in it is the one above the footer.
        -->
        <div class="flex items-start justify-between gap-4 mb-6 shrink-0">
          <div class="min-w-0">
            <DialogTitle class="font-display text-[26px] leading-tight font-medium text-foreground">
              Drafts
            </DialogTitle>
            <DialogDescription class="mt-1.5 text-sm text-muted-500">
              Kept in your library, so a backup carries them. Export one to a file to
              move it to another machine
            </DialogDescription>
          </div>

          <button
            type="button"
            class="h-9 px-3.5 shrink-0 inline-flex items-center gap-2 rounded-md border border-line-strong text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            @click="fileInput?.click()"
          >
            <Icon icon="material-symbols:upload-file-outline" class="size-4 shrink-0 block" />
            Import
          </button>

          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="hidden"
            @change="handleFilePick"
          />
        </div>

        <!-- A parsed file, named before it is kept. -->
        <div v-if="pendingImport" class="mb-6 rounded-md bg-muted-50 p-4 space-y-2 shrink-0">
          <div class="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon icon="material-symbols:upload-file" class="text-lg text-muted-500" />
            Import draft
          </div>
          <div class="text-xs text-muted-600">
            {{ pendingImport.clips.length }} clip{{ pendingImport.clips.length === 1 ? '' : 's' }}
            <span v-if="pendingImport.audio.length">
              · {{ pendingImport.audio.length }} track{{ pendingImport.audio.length === 1 ? '' : 's' }}
            </span>
            . Clips and music are matched by id, so anything this machine does not
            have is skipped when you open it.
          </div>
          <div class="flex gap-2">
            <BaseField class="flex-1">
              <input
                v-model="importName"
                type="text"
                :placeholder="pendingImport.name"
                class="text-sm"
                @keydown.enter="confirmImport"
              />
            </BaseField>
            <button
              type="button"
              class="h-9 px-3.5 shrink-0 inline-flex items-center rounded-md bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover outline-none focus-visible:focus-ring transition-colors duration-150"
              @click="confirmImport"
            >
              Import
            </button>
            <button
              type="button"
              class="h-9 px-3 shrink-0 inline-flex items-center rounded-md text-sm text-muted-600 hover:text-foreground outline-none focus-visible:focus-ring transition-colors duration-150"
              @click="cancelImport"
            >
              Cancel
            </button>
          </div>
        </div>

        <div class="mb-6 space-y-2 shrink-0">
          <label class="block text-xs font-medium uppercase tracking-label text-muted-400">
            Save the current timeline
          </label>
          <div class="flex items-end gap-3">
            <BaseField class="flex-1">
              <input
                ref="input"
                v-model="name"
                type="text"
                :placeholder="defaultName()"
                @keydown.enter="save"
              />
            </BaseField>
            <button
              type="button"
              class="h-9 px-3.5 shrink-0 inline-flex items-center gap-2 rounded-md border border-line-strong text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
              :disabled="!canSave || saving"
              @click="save"
            >
              <BaseSpinner v-if="saving" class="size-4 shrink-0 block" />
              <Icon v-else icon="material-symbols:bookmark-add" class="size-4 shrink-0 block" />
              Save
            </button>
          </div>
          <p v-if="!canSave" class="text-xs text-muted-500">
            Add a clip or a track before saving a draft.
          </p>
          <p v-else-if="activeId" class="text-xs text-muted-500">
            Saving makes a separate copy. The draft you have open keeps updating on its own.
          </p>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto scroll-p-1.5 border-t border-border pt-4">
          <div v-if="drafts.length === 0" class="text-center py-6">
            <div class="mb-3 flex items-center justify-center">
              <Icon icon="material-symbols:bookmarks-outline" class="size-8 shrink-0 block text-muted-300" />
            </div>
            <p class="text-sm font-medium text-muted-700">No saved drafts</p>
            <p class="text-xs mt-1 text-muted-500">
              Your last session is offered back automatically. This is for keeping more than one.
            </p>
          </div>

          <ul v-else class="space-y-2">
            <li
              v-for="draft in drafts"
              :key="draft.id"
              class="flex items-center gap-3 py-3 border-t border-border first:border-t-0"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-foreground truncate flex items-center gap-2">
                  {{ draft.name }}
                  <span
                    v-if="draft.id === activeId"
                    class="text-xs font-normal text-accent-ink shrink-0"
                  >
                    editing
                  </span>
                </div>
                <div class="text-xs text-muted-500 mt-0.5">
                  {{ draft.clips.length }} clip{{ draft.clips.length === 1 ? '' : 's' }}
                  <span v-if="draft.audio.length">
                    · {{ draft.audio.length }} track{{ draft.audio.length === 1 ? '' : 's' }}
                  </span>
                  · {{ formatRelativeTime(draft.updatedAt) }}
                </div>
              </div>

              <button
                type="button"
                class="h-8 px-3 shrink-0 inline-flex items-center rounded-md border border-line-strong text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none"
                :disabled="draft.id === activeId"
                :title="draft.id === activeId ? 'Already open' : 'Load this draft onto the timeline'"
                @click="emit('open-draft', draft)"
              >
                Open
              </button>
              <button
                type="button"
                class="size-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-500 hover:text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
                title="Export to a file"
                aria-label="Export this draft to a file"
                @click="downloadDraft(draft)"
              >
                <Icon icon="material-symbols:download" class="size-4 shrink-0 block" />
              </button>
              <button
                class="p-1.5 rounded-lg text-muted-500 hover:text-danger-ink hover:bg-danger/8 transition-colors"
                title="Delete draft"
                @click="emit('delete-draft', draft)"
              >
                <Icon icon="material-symbols:delete-outline" class="text-lg" />
              </button>
            </li>
          </ul>
        </div>

        <!--
          `.b-modal-foot`: one row with a hairline above it and 18px of space
          between the two. It had 24px of padding of its own on top of the
          sheet's, so the button floated a long way below the list.
        -->
        <div class="mt-6 pt-4 border-t border-border flex items-center justify-end gap-3 shrink-0">
          <DialogClose as-child>
            <button
              type="button"
              class="h-9 px-3.5 inline-flex items-center rounded-md border border-line-strong text-sm font-medium text-foreground hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150"
            >
              Done
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
