import { ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToastStore } from '../stores/toast';
import { exportTimeline, getExportProgress } from '../services/clips';
import type { TimelineClip } from '../types/editor';

export function useClipExport(timelineClips: Ref<readonly TimelineClip[]>) {
  const router = useRouter();
  const toastStore = useToastStore();
  const isExporting = ref(false);
  const exportProgress = ref(0);

  async function exportClip(): Promise<void> {
    if (timelineClips.value.length === 0) {
      toastStore.warning('Add clips to the timeline before exporting');
      return;
    }

    isExporting.value = true;
    exportProgress.value = 0;
    const exportId = `export-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const progressInterval = setInterval(async () => {
      try {
        const progress = await getExportProgress(exportId);
        if (progress !== null) {
          exportProgress.value = progress;
        }
      } catch (error) {
        console.error('Failed to fetch progress:', error);
      }
    }, 500);
    
    try {
      const outputName = `Edited_${new Date().toISOString().split('T')[0]}`;
      await exportTimeline(timelineClips.value, outputName, exportId);
      
      exportProgress.value = 100;
      toastStore.success('Your edited clip has been saved!', 'Export successful');
      router.push('/');
    } catch (error) {
      console.error('Export failed:', error);
      toastStore.error('Please try again.', 'Export failed');
    } finally {
      clearInterval(progressInterval);
      isExporting.value = false;
      exportProgress.value = 0;
    }
  }

  return {
    isExporting,
    exportProgress,
    exportClip,
  };
}

