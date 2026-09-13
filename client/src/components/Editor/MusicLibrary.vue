<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useFormat } from '../../composables/useFormat';
import { formatTimeSimple } from '../../utils/timeFormat';
import { audioUrl } from '../../utils/mediaUrl';
import { useToastStore } from '../../stores/toast';
import { deleteAudioTrack, uploadAudioTracks } from '../../services/audio';
import type { AudioTrack } from '../../types/audio';

interface Props {
  tracks: AudioTrack[];
  loading?: boolean;
  /** Library ids currently on the music lane; shown muted here. */
  addedTrackIds?: string[];
}

interface Emits {
  (e: 'add-to-timeline', track: AudioTrack): void;
  (e: 'changed'): void;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  addedTrackIds: () => [],
});
const emit = defineEmits<Emits>();

const toastStore = useToastStore();
const { formatBytes } = useFormat();

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadProgress = ref(0);
const isDragOver = ref(false);
const previewId = ref<string | null>(null);

let previewElement: HTMLAudioElement | null = null;

const addedIds = computed(() => new Set(props.addedTrackIds));

function isAdded(track: AudioTrack): boolean {
  return addedIds.value.has(track.id);
}

async function upload(files: File[]): Promise<void> {
  if (files.length === 0) return;

  uploading.value = true;
  uploadProgress.value = 0;

  try {
    const result = await uploadAudioTracks(files, (percent) => {
      uploadProgress.value = percent;
    });

    if (result.imported > 0) {
      toastStore.success(`${result.imported} added to your music library`, 'Upload complete');
      emit('changed');
    }

    for (const error of result.errors ?? []) {
      toastStore.error(error, 'Upload failed');
    }
  } catch (error) {
    console.error('Audio upload failed:', error);
    toastStore.error('Please try again.', 'Upload failed');
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
}

function handleFilePick(event: Event): void {
  const input = event.target as HTMLInputElement;
  void upload(Array.from(input.files ?? []));
  // Same file twice in a row would not fire change without this.
  input.value = '';
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);
  void upload(files.filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name)));
}

function stopPreview(): void {
  previewElement?.pause();
  previewElement = null;
  previewId.value = null;
}

function togglePreview(track: AudioTrack): void {
  if (previewId.value === track.id) {
    stopPreview();
    return;
  }

  stopPreview();
  previewElement = new Audio(audioUrl(track.id, track.modifiedAt));
  previewElement.volume = 0.7;
  previewElement.addEventListener('ended', stopPreview, { once: true });
  previewElement.play().catch(() => stopPreview());
  previewId.value = track.id;
}

function remove(track: AudioTrack): void {
  toastStore.confirm(
    `"${track.displayName}" moves to the Recycle Bin.`,
    async () => {
      try {
        if (previewId.value === track.id) stopPreview();
        await deleteAudioTrack(track.id);
        toastStore.success(`"${track.displayName}" moved to the Recycle Bin`);
        emit('changed');
      } catch (error) {
        console.error('Failed to delete audio track:', error);
        toastStore.error('Please try again.', 'Delete failed');
      }
    },
    'Delete track?'
  );
}

onBeforeUnmount(stopPreview);
</script>

<template>
  <div class="flex flex-col h-full bg-white/60 backdrop-blur-sm rounded-xl border border-gray-300 overflow-hidden">
    <div class="flex-shrink-0 px-4 py-3 bg-orange-50/50 border-b border-gray-300 flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-gray-900">
        <Icon icon="material-symbols:library-music" class="text-orange-500" />
        Music
      </h3>
      <span class="text-xs text-gray-500">{{ tracks.length }}</span>
    </div>

    <div
      class="flex-shrink-0 m-3 rounded-lg border-2 border-dashed transition-colors"
      :class="isDragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300 bg-white/60'"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <button
        class="w-full px-3 py-4 flex flex-col items-center gap-1 text-center"
        :disabled="uploading"
        @click="fileInput?.click()"
      >
        <Icon
          :icon="uploading ? 'material-symbols:progress-activity' : 'material-symbols:upload'"
          class="text-xl text-orange-500"
          :class="{ 'animate-spin': uploading }"
        />
        <span class="text-sm font-medium text-gray-800">
          {{ uploading ? `Uploading… ${uploadProgress}%` : 'Upload music' }}
        </span>
        <span v-if="!uploading" class="text-xs text-gray-500">Drop files or click — mp3, wav, m4a, ogg, flac</span>
      </button>

      <div v-if="uploading" class="h-1 mx-3 mb-3 bg-orange-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-[width] duration-150"
          :style="{ width: `${uploadProgress}%` }"
        />
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
        multiple
        class="hidden"
        @change="handleFilePick"
      />
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-gray-500 text-xs">
      <Icon icon="material-symbols:progress-activity" class="text-xl animate-spin text-orange-400" />
    </div>

    <div v-else-if="tracks.length === 0" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center">
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-orange-100 flex items-center justify-center">
          <Icon icon="material-symbols:music-note" class="text-2xl text-orange-400" />
        </div>
        <p class="text-sm font-medium text-gray-700">No music yet</p>
        <p class="text-xs mt-1 text-gray-500">Upload a track to lay under your clips</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="group rounded-lg border bg-white/80 hover:bg-white transition-all overflow-hidden"
        :class="isAdded(track) ? 'border-orange-400/60' : 'border-gray-300 hover:border-orange-500/50'"
      >
        <button
          class="w-full text-left px-2.5 pt-2.5 pb-1.5"
          :title="isAdded(track) ? 'Already on the timeline — click to place another copy' : 'Add to the timeline'"
          @click="emit('add-to-timeline', track)"
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5 w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
              <Icon icon="material-symbols:add" class="text-white text-base" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                {{ track.displayName }}
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-gray-600 font-mono">
                <span>{{ formatTimeSimple(track.durationSec) }}</span>
                <span>·</span>
                <span>{{ formatBytes(track.sizeBytes) }}</span>
                <span v-if="isAdded(track)" class="text-orange-600 font-sans font-medium">on timeline</span>
              </div>
            </div>
          </div>
        </button>

        <div class="flex items-center justify-end gap-1 px-2 pb-2">
          <button
            class="p-1.5 rounded-md hover:bg-orange-50 text-gray-600 hover:text-orange-600 transition-colors"
            :title="previewId === track.id ? 'Stop preview' : 'Preview'"
            @click.stop="togglePreview(track)"
          >
            <Icon
              :icon="previewId === track.id ? 'material-symbols:stop-circle' : 'material-symbols:play-circle'"
              class="text-lg"
            />
          </button>
          <button
            class="p-1.5 rounded-md hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors"
            title="Delete track"
            @click.stop="remove(track)"
          >
            <Icon icon="material-symbols:delete-outline" class="text-lg" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
