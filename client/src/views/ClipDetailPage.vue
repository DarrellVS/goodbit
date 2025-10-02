<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getClip, getClipMeta, updateClipNotes, type ClipMeta } from '../services/clips';
import { useClipActionsHandlers } from '../composables/useClipActionsHandlers';
import { useClipTags } from '../composables/useClipTags';
import { useFormat } from '../composables/useFormat';
import { useToastStore } from '../stores/toast';
import { withAuthToken } from '../utils/withAuthToken';
import { formatRelativeTime, formatExactDate } from '../helpers/dateFormat';
import { formatTimeSimple } from '../utils/timeFormat';
import type { Clip } from '../types/clip';
import ClipNameInput from '../components/App/ClipNameInput.vue';
import ClipTags from '../components/App/ClipTags.vue';
import ClipStarButton from '../components/App/ClipStarButton.vue';
import BasePopover from '../components/Base/BasePopover.vue';
import BaseDialog from '../components/Base/BaseDialog.vue';
import MarkdownEditor from '../components/Base/MarkdownEditor.vue';
import NotesDisplay from '../components/Base/NotesDisplay.vue';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();
const toastStore = useToastStore();
const { formatBytes } = useFormat();

const clip = ref<Clip | null>(null);
const metadata = ref<ClipMeta | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showExactDate = ref(false);
const notes = ref<string>('');
const savingNotes = ref(false);
const videoElement = ref<HTMLVideoElement | null>(null);
const showNotesDialog = ref(false);

const videoUrl = computed(() => 
  clip.value ? withAuthToken(`/api/clips/${clip.value.id}/stream`) : ''
);

const posterUrl = computed(() => 
  clip.value ? withAuthToken(`/api/clips/${clip.value.id}/thumbnail`) : ''
);

const displayDate = computed(() => {
  if (!clip.value) return '';
  return showExactDate.value 
    ? formatExactDate(clip.value.fileModifiedAt)
    : formatRelativeTime(clip.value.fileModifiedAt);
});

const durationFormatted = computed(() => {
  if (!metadata.value?.durationSec) return 'Unknown';
  return formatTimeSimple(metadata.value.durationSec);
});

const resolution = computed(() => {
  if (!metadata.value?.width || !metadata.value?.height) return 'Unknown';
  return `${metadata.value.width}x${metadata.value.height}`;
});

const {
  onPublish,
  onUnpublish,
  onCopyUrl,
  onReveal,
  onTrim,
  onDelete,
  isPublishing,
} = useClipActionsHandlers({
  clip: computed(() => clip.value!),
  emitUpdated: (updatedClip) => {
    clip.value = updatedClip;
  },
  emitDeleted: () => {
    router.push('/');
  },
  router,
});

function onAdvancedEdit() {
  if (!clip.value) return;
  router.push(`/editor?clip=${clip.value.id}`);
}

function goBack() {
  router.back();
}

async function loadClip() {
  loading.value = true;
  error.value = null;
  
  try {
    const [clipData, metaData] = await Promise.all([
      getClip(Number(props.id)),
      getClipMeta(Number(props.id)).catch(() => null),
    ]);
    
    clip.value = clipData;
    metadata.value = metaData;
    notes.value = clipData.notes || '';
  } catch (err) {
    console.error('Failed to load clip:', err);
    error.value = 'Failed to load clip. It may have been deleted.';
  } finally {
    loading.value = false;
  }
}

async function saveNotes() {
  if (!clip.value || savingNotes.value) return;
  
  savingNotes.value = true;
  try {
    const updatedClip = await updateClipNotes(clip.value.id, notes.value || null);
    clip.value = { ...updatedClip }; // Force reactivity with new object reference
    showNotesDialog.value = false;
    toastStore.success('Notes saved successfully');
  } catch (err) {
    console.error('Failed to save notes:', err);
    toastStore.error('Failed to save notes');
  } finally {
    savingNotes.value = false;
  }
}

function openNotesEditor() {
  showNotesDialog.value = true;
}

function handleTimestampClick(seconds: number) {
  if (!videoElement.value) return;
  
  videoElement.value.currentTime = seconds;
  videoElement.value.play();
  
  // Scroll to video
  videoElement.value.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toastStore.success(`Jumped to ${formatTimeSimple(seconds)}`);
}

onMounted(() => {
  void loadClip();
});
</script>

<template>
  <div class="h-full overflow-auto bg-gradient-to-br from-slate-50 via-white to-orange-50/30">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-200/80 shadow-sm">
      <div class="max-w-7xl mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <button
            class="flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-gradient-to-r hover:from-gray-100 hover:to-gray-50 transition-all group"
            @click="goBack"
          >
            <Icon icon="material-symbols:arrow-back-rounded" class="text-xl group-hover:-translate-x-1 transition-transform" />
            <span class="font-semibold">Back</span>
          </button>
          
          <div v-if="clip" class="flex items-center gap-3">
            <ClipStarButton :clip="clip" @updated="clip = $event" />
            
            <button
              v-if="!clip.published"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50 font-medium border border-orange-700"
              :disabled="isPublishing"
              @click="onPublish"
            >
              <Icon icon="material-symbols:cloud-upload-rounded" class="text-xl" />
              <span>{{ isPublishing ? 'Publishing...' : 'Publish' }}</span>
            </button>
            
            <button
              v-else
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700 transition-all font-medium border border-gray-700"
              @click="onUnpublish"
            >
              <Icon icon="material-symbols:cloud-off-rounded" class="text-xl" />
              <span>Unpublish</span>
            </button>
            
            <BasePopover side="bottom" :side-offset="8">
              <template #trigger>
                <button
                  class="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-50 transition-all"
                >
                  <Icon icon="material-symbols:more-vert-rounded" class="text-2xl text-gray-700" />
                </button>
              </template>
              
              <div class="flex flex-col gap-0.5 min-w-[180px]">
                <button
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 transition-all text-left group"
                  @click="onTrim"
                >
                  <Icon icon="material-symbols:content-cut-rounded" class="text-lg text-orange-600" />
                  <span class="text-sm font-medium">Trim Clip</span>
                </button>
                
                <button
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 transition-all text-left group"
                  @click="onAdvancedEdit"
                >
                  <Icon icon="material-symbols:video-library-rounded" class="text-lg text-orange-600" />
                  <span class="text-sm font-medium">Advanced Edit</span>
                </button>
                
                <button
                  v-if="clip.publishedUrl"
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 transition-all text-left group"
                  @click="onCopyUrl"
                >
                  <Icon icon="material-symbols:link-rounded" class="text-lg text-orange-600" />
                  <span class="text-sm font-medium">Copy URL</span>
                </button>
                
                <button
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-gradient-to-r hover:from-orange-50 hover:to-amber-50 transition-all text-left group"
                  @click="onReveal"
                >
                  <Icon icon="material-symbols:folder-open-rounded" class="text-lg text-orange-600" />
                  <span class="text-sm font-medium">Reveal in Folder</span>
                </button>
                
                <div class="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-1" />
                
                <button
                  class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-all text-left group"
                  @click="onDelete"
                >
                  <Icon icon="material-symbols:delete-rounded" class="text-lg" />
                  <span class="text-sm font-medium">Delete Clip</span>
                </button>
              </div>
            </BasePopover>
          </div>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center space-y-4">
        <Icon icon="material-symbols:progress-activity" class="text-6xl text-orange-500 animate-spin" />
        <p class="text-gray-600">Loading clip...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error || !clip" class="flex items-center justify-center h-96">
      <div class="text-center space-y-4 max-w-md">
        <Icon icon="material-symbols:error-outline" class="text-6xl text-red-500" />
        <h2 class="text-2xl font-bold text-gray-900">Clip Not Found</h2>
        <p class="text-gray-600">{{ error || 'The clip you are looking for does not exist.' }}</p>
        <button
          class="px-6 py-3 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors"
          @click="goBack"
        >
          Go Back
        </button>
      </div>
    </div>

    <!-- Content -->
    <main v-else class="max-w-7xl mx-auto px-6 py-8">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Video Player Section -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Video Player -->
          <div class="relative group">
            <div v-if="clip.published" class="absolute top-4 left-4 z-10">
              <div class="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium border border-emerald-700">
                <Icon icon="material-symbols:cloud-done-rounded" class="text-xl" />
                <span>Published</span>
              </div>
            </div>
            
            <div class="relative rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-black border border-gray-300">
              <video 
                ref="videoElement"
                :src="videoUrl" 
                :poster="posterUrl"
                class="w-full object-contain" 
                controls
                autoplay
              />
            </div>
          </div>

          <!-- Clip Title & Game -->
          <div class="bg-white rounded-2xl p-6 border border-gray-300">
            <ClipNameInput :clip="clip" @updated="clip = $event" />
          </div>

          <!-- Tags Section -->
          <div class="bg-white rounded-2xl p-6 border border-gray-300 group">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center">
                <Icon icon="material-symbols:label-rounded" class="text-xl text-orange-600" />
              </div>
              <h2 class="text-lg font-bold text-gray-900">Tags</h2>
            </div>
            <ClipTags :clip="clip" @updated="clip = $event" />
          </div>

          <!-- Notes Section -->
          <div class="bg-gradient-to-br from-white to-orange-50/30 rounded-2xl p-6 border border-gray-300">
            <div class="flex items-center gap-2 mb-6">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
                <Icon icon="material-symbols:note-rounded" class="text-xl text-white" />
              </div>
              <h2 class="text-lg font-bold text-gray-900">Notes & Annotations</h2>
            </div>
            
            <NotesDisplay
              :notes="clip.notes || null"
              @edit="openNotesEditor"
              @timestamp-click="handleTimestampClick"
            />
          </div>
        </div>

        <!-- Metadata Sidebar -->
        <div class="space-y-6">
          <!-- Publishing Information -->
          <div v-if="clip.published && clip.publishedUrl" class="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 rounded-2xl p-6 border border-gray-300">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
                <Icon icon="material-symbols:cloud-done-rounded" class="text-xl text-white" />
              </div>
              <h2 class="text-lg font-bold text-emerald-900">Published</h2>
            </div>
            
            <div class="space-y-3">
              <p class="text-sm text-emerald-800">
                This clip has been published and is publicly accessible.
              </p>
              
              <button
                class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium transition-all"
                @click="onCopyUrl"
              >
                <Icon icon="material-symbols:link-rounded" class="text-xl" />
                <span>Copy Public URL</span>
              </button>
            </div>
          </div>

          <!-- File Information -->
          <div class="bg-white rounded-2xl p-6 border border-gray-300">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                <Icon icon="material-symbols:folder-rounded" class="text-xl text-blue-600" />
              </div>
              <h2 class="text-lg font-bold text-gray-900">File Information</h2>
            </div>
            
            <div class="space-y-4">
              <div>
                <div class="text-sm text-gray-500 mb-1">Filename</div>
                <div class="text-sm font-mono bg-gray-50 px-3 py-2 rounded-lg break-all">
                  {{ clip.filename }}
                </div>
              </div>
              
              <div>
                <div class="text-sm text-gray-500 mb-1">Size</div>
                <div class="text-sm font-medium">{{ formatBytes(clip.sizeBytes) }}</div>
              </div>
              
              <div>
                <div class="text-sm text-gray-500 mb-1">Modified</div>
                <time 
                  :datetime="clip.fileModifiedAt"
                  class="text-sm font-medium cursor-default"
                  @mouseenter="showExactDate = true"
                  @mouseleave="showExactDate = false"
                >
                  {{ displayDate }}
                </time>
              </div>
              
              <div>
                <div class="text-sm text-gray-500 mb-1">File Path</div>
                <div class="text-xs font-mono bg-gray-50 px-3 py-2 rounded-lg break-all text-gray-600">
                  {{ clip.relPath }}
                </div>
              </div>
            </div>
          </div>

          <!-- Video Information -->
          <div v-if="metadata" class="bg-white rounded-2xl p-6 border border-gray-300">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Icon icon="material-symbols:play-circle-rounded" class="text-xl text-purple-600" />
              </div>
              <h2 class="text-lg font-bold text-gray-900">Video Information</h2>
            </div>
            
            <div class="space-y-4">
              <div>
                <div class="text-sm text-gray-500 mb-1">Duration</div>
                <div class="text-sm font-medium">{{ durationFormatted }}</div>
              </div>
              
              <div>
                <div class="text-sm text-gray-500 mb-1">Resolution</div>
                <div class="text-sm font-medium">{{ resolution }}</div>
              </div>
              
              <div v-if="metadata.codec">
                <div class="text-sm text-gray-500 mb-1">Codec</div>
                <div class="text-sm font-medium font-mono">{{ metadata.codec }}</div>
              </div>
              
              <div v-if="metadata.fps">
                <div class="text-sm text-gray-500 mb-1">Frame Rate</div>
                <div class="text-sm font-medium">{{ metadata.fps }} fps</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Notes Editor Dialog -->
    <BaseDialog
      v-model:open="showNotesDialog"
      title="Edit Notes & Annotations"
      max-width="xl"
    >
      <div class="p-6">
        <MarkdownEditor
          v-model="notes"
          placeholder="Add notes, context, or annotations about this clip... Markdown is supported for rich formatting."
          @timestamp-click="handleTimestampClick"
        />
        
        <div class="mt-4 flex items-center gap-3 text-xs text-gray-600 bg-gradient-to-r from-orange-50 to-amber-50 p-3 rounded-lg border border-orange-200">
          <Icon icon="material-symbols:info-rounded" class="text-orange-600 text-lg flex-shrink-0" />
          <div class="space-y-1">
            <p class="font-medium">Use Markdown for rich formatting and add timestamps like <code class="px-1.5 py-0.5 bg-white rounded">1:30</code> to mark specific moments.</p>
            <p>Click timestamps in preview mode to jump to that moment in the video!</p>
          </div>
        </div>
      </div>
      
      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <button
            class="px-5 py-2.5 rounded-xl hover:bg-gray-100 transition-colors font-medium"
            @click="showNotesDialog = false"
          >
            Cancel
          </button>
          <button
            class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium border border-orange-700 flex items-center gap-2"
            :disabled="savingNotes"
            @click="saveNotes"
          >
            <Icon 
              :icon="savingNotes ? 'material-symbols:progress-activity' : 'material-symbols:save-rounded'" 
              class="text-xl"
              :class="{ 'animate-spin': savingNotes }"
            />
            <span>{{ savingNotes ? 'Saving...' : 'Save Notes' }}</span>
          </button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

