<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getClip, getClipMeta, type ClipMeta } from '../services/clips';
import { useClipActionsHandlers } from '../composables/useClipActionsHandlers';
import { useClipTags } from '../composables/useClipTags';
import { useFormat } from '../composables/useFormat';
import { withAuthToken } from '../utils/withAuthToken';
import { formatRelativeTime, formatExactDate } from '../helpers/dateFormat';
import { formatDuration } from '../utils/formatters';
import type { Clip } from '../types/clip';
import ClipNameInput from '../components/App/ClipNameInput.vue';
import ClipTags from '../components/App/ClipTags.vue';
import ClipStarButton from '../components/App/ClipStarButton.vue';
import ClipPublishedBadge from '../components/App/ClipPublishedBadge.vue';
import BasePopover from '../components/Base/BasePopover.vue';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();
const { formatBytes } = useFormat();

const clip = ref<Clip | null>(null);
const metadata = ref<ClipMeta | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showExactDate = ref(false);

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
  return formatDuration(metadata.value.durationSec);
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
  } catch (err) {
    console.error('Failed to load clip:', err);
    error.value = 'Failed to load clip. It may have been deleted.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadClip();
});
</script>

<template>
  <div class="h-full overflow-auto bg-gradient-to-br from-gray-50 to-white">
    <!-- Header -->
    <header class="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <button
            class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            @click="goBack"
          >
            <Icon icon="material-symbols:arrow-back" class="text-xl" />
            <span class="font-medium">Back</span>
          </button>
          
          <div v-if="clip" class="flex items-center gap-2">
            <ClipStarButton :clip="clip" @updated="clip = $event" />
            
            <button
              v-if="!clip.published"
              class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 transition-all disabled:opacity-50"
              :disabled="isPublishing"
              @click="onPublish"
            >
              <Icon icon="material-symbols:cloud-upload" class="text-lg" />
              <span>{{ isPublishing ? 'Publishing...' : 'Publish' }}</span>
            </button>
            
            <button
              v-else
              class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition-colors"
              @click="onUnpublish"
            >
              <Icon icon="material-symbols:cloud-off" class="text-lg" />
              <span>Unpublish</span>
            </button>
            
            <BasePopover side="bottom" :side-offset="8">
              <template #trigger>
                <button
                  class="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Icon icon="material-symbols:more-vert" class="text-xl" />
                </button>
              </template>
              
              <div class="flex flex-col gap-1 min-w-[180px]">
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  @click="onTrim"
                >
                  <Icon icon="material-symbols:content-cut" class="text-lg" />
                  <span>Trim Clip</span>
                </button>
                
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  @click="onAdvancedEdit"
                >
                  <Icon icon="material-symbols:video-library" class="text-lg" />
                  <span>Advanced Edit</span>
                </button>
                
                <button
                  v-if="clip.publishedUrl"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  @click="onCopyUrl"
                >
                  <Icon icon="material-symbols:link" class="text-lg" />
                  <span>Copy URL</span>
                </button>
                
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  @click="onReveal"
                >
                  <Icon icon="material-symbols:folder-open" class="text-lg" />
                  <span>Reveal in Folder</span>
                </button>
                
                <div class="h-px bg-gray-200 my-1" />
                
                <button
                  class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors text-left"
                  @click="onDelete"
                >
                  <Icon icon="material-symbols:delete" class="text-lg" />
                  <span>Delete Clip</span>
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
          <!-- Published Badge -->
          <ClipPublishedBadge v-if="clip.published" :published="clip.published" class="mb-4" />
          
          <!-- Video Player -->
          <div class="relative rounded-2xl overflow-hidden shadow-2xl bg-black">
            <video 
              :src="videoUrl" 
              :poster="posterUrl"
              class="w-full aspect-video object-contain" 
              controls
              autoplay
            />
          </div>

          <!-- Clip Title & Game -->
          <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <ClipNameInput :clip="clip" @updated="clip = $event" />
          </div>

          <!-- Tags Section -->
          <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div class="flex items-center gap-2 mb-4">
              <Icon icon="material-symbols:label" class="text-xl text-orange-500" />
              <h2 class="text-lg font-semibold">Tags</h2>
            </div>
            <ClipTags :clip="clip" @updated="clip = $event" />
          </div>
        </div>

        <!-- Metadata Sidebar -->
        <div class="space-y-6">
          <!-- File Information -->
          <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div class="flex items-center gap-2 mb-4">
              <Icon icon="material-symbols:info" class="text-xl text-orange-500" />
              <h2 class="text-lg font-semibold">File Information</h2>
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
          <div v-if="metadata" class="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div class="flex items-center gap-2 mb-4">
              <Icon icon="material-symbols:play-circle" class="text-xl text-orange-500" />
              <h2 class="text-lg font-semibold">Video Information</h2>
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

          <!-- Publishing Information -->
          <div v-if="clip.published && clip.publishedUrl" class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-6 shadow-sm border border-orange-200">
            <div class="flex items-center gap-2 mb-4">
              <Icon icon="material-symbols:cloud-done" class="text-xl text-orange-600" />
              <h2 class="text-lg font-semibold text-orange-900">Published</h2>
            </div>
            
            <div class="space-y-3">
              <p class="text-sm text-orange-800">
                This clip has been published and is publicly accessible.
              </p>
              
              <button
                class="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white hover:bg-gray-50 border border-orange-200 transition-colors text-orange-900 font-medium"
                @click="onCopyUrl"
              >
                <Icon icon="material-symbols:link" class="text-lg" />
                <span>Copy Public URL</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

