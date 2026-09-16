<script setup lang="ts">
import { onMounted } from 'vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { useSettingsSearch } from '../../composables/useSettingsSearch';
import { useToastStore } from '../../stores/toast';
import { listJobs } from '../../services/clips';

/**
 * Where your clips are, which is also where OBS records into.
 *
 * It sits under Recording rather than in a section about folders, because it is
 * one end of the seam Recording is about: OBS writes into this folder and
 * GoodBit reads it. There is no second setting for the recording path, on
 * purpose, since two that can disagree is exactly the failure the OBS
 * diagnostic exists to report.
 *
 * Lifted out of `AppSettings.vue`, which held this, the music folder, the
 * rescan, the publisher, the machine's health and four switches, and was called
 * App because there was no other word for that collection.
 */
const { settings, load, pickFolder, moveLibraryTo, startMove, closeObs } = useAppSettings();
const { settingRing } = useSettingsSearch();
const toast = useToastStore();

onMounted(load);

async function change(): Promise<void> {
  const chosen = await pickFolder('videosRoot', 'Where do you keep your clips?');
  if (chosen) toast.success('Folder updated, rescanning');
}

/**
 * Two different intents, so two buttons rather than one that guesses.
 *
 * "My clips are somewhere else" wants the library repointed and the files left
 * alone, which is `Change`. "I want my clips in Videos/Clips" wants them
 * carried over with their tags, stars, notes and dates, which is this. A
 * single button would have to ask, and the answer is not a detail: one of them
 * touches every file in the library.
 */
async function moveClipsFolder(): Promise<void> {
  const picked = await moveLibraryTo('Where should your clips live?');
  if (!picked) return;

  if (picked.problem) {
    toast.error(picked.problem, 'That folder will not work');
    return;
  }

  /*
   * OBS has to be shut before anything moves.
   *
   * It keeps the replay buffer in memory and writes it into the staging folder
   * the instant the key is pressed, so a save during a move either lands in a
   * folder that has already been carried over or arrives in the middle of a
   * copy. Asking it to close is a WM_CLOSE, the same as clicking the X, so OBS
   * saves its own settings on the way out and nothing is forced.
   */
  if (picked.obsRunning) {
    const closed = await new Promise<boolean>((resolve) => {
      toast.confirm(
        'OBS has to be closed while your clips move, or a replay saved mid-move lands in the old folder. GoodBit can ask it to close now.',
        () => resolve(true),
        'Close OBS first?',
      );
      window.setTimeout(() => resolve(false), 12_000);
    });

    if (!closed) return;

    toast.info('Asking OBS to close');
    if (!(await closeObs())) {
      toast.error(
        'OBS is still open. It asks before closing while the replay buffer is running, so answer that and try again.',
        'Could not close OBS',
      );
      return;
    }
  }

  const { jobId } = (await startMove(picked.chosen)) ?? {};
  toast.info(
    'Leave OBS closed until this finishes, or a replay will land in the old folder.',
    'Moving your clips',
  );

  if (jobId) void followMove(jobId);
}

/**
 * Say what the move is doing, and say when it stops.
 *
 * Without this the toast is fired once and never updated, so a move that
 * failed looks exactly like a move that is still going: the user waits on a
 * message that is never coming. A library move is minutes and touches every
 * file they own, which is the last place to leave somebody guessing.
 */
async function followMove(jobId: string): Promise<void> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    let job;
    try {
      job = (await listJobs()).find((entry) => entry.id === jobId);
    } catch {
      continue;
    }

    if (!job) return;

    if (job.status === 'done') {
      await load();
      toast.success('Your clips are in the new folder, tags and dates included.', 'Move finished');
      return;
    }

    if (job.status === 'error' || job.status === 'cancelled') {
      toast.error(
        job.error ?? 'The move stopped. Your clips are safe: each one is either in the old folder or the new one.',
        'The move did not finish',
      );
      return;
    }
  }
}
</script>

<template>
  <div
    data-setting="Clips folder"
    :class="[
      'p-4 bg-card rounded-lg border border-border flex items-start justify-between gap-4',
      settingRing('Clips folder'),
    ]"
  >
    <div class="min-w-0">
      <label class="font-medium text-foreground">Clips folder</label>
      <p class="text-sm text-muted-500 mt-1 truncate">
        {{ settings.videosRoot || 'Not set' }}
      </p>
      <!--
        This used to explain that changing it moves nothing. It no longer
        needs to: changing it now asks which of the two things you meant,
        and OBS is pointed at the same folder either way rather than
        being a second setting that can disagree with this one.
      -->
      <p class="text-xs text-muted-500 mt-1.5">
        Your library, and where OBS records into. They are always the same folder.
        <br />
        <span class="text-muted-400">
          Move clips takes everything with it, tags and dates included. Change only points
          GoodBit somewhere else and leaves the files alone.
        </span>
      </p>
    </div>
    <div class="flex items-center gap-2 flex-shrink-0">
      <button
        class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm"
        @click="moveClipsFolder"
      >
        Move clips
      </button>
      <button
        class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm"
        @click="change"
      >
        Change
      </button>
    </div>
  </div>
</template>
