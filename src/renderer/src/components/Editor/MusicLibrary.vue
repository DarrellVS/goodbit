<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatTimeSimple } from '@renderer/utils/timeFormat';
import { audioUrl } from '@renderer/utils/mediaUrl';
import { useToastStore } from '@renderer/stores/toast';
import { deleteAudioTrack, importAudioTracks, pickAudioFiles, pathForFile } from '@renderer/services/audio';
import type { AudioTrack } from '@renderer/types/audio';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

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

const uploading = ref(false);
const isDragOver = ref(false);
const previewId = ref<string | null>(null);

let previewElement: HTMLAudioElement | null = null;

const addedIds = computed(() => new Set(props.addedTrackIds));

function isAdded(track: AudioTrack): boolean {
  return addedIds.value.has(track.id);
}

/**
 * Import by path rather than by upload.
 *
 * Nothing is transferred, main reads the files off the same disk, so there is
 * no progress to report, only a spinner while it copies them in.
 */
async function upload(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  uploading.value = true;

  try {
    const result = await importAudioTracks(paths);

    if (result.imported > 0) {
      toastStore.success(`${result.imported} added to your music library`, 'Music added');
      emit('changed');
    }

    for (const error of result.errors ?? []) {
      toastStore.error(error, 'Could not add that music');
    }
  } catch (error) {
    console.error('Audio import failed:', error);
    toastStore.error((error as Error).message || 'Please try again.', 'Could not add that music');
  } finally {
    uploading.value = false;
    }
}

/** The OS picker, so the paths come from somewhere main can read. */
async function handleBrowse(): Promise<void> {
  await upload(await pickAudioFiles());
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const files = Array.from(event.dataTransfer?.files ?? []);

  void upload(
    files
      .filter(
        (file) =>
          file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name),
      )
      // A dropped File has no usable path of its own in Electron 32+.
      .map(pathForFile)
      .filter(Boolean),
  );
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
  confirmAction(
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
  <div class="flex flex-col h-full bg-card/60 backdrop-blur-sm rounded-xl border border-border overflow-hidden">
    <div class="shrink-0 px-4 py-3 bg-accent/4 border-b border-border flex items-center justify-between gap-2">
      <h3 class="text-sm font-semibold flex items-center gap-2 text-foreground">
        <Icon icon="material-symbols:library-music" class="text-accent-ink" />
        Music
      </h3>
      <span class="text-xs text-muted-500">{{ tracks.length }}</span>
    </div>

    <div
      class="shrink-0 m-3 rounded-lg border-2 border-dashed transition-colors"
      :class="isDragOver ? 'border-accent bg-accent/8' : 'border-border bg-card/60'"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <button
        class="w-full px-3 py-4 flex flex-col items-center gap-1 text-center"
        :disabled="uploading"
        @click="handleBrowse"
      >
        <BaseSpinner v-if="uploading" class="text-xl text-accent-ink" />
        <Icon v-else icon="material-symbols:upload" class="text-xl text-accent-ink" />
        <span class="text-sm font-medium text-muted-800">
          {{ uploading ? 'Adding…' : 'Add music' }}
        </span>
        <span v-if="!uploading" class="text-xs text-muted-500">Drop files or click. mp3, wav, m4a, ogg, flac</span>
      </button>

      <!--
        No progress bar: nothing is transferred any more. Main copies the files
        from the same disk, so a percentage would be inventing a number.
      -->
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-muted-500 text-xs">
      <BaseSpinner class="text-xl text-accent-ink" />
    </div>

    <div v-else-if="tracks.length === 0" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center">
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-accent/16 flex items-center justify-center">
          <Icon icon="material-symbols:music-note" class="text-2xl text-accent-ink" />
        </div>
        <p class="text-sm font-medium text-muted-700">No music yet</p>
        <p class="text-xs mt-1 text-muted-500">Upload a track to lay under your clips</p>
      </div>
    </div>

    <div v-else class="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="group rounded-lg border bg-card/80 hover:bg-card transition-all overflow-hidden"
        :class="isAdded(track) ? 'border-accent/60' : 'border-border hover:border-accent/50'"
      >
        <button
          class="w-full text-left px-2.5 pt-2.5 pb-1.5"
          :title="isAdded(track) ? 'Already on the timeline. Click to place another copy' : 'Add to the timeline'"
          @click="emit('add-to-timeline', track)"
        >
          <div class="flex items-start gap-2">
            <div class="mt-0.5 w-7 h-7 rounded-md bg-accent flex items-center justify-center shrink-0">
              <Icon icon="material-symbols:add" class="text-accent-fg text-base" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                {{ track.displayName }}
              </div>
              <div class="mt-1.5 flex items-center gap-2 text-xs text-muted-600 font-mono">
                <span>{{ formatTimeSimple(track.durationSec) }}</span>
                <span>·</span>
                <span>{{ formatBytes(track.sizeBytes) }}</span>
                <span v-if="isAdded(track)" class="text-accent-ink font-sans font-medium">on timeline</span>
              </div>
            </div>
          </div>
        </button>

        <div class="flex items-center justify-end gap-1 px-2 pb-2">
          <button
            class="p-1.5 rounded-md hover:bg-accent/8 text-muted-600 hover:text-accent-ink transition-colors"
            :title="previewId === track.id ? 'Stop preview' : 'Preview'"
            @click.stop="togglePreview(track)"
          >
            <Icon
              :icon="previewId === track.id ? 'material-symbols:stop-circle' : 'material-symbols:play-circle'"
              class="text-lg"
            />
          </button>
          <button
            class="p-1.5 rounded-md hover:bg-danger/8 text-muted-600 hover:text-danger-ink transition-colors"
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
