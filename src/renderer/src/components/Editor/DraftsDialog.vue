<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
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
      <DialogOverlay class="fixed inset-0 bg-scrim z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-md shadow-pop border border-border w-full max-w-lg flex flex-col outline-hidden modal-content-animate max-h-[85vh]"
      >
        <div class="p-6 border-b border-border flex items-start justify-between gap-4">
          <div>
            <DialogTitle class="text-xl font-bold text-foreground mb-1">Drafts</DialogTitle>
            <DialogDescription class="text-sm text-muted-600">
              Kept in your library, so a backup carries them. Export one to a file to
              move it to another machine
            </DialogDescription>
          </div>

          <button
            class="px-3 py-2 rounded-lg border border-border text-muted-700 text-xs font-medium hover:bg-muted-50 transition-colors inline-flex items-center gap-1.5 shrink-0"
            @click="fileInput?.click()"
          >
            <Icon icon="material-symbols:upload-file-outline" class="text-base" />
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
        <div v-if="pendingImport" class="p-6 border-b border-border bg-accent/5 space-y-2">
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
            <input
              v-model="importName"
              type="text"
              :placeholder="pendingImport.name"
              class="flex-1 px-4 py-2.5 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              @keydown.enter="confirmImport"
            />
            <button
              class="px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors"
              @click="confirmImport"
            >
              Import
            </button>
            <button
              class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-card transition-colors"
              @click="cancelImport"
            >
              Cancel
            </button>
          </div>
        </div>

        <div class="p-6 border-b border-border space-y-2">
          <label class="block text-xs font-semibold text-muted-600 uppercase tracking-wide">
            Save the current timeline
          </label>
          <div class="flex gap-2">
            <input
              ref="input"
              v-model="name"
              type="text"
              :placeholder="defaultName()"
              class="flex-1 px-4 py-2.5 border border-border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
              @keydown.enter="save"
            />
            <button
              class="px-4 py-2 rounded-lg bg-accent text-accent-fg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              :disabled="!canSave || saving"
              @click="save"
            >
              <BaseSpinner v-if="saving" class="text-lg" />
              <Icon v-else icon="material-symbols:bookmark-add" class="text-lg" />
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

        <div class="flex-1 overflow-y-auto p-6">
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
              class="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-accent transition-colors"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                  {{ draft.name }}
                  <span
                    v-if="draft.id === activeId"
                    class="px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-ink text-[10px] font-semibold shrink-0"
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
                class="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent-ink border border-accent/30 hover:bg-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="draft.id === activeId"
                :title="draft.id === activeId ? 'Already open' : 'Load this draft onto the timeline'"
                @click="emit('open-draft', draft)"
              >
                Open
              </button>
              <button
                class="p-1.5 rounded-lg text-muted-500 hover:text-accent-ink hover:bg-accent/8 transition-colors"
                title="Export to a file"
                @click="downloadDraft(draft)"
              >
                <Icon icon="material-symbols:download" class="text-lg" />
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

        <div class="p-6 border-t border-border flex justify-end">
          <DialogClose as-child>
            <button class="px-4 py-2 rounded-lg border border-border text-muted-700 font-medium hover:bg-muted-50 transition-colors">
              Done
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
