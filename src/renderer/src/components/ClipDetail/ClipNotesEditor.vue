<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import { updateClipNotes } from '../../services/clips';
import BaseDialog from '../Base/BaseDialog.vue';
import MarkdownEditor from '../Base/MarkdownEditor.vue';
import type { Clip } from '../../types/clip';

interface Props {
  open: boolean;
  clip: Clip | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'updated', clip: Clip | null): void;
  (e: 'timestamp-click', seconds: number): void;
}>();

const toastStore = useToastStore();
const notes = ref<string>('');
const savingNotes = ref(false);

watch(() => props.open, (isOpen) => {
  if (isOpen && props.clip) {
    notes.value = props.clip.notes || '';
  }
});

async function saveNotes() {
  if (savingNotes.value || !props.clip) return;
  
  savingNotes.value = true;
  try {
    const updatedClip = await updateClipNotes(props.clip.id, notes.value || null);
    emit('updated', { ...updatedClip });
    emit('update:open', false);
    toastStore.success('Notes saved successfully');
  } catch (error) {
    console.error('Failed to save notes:', error);
    toastStore.error('Failed to save notes');
  } finally {
    savingNotes.value = false;
  }
}

function cancelEdit() {
  emit('update:open', false);
}
</script>

<template>
  <BaseDialog
    :open="open"
    title="Edit Notes & Annotations"
    max-width="xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="p-6">
      <MarkdownEditor
        v-model="notes"
        placeholder="Add notes, context, or annotations about this clip... Markdown is supported for rich formatting."
        @timestamp-click="(seconds) => emit('timestamp-click', seconds)"
      />
      
      <div class="mt-4 flex items-center gap-3 text-xs text-gray-600 bg-gradient-to-r from-orange-50 to-amber-50 p-3 rounded-lg border border-orange-200 dark:text-slate-400">
        <Icon icon="material-symbols:info-rounded" class="text-orange-600 text-lg flex-shrink-0" />
        <div class="space-y-1">
          <p class="font-medium">Use Markdown for rich formatting and add timestamps like <code class="px-1.5 py-0.5 bg-white rounded dark:bg-slate-900">1:30</code> to mark specific moments.</p>
          <p>Click timestamps in preview mode to jump to that moment in the video!</p>
        </div>
      </div>
    </div>
    
    <template #footer>
      <div class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
        <button
          class="px-5 py-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-medium text-gray-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:text-slate-300"
          @click="cancelEdit"
        >
          Cancel
        </button>
        <button
          class="px-5 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-medium transition-all border border-orange-700"
          :disabled="savingNotes"
          @click="saveNotes"
        >
          {{ savingNotes ? 'Saving...' : 'Save Notes' }}
        </button>
      </div>
    </template>
  </BaseDialog>
</template>

