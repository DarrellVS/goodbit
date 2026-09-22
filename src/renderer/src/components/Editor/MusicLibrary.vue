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
import BaseButton from '@renderer/components/Base/BaseButton.vue';

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
  <!-- No `overflow-hidden`: the list clips for itself, this only clipped rings. -->
  <div class="flex flex-col h-full">
    <!--
      No heading. The tab above it says `Music`, in a panel that holds nothing
      else, and the dropzone under it says what the panel is for.

      Space under it as well as over it: the dropzone and the first track were
      touching, so the dashed box read as the top of the list rather than as
      the thing above the list.
    -->
    <div
      class="shrink-0 mt-3 mb-3 rounded-md border border-dashed transition-colors duration-150"
      :class="isDragOver ? 'border-accent bg-accent/8' : 'border-border'"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <button
        class="w-full px-3 py-4 flex flex-col items-center gap-1 text-center"
        :disabled="uploading"
        @click="handleBrowse"
      >
        <BaseSpinner v-if="uploading" class="size-5 shrink-0 block text-muted-400" />
        <Icon v-else icon="material-symbols:upload" class="size-5 shrink-0 block text-muted-400" />
        <span class="text-sm font-medium text-foreground">
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
      <BaseSpinner class="size-5 shrink-0 block text-muted-400" />
    </div>

    <div v-else-if="tracks.length === 0" class="flex-1 flex items-center justify-center px-4">
      <div class="text-center">
        <div class="mb-3 flex items-center justify-center">
          <Icon icon="material-symbols:music-note" class="size-8 shrink-0 block text-muted-300" />
        </div>
        <p class="text-sm font-medium text-muted-700">No music yet</p>
        <p class="text-xs mt-1 text-muted-500">Upload a track to lay under your clips</p>
      </div>
    </div>

    <!--
      One row per track, not a card with a second floor.

      The name, the length and the size sat in a block with the preview and
      delete buttons on a row of their own underneath, which made every track
      92px tall and put its two actions as far from its name as the next
      track's. They are on the one line now, in the same shape the clip card
      uses: the actions keep their space at rest and only their opacity moves,
      because nothing here changes size on hover.

      The name is one truncated line rather than two wrapped ones. A music file
      is named by whoever made it and some of those names are a sentence; the
      full one is in the row's own title.
    -->
    <div v-else class="flex-1 overflow-y-auto scroll-p-1.5 pb-3 space-y-0.5">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="group flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors duration-150"
        :class="isAdded(track) ? 'bg-muted-100' : 'hover:bg-muted-50'"
      >
        <button
          class="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:focus-ring rounded-sm"
          :title="isAdded(track)
            ? `${track.displayName}. Already on the timeline, click to place another copy`
            : `${track.displayName}. Add to the timeline`"
          @click="emit('add-to-timeline', track)"
        >
          <span class="size-7 shrink-0 inline-flex items-center justify-center rounded-md bg-accent">
            <Icon icon="material-symbols:add" class="size-4 shrink-0 block text-accent-fg" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-foreground">
              {{ track.displayName }}
            </span>
            <span class="mt-0.5 flex items-center gap-1.5 text-xs text-muted-600">
              <span class="font-mono tabular-nums">{{ formatTimeSimple(track.durationSec) }}</span>
              <span class="text-muted-300">·</span>
              <span class="font-mono tabular-nums">{{ formatBytes(track.sizeBytes) }}</span>
              <span v-if="isAdded(track)" class="truncate font-medium text-accent-ink">on timeline</span>
            </span>
          </span>
        </button>

        <span
          class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <BaseButton
            tone="quiet"
            size="dense"
            icon-only
            class="hover:bg-accent/8 hover:text-accent-ink focus-visible:opacity-100"
            :class="previewId === track.id ? 'opacity-100 text-accent-ink' : ''"
            :title="previewId === track.id ? 'Stop preview' : 'Preview'"
            @click.stop="togglePreview(track)"
          >
            <Icon
              :icon="previewId === track.id ? 'material-symbols:stop-circle' : 'material-symbols:play-circle'"
              class="size-4 shrink-0 block"
            />
          </BaseButton>
          <BaseButton
            tone="quiet"
            size="dense"
            icon-only
            class="hover:bg-danger/8 hover:text-danger-ink focus-visible:opacity-100"
            title="Delete track"
            @click.stop="remove(track)"
          >
            <Icon icon="material-symbols:delete-outline" class="size-4 shrink-0 block" />
          </BaseButton>
        </span>
      </div>
    </div>
  </div>
</template>
