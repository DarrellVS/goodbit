<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { getClip, getClipMeta, type ClipMeta } from '../services/clips';
import { useToastStore } from '../stores/toast';
import { useCollectionsStore } from '../stores/collections';
import type { Clip } from '../types/clip';
import ClipNameInput from '../components/App/ClipNameInput.vue';
import ClipTags from '../components/App/ClipTags.vue';
import ClipStarButton from '../components/App/ClipStarButton.vue';
import ClipCollections from '../components/App/ClipCollections.vue';
import ClipActionsMenu from '../components/App/ClipActionsMenu.vue';
import ClipVideoPlayer from '../components/ClipDetail/ClipVideoPlayer.vue';
import ClipPublishedInfo from '../components/ClipDetail/ClipPublishedInfo.vue';
import ClipFileInfo from '../components/ClipDetail/ClipFileInfo.vue';
import ClipVideoInfo from '../components/ClipDetail/ClipVideoInfo.vue';
import ClipNotesSection from '../components/ClipDetail/ClipNotesSection.vue';
import ClipNotesEditor from '../components/ClipDetail/ClipNotesEditor.vue';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();
const toastStore = useToastStore();
const collectionsStore = useCollectionsStore();

const clip = ref<Clip | null>(null);
const metadata = ref<ClipMeta | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const showExactDate = ref(false);
const showNotesDialog = ref(false);
const videoPlayerRef = ref<InstanceType<typeof ClipVideoPlayer> | null>(null);

function goBack() {
  router.back();
}

function handleClipUpdated(updatedClip: Clip | null) {
  if (updatedClip) clip.value = updatedClip;
}

function handleClipDeleted() {
  router.push('/');
}

async function loadClip() {
  loading.value = true;
  error.value = null;
  
  try {
    clip.value = await getClip(Number(props.id));
    metadata.value = await getClipMeta(Number(props.id));
  } catch (err: any) {
    console.error('Failed to load clip:', err);
    error.value = err?.response?.data?.error || 'Failed to load clip';
  } finally {
    loading.value = false;
  }
}

function handleTimestampClick(seconds: number) {
  const videoEl = videoPlayerRef.value?.videoElement;
  if (!videoEl) return;
  
  videoEl.currentTime = seconds;
  videoEl.play();
  
  // Scroll to video
  videoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toastStore.success(`Jumped to ${seconds}s`);
}

function toggleDateDisplay() {
  showExactDate.value = !showExactDate.value;
}

onMounted(() => {
  void loadClip();
  void collectionsStore.fetchCollections();
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
            <ClipActionsMenu 
              :clip="clip" 
              @updated="handleClipUpdated" 
              @deleted="handleClipDeleted"
            />
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
          <ClipVideoPlayer ref="videoPlayerRef" :clip="clip" />

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

          <!-- Collections Section -->
          <div class="bg-gradient-to-br from-white to-purple-50/30 rounded-2xl p-6 border border-gray-300">
            <div class="flex items-center gap-2 mb-6">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Icon icon="material-symbols:folder-special-rounded" class="text-xl text-white" />
              </div>
              <h2 class="text-lg font-bold text-gray-900">Collections</h2>
            </div>

            <ClipCollections :clip="clip" />
          </div>

          <!-- Notes Section -->
          <ClipNotesSection 
            :clip="clip" 
            @edit="showNotesDialog = true"
            @timestamp-click="handleTimestampClick"
          />
        </div>

        <!-- Metadata Sidebar -->
        <div class="space-y-6">
          <ClipPublishedInfo :clip="clip" />
          <ClipFileInfo 
            :clip="clip" 
            :show-exact-date="showExactDate" 
            @toggle-date="toggleDateDisplay"
          />
          <ClipVideoInfo :metadata="metadata" />
        </div>
      </div>
    </main>

    <!-- Notes Editor Dialog -->
    <ClipNotesEditor
      v-model:open="showNotesDialog"
      :clip="clip"
      @updated="handleClipUpdated"
      @timestamp-click="handleTimestampClick"
    />
  </div>
</template>

