import { ref } from 'vue';
import { useToastStore } from '@renderer/stores/toast';
import { useClipsStore } from '@renderer/stores/clips';
import { useGamesStore } from '@renderer/stores/games';
import { importFiles, pickClipFiles } from '@renderer/services/clips';
import { pathForFile } from '@renderer/services/audio';
import { osDragActive } from '@renderer/composables/clips/useOsDrag';

const VALID_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
  'video/webm',
];

const VALID_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.MP4',
  '.MOV',
  '.AVI',
  '.MKV',
  '.WEBM',
];

export function useFileImport() {
  const toastStore = useToastStore();
  const clipsStore = useClipsStore();
  const gamesStore = useGamesStore();

  const isDragging = ref(false);
  const isUploading = ref(false);
  const uploadProgress = ref(0);
  const dragCounter = ref(0);

  function isValidVideoFile(file: File): boolean {
    // Check MIME type first
    if (VALID_VIDEO_TYPES.includes(file.type)) {
      return true;
    }

    // Fallback to extension check (some browsers don't set MIME type correctly)
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    return VALID_VIDEO_EXTENSIONS.some(ext => ext.toLowerCase() === extension);
  }

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter.value++;
    
    // Not a drag this window started. Dragging a clip out hands the file to
    // the shell, which then offers it straight back here, and the app was
    // asking whether to import a clip it is already showing.
    if (e.dataTransfer?.types.includes('Files') && !osDragActive.value) {
      isDragging.value = true;
    }
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounter.value--;
    
    if (dragCounter.value === 0) {
      isDragging.value = false;
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    isDragging.value = false;
    dragCounter.value = 0;

    // Dropped back where it came from, which is a way of saying "never mind".
    // Importing here would copy a clip the library already holds.
    if (osDragActive.value) return;

    const files = Array.from(e.dataTransfer?.files || []);
    
    if (files.length === 0) {
      return;
    }

    // Filter valid video files
    const videoFiles = files.filter(isValidVideoFile);
    const invalidCount = files.length - videoFiles.length;

    if (videoFiles.length === 0) {
      toastStore.error('No valid video files found', 'Invalid Files');
      return;
    }

    if (invalidCount > 0) {
      toastStore.warning(
        `${invalidCount} file${invalidCount === 1 ? '' : 's'} skipped (not video format)`,
        'Some files skipped'
      );
    }

    // A dropped File has no usable path of its own in Electron 32+; the bridge
    // resolves one through webUtils.
    const paths = videoFiles.map((file) => pathForFile(file)).filter(Boolean);

    if (paths.length === 0) {
      toastStore.error('Those files could not be read from disk', 'Import failed');
      return;
    }

    await uploadFiles(paths);
  }

  /** The OS picker, for the "choose files" path rather than drag and drop. */
  async function browseForFiles(): Promise<void> {
    await uploadFiles(await pickClipFiles());
  }

  /**
   * Import by path.
   *
   * Files used to be posted as multipart form data, which cannot cross the
   * contextBridge. The request arrived empty and the server answered "No files
   * provided". Main is handed the paths and reads them off the same disk.
   */
  async function uploadFiles(paths: string[]) {
    if (paths.length === 0) return;

    isUploading.value = true;
    // Copying is quick and local, so there is no real progress to report; the
    // bar this used to fake was counting to ninety and waiting.
    uploadProgress.value = 0;

    try {
      const result = await importFiles(paths);

      uploadProgress.value = 100;

      // Show results
      if (result.imported > 0) {
        toastStore.success(
          `${result.imported} file${result.imported === 1 ? '' : 's'} imported successfully`,
          'Import Complete'
        );
      }

      if (result.failed > 0 && result.errors) {
        console.error('Import errors:', result.errors);
        toastStore.error(
          `${result.failed} file${result.failed === 1 ? '' : 's'} failed to import`,
          'Import Errors'
        );
      }

      // Refresh clips and games list
      clipsStore.resetPagination();
      await Promise.all([
        clipsStore.fetchClips(false),
        gamesStore.fetchGames(),
      ]);

      // Set filter to Import game to show newly imported files
      clipsStore.setGame('Import');
    } catch (error) {
      console.error('Import failed:', error);
      toastStore.error('Failed to import files', 'Import Error');
    } finally {
      isUploading.value = false;
      uploadProgress.value = 0;
    }
  }

  return {
    isDragging,
    isUploading,
    uploadProgress,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    browseForFiles,
  };
}

