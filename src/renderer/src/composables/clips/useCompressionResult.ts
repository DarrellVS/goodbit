import { pollJob } from '@renderer/services/jobs';
import { useToastStore } from '@renderer/stores/toast';
import { useClipsStore } from '@renderer/stores/clips';
import { useFormat } from '@renderer/composables/ui/useFormat';
import type { Clip } from '@renderer/types/clip';

/**
 * Follow a compression to its end, and say what happened.
 *
 * It used to say "It will finish in the background" and then nothing, so a
 * clip that was compressed, one that was left alone because it was already
 * small, and one whose compression failed all looked the same: the card kept
 * its old size and nobody knew why. Now the job is watched, the card is given
 * the new row the moment it lands, and one toast says which of the three it
 * was, with the sizes when it worked.
 */
export function useCompressionResult() {
  const toast = useToastStore();
  const clips = useClipsStore();
  const { formatBytes } = useFormat();

  async function follow(jobId: string, before: Clip): Promise<{ outcome: 'done' | 'left' | 'failed'; clip: Clip | null }> {
    const title = before.displayName?.trim() || before.filename;
    try {
      const view = await pollJob(jobId);
      if (view.status === 'done') {
        if (view.clip) clips.updateClip(view.clip);
        const after = view.clip?.sizeBytes ?? null;
        if (after !== null && after < (before.sizeBytes ?? Infinity)) {
          toast.success(`${title}: ${formatBytes(before.sizeBytes)} to ${formatBytes(after)}`, 'Compressed');
          return { outcome: 'done', clip: view.clip };
        }
        toast.info(view.message || 'It was left as it was.', title);
        return { outcome: 'left', clip: view.clip };
      }
      if (view.status === 'cancelled') return { outcome: 'left', clip: null };
      toast.error(view.error || 'The compression stopped partway. The original is untouched.', `Could not compress ${title}`);
      return { outcome: 'failed', clip: null };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), `Could not compress ${title}`);
      return { outcome: 'failed', clip: null };
    }
  }

  return { follow };
}
