import { ref, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToastStore } from '../stores/toast';
import { getExportStatus, startExport } from '../services/clips';
import type { TimelineAudio, TimelineClip } from '../types/editor';

/**
 * Renders run detached on the server and are polled from here.
 *
 * Holding the POST open for the length of a render meant anything past
 * Cloudflare's 100 second ceiling came back a 504 while ffmpeg carried on
 * regardless. Polling also rides out a flaky moment: a few failed status calls
 * in a row are tolerated before a job that is probably still fine is given up
 * on.
 */
const POLL_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_POLL_FAILURES = 8;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useClipExport(
  timelineClips: Ref<readonly TimelineClip[]>,
  timelineAudio?: Ref<readonly TimelineAudio[]>
) {
  const router = useRouter();
  const toastStore = useToastStore();
  const isExporting = ref(false);
  const exportProgress = ref(0);

  async function exportClip(outputName?: string): Promise<void> {
    if (timelineClips.value.length === 0) {
      toastStore.warning('Add clips to the timeline before exporting');
      return;
    }

    isExporting.value = true;
    exportProgress.value = 0;

    try {
      const name = outputName?.trim() || `Edited_${new Date().toISOString().split('T')[0]}`;
      const { exportId } = await startExport(timelineClips.value, timelineAudio?.value ?? [], name);

      let failures = 0;

      for (;;) {
        await wait(POLL_INTERVAL_MS);

        let status: Awaited<ReturnType<typeof getExportStatus>>;

        try {
          status = await getExportStatus(exportId);
          failures = 0;
        } catch (error) {
          // A job the server has never heard of is gone for good. Anything else
          // — a dropped connection, a proxy hiccup — is worth another try.
          const code = (error as { response?: { status?: number } }).response?.status;
          if (code === 404) throw new Error('The server lost track of this export');

          failures++;
          if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw error;
          continue;
        }

        exportProgress.value = status.progress;

        if (status.status === 'done') {
          exportProgress.value = 100;
          toastStore.success('Your edited clip has been saved!', 'Export successful');
          router.push('/');
          return;
        }

        if (status.status === 'error') {
          throw new Error(status.error || 'The render failed');
        }
      }
    } catch (error) {
      console.error('Export failed:', error);
      toastStore.error((error as Error).message || 'Please try again.', 'Export failed');
    } finally {
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
