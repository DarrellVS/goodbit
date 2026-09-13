<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { restoreScrollPosition } from '../utils/scroll';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../stores/toast';
import { useCollectionsStore } from '../stores/collections';
import { useClipLoader } from '../composables/useClipLoader';
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
import ShareSheet from '../components/App/ShareSheet.vue';
import { publishClip } from '../services/clips';

interface Props {
  id: string;
}

const props = defineProps<Props>();
const router = useRouter();
const toastStore = useToastStore();
const collectionsStore = useCollectionsStore();

const showExactDate = ref(false);
const showNotesDialog = ref(false);
const showShareSheet = ref(false);
const videoPlayerRef = ref<InstanceType<typeof ClipVideoPlayer> | null>(null);

const clipId = computed(() => Number(props.id));
const { clip, metadata, loading, error, loadClip, handleClipUpdated } = useClipLoader(clipId);

/**
 * A published clip shares its public link; anything else shares the address
 * this page is already streaming from, which on the LAN is the local one.
 */
/**
 * The clip's permanent public address, or nothing.
 *
 * Media is served by the `goodbit://` protocol, which only this app can
 * resolve — putting it in a QR code produced a camera saying no app can use it.
 * An unpublished clip has no permanent address, and the sheet offers to serve
 * it on the local network instead.
 */
const shareUrl = computed(() =>
  clip.value?.published && clip.value.publishedUrl ? clip.value.publishedUrl : null,
);

/** Publishing from the share sheet, so the code it was after can appear. */
async function publishFromShare(): Promise<void> {
  if (!clip.value) return;
  try {
    handleClipUpdated(await publishClip(clip.value.id));
    toastStore.success('Published — the link is ready');
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not publish this clip');
  }
}

watch(() => props.id, () => {
  void loadClip();
});

async function goBack(): Promise<void> {
  await router.back();
  restoreScrollPosition();
}

async function handleClipDeleted(): Promise<void> {
  await router.push('/');
  restoreScrollPosition();
}

function handleTimestampClick(seconds: number): void {
  const videoEl = videoPlayerRef.value?.videoElement;
  if (!videoEl) return;
  
  videoEl.currentTime = seconds;
  videoEl.play();
  videoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toastStore.success(`Jumped to ${seconds}s`);
}

function toggleDateDisplay(): void {
  showExactDate.value = !showExactDate.value;
}

onMounted(() => {
  void loadClip();
  void collectionsStore.fetchCollections();
});
</script>

<template>
  <!-- The tinted wash is a light-mode flourish; dark falls back to the page ground. -->
  <div class="h-full overflow-auto bg-gradient-to-br from-muted-50 via-card to-orange-500/4 dark:bg-none dark:bg-background">
    <!-- Header -->

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-96">
      <div class="text-center space-y-4">
        <Icon icon="material-symbols:progress-activity" class="text-6xl text-orange-500 animate-spin" />
        <p class="text-muted-600">Loading clip...</p>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error || !clip" class="flex items-center justify-center h-96">
      <div class="text-center space-y-4 max-w-md">
        <Icon icon="material-symbols:error-outline" class="text-6xl text-red-500" />
        <h2 class="text-2xl font-bold text-foreground">Clip Not Found</h2>
        <p class="text-muted-600">{{ error || 'The clip you are looking for does not exist.' }}</p>
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
          <div class="bg-card rounded-2xl p-6 border border-border">
            <ClipNameInput :clip="clip" @updated="clip = $event" />
          </div>

          <!-- Tags Section -->
          <div class="bg-card rounded-2xl p-6 border border-border group">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/16 to-amber-500/16 flex items-center justify-center">
                <Icon icon="material-symbols:label-rounded" class="text-xl text-orange-600" />
              </div>
              <h2 class="text-lg font-bold text-foreground">Tags</h2>
            </div>
            <ClipTags :clip="clip" @updated="clip = $event" />
          </div>

          <!-- Collections Section -->
          <div class="bg-gradient-to-br from-card to-purple-500/4 rounded-2xl p-6 border border-border">
            <div class="flex items-center gap-2 mb-6">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Icon icon="material-symbols:folder-special-rounded" class="text-xl text-card" />
              </div>
              <h2 class="text-lg font-bold text-foreground">Collections</h2>
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

          <!--
            The actions were floating loose in a header strip above the page.
            They belong with the other cards, and labelled: two unlabelled icons
            on a dark ground were near-invisible.
          -->
          <div class="bg-card rounded-2xl p-4 border border-border space-y-2">
            <button
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-muted-50 transition-colors text-left"
              @click="showShareSheet = true"
            >
              <Icon icon="material-symbols:qr-code-2" class="text-xl text-orange-500 flex-shrink-0" />
              <span class="text-sm font-medium text-foreground">Send to my phone</span>
            </button>

            <div class="flex items-center gap-2">
              <ClipStarButton :clip="clip" class="flex-1" @updated="clip = $event" />
              <ClipActionsMenu
                :clip="clip"
                @updated="handleClipUpdated"
                @deleted="handleClipDeleted"
              />
            </div>
          </div>
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

    <ShareSheet
      v-if="clip"
      v-model:open="showShareSheet"
      :clip-id="clip.id"
      :url="shareUrl"
      :title="clip.displayName || clip.filename"
      @publish="publishFromShare"
    />
  </div>
</template>

