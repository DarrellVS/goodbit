<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { usePublisher } from '../../composables/usePublisher';
import SettingToggle from './SettingToggle.vue';
import { useToastStore } from '../../stores/toast';
import { getEncoderInfo, listJobs, type EncoderInfo } from '../../services/clips';

/**
 * The settings the app itself runs on, folders, the publisher, autostart,
 * plus what the machine can actually do.
 *
 * The health panel exists because everything below it fails silently otherwise:
 * with no GPU encoder an export is quietly slow, and with an unreachable
 * publisher the first sign of trouble used to be a publish failing.
 */
const { settings, load, save, pickFolder, moveLibraryTo, startMove, closeObs } = useAppSettings();
const { refresh: refreshPublisher } = usePublisher();
const toast = useToastStore();

/** The setup guide on the website, in the person's own browser. */
const PUBLISHER_GUIDE = 'https://darrellvs.github.io/goodbit/publisher.html';

function openGuide(): void {
  void window.goodbit?.openExternal(PUBLISHER_GUIDE);
}

/** The clip menus read this through `usePublisher`, so tell them. */
async function saveCompressPublished(on: boolean): Promise<void> {
  await save({ compressPublished: on });
  await refreshPublisher();
}

const encoders = ref<EncoderInfo | null>(null);
const encodersLoading = ref(true);
const publisherUrl = ref('');
const publisherToken = ref('');
const showToken = ref(false);
const publisherState = ref<'unknown' | 'checking' | 'ok' | 'unreachable'>('unknown');
const appVersion = ref('');

onMounted(async () => {
  await load();
  publisherUrl.value = settings.value.publisherBaseUrl;
  publisherToken.value = settings.value.publisherToken ?? '';
  appVersion.value = (await window.goodbit?.app.version()) ?? '';

  try {
    encoders.value = await getEncoderInfo();
  } catch {
    encoders.value = null;
  } finally {
    encodersLoading.value = false;
  }
});

const encoderLabel = computed(() => {
  const info = encoders.value;
  if (!info) return 'could not be detected';
  const kind = info.hardware ? 'your graphics card' : 'the processor';
  return `${info.h264}, ${kind}`;
});

async function choose(key: 'videosRoot' | 'audioRoot', title: string): Promise<void> {
  const chosen = await pickFolder(key, title);
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

async function savePublisher(): Promise<void> {
  await save({
    publisherBaseUrl: publisherUrl.value.trim(),
    publisherToken: publisherToken.value.trim(),
  });
  toast.success(publisherUrl.value.trim() ? 'Publisher saved' : 'Publishing turned off');
  publisherState.value = 'unknown';
}

/** Reachability is the thing worth knowing; a saved URL that answers nothing is worse than none. */
async function testPublisher(): Promise<void> {
  const url = publisherUrl.value.trim();
  if (!url) return;

  publisherState.value = 'checking';
  try {
    await fetch(`${url.replace(/\/$/, '')}/health`, { method: 'GET' });
    publisherState.value = 'ok';
  } catch {
    publisherState.value = 'unreachable';
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">App</h2>
      <p class="text-sm text-muted-500">Where your clips live, and how GoodBit runs</p>
    </div>

    <div class="space-y-4">
      <div class="p-4 bg-card rounded-lg border border-border space-y-3">
        <div class="flex items-start justify-between gap-4">
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
              @click="choose('videosRoot', 'Where do you keep your clips?')"
            >
              Change
            </button>
          </div>
        </div>

        <div class="flex items-start justify-between gap-4 pt-3 border-t border-border">
          <div class="min-w-0">
            <label class="font-medium text-foreground">Music folder</label>
            <p class="text-sm text-muted-500 mt-1 truncate">
              {{ settings.audioRoot || 'Not set' }}
            </p>
          </div>
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm flex-shrink-0"
            @click="choose('audioRoot', 'Where is your music?')"
          >
            Change
          </button>
        </div>
      </div>

      <SettingToggle
        label="Start with Windows"
        description="Runs in the tray and indexes clips as they are recorded"
        :model-value="settings.startAtLogin"
        @update:model-value="save({ startAtLogin: $event })"
      />

      <SettingToggle
        label="Keep running when the window closes"
        description="Off means closing the window quits, and nothing is indexed until you open it again"
        :model-value="settings.keepRunningInTray"
        @update:model-value="save({ keepRunningInTray: $event })"
      />

      <SettingToggle
        label="Compress clips when trimming"
        description="A trim always lands on the exact frames you chose, and it replaces the only copy of that moment. Off keeps the picture close to the recording. On squeezes it to roughly a fifth of the size."
        :model-value="settings.compressTrims === true"
        @update:model-value="save({ compressTrims: $event })"
      />

      <!--
        A different question from the one above, which is why it is a different
        switch: what goes to a public link is a copy, so shrinking it costs
        nothing on disk. Hidden when there is no publisher: a setting for a
        feature you do not have is noise.
      -->
      <SettingToggle
        v-if="settings.publisherBaseUrl"
        label="Compress clips when publishing"
        description="The file on disk is untouched; only the copy behind the public link is re-encoded, so it downloads in a fifth of the time. Off uploads the recording as it is."
        :model-value="settings.compressPublished !== false"
        @update:model-value="saveCompressPublished($event)"
      />

      <div class="p-4 bg-card rounded-lg border border-border space-y-3">
        <div>
          <label class="font-medium text-foreground">Publisher</label>
          <p class="text-sm text-muted-500 mt-1">
            Optional. A server that hosts public links for the clips you publish. Leave empty and
            publishing is simply off.
          </p>
          <!--
            The one genuinely hands-on thing GoodBit asks of anyone, so the
            guide is a click away rather than something to go looking for.
          -->
          <button
            class="mt-2 inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-500 transition-colors"
            @click="openGuide"
          >
            <Icon icon="material-symbols:open-in-new" class="text-base" />
            How to set one up
          </button>
        </div>

        <div class="flex gap-2">
          <input
            v-model="publisherUrl"
            type="text"
            placeholder="http://192.168.1.20:5555"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-orange-500"
            @keydown.enter="savePublisher"
          />
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm"
            :disabled="!publisherUrl.trim()"
            @click="testPublisher"
          >
            Test
          </button>
          <button
            class="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm hover:bg-orange-600"
            @click="savePublisher"
          >
            Save
          </button>
        </div>

        <!--
          Serving clips is public on purpose; writing to the publisher is not.
          Without this the address is an open file drop under your own domain,
          so the publisher refuses every upload until both ends have it.
        -->
        <div class="flex gap-2">
          <input
            v-model="publisherToken"
            :type="showToken ? 'text' : 'password'"
            placeholder="Publish token"
            aria-label="Publish token"
            autocomplete="off"
            spellcheck="false"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono outline-none focus:ring-2 focus:ring-orange-500"
            @keydown.enter="savePublisher"
          />
          <button
            class="px-3 py-2 rounded-lg border border-border hover:bg-muted-50 text-sm"
            :title="showToken ? 'Hide the token' : 'Show the token'"
            @click="showToken = !showToken"
          >
            <Icon :icon="showToken ? 'material-symbols:visibility-off' : 'material-symbols:visibility'" class="text-base" />
          </button>
        </div>
        <p class="text-xs text-muted-500">
          The same value as <code>PUBLISH_TOKEN</code> on the server. Uploads are refused without it.
        </p>

        <p v-if="publisherState === 'checking'" class="text-xs text-muted-500">Checking…</p>
        <p v-else-if="publisherState === 'ok'" class="text-xs text-green-600">That address answers.</p>
        <p v-else-if="publisherState === 'unreachable'" class="text-xs text-red-600">
          No answer from that address.
        </p>
      </div>

      <div class="p-4 bg-card rounded-lg border border-border space-y-2">
        <h3 class="font-medium text-foreground flex items-center gap-2">
          <Icon icon="material-symbols:favorite-outline" class="text-orange-500" />
          Health
        </h3>
        <dl class="text-sm space-y-1">
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Version</dt>
            <dd class="text-foreground font-mono">{{ appVersion || 'unknown' }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Video encoder</dt>
            <dd class="text-foreground font-mono truncate">
              {{ encodersLoading ? 'checking…' : encoderLabel }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">Decoding</dt>
            <dd class="text-foreground font-mono">
              {{ encodersLoading ? '…' : (encoders?.hwaccel ?? 'software') }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-muted-500">ffmpeg</dt>
            <dd class="text-foreground font-mono truncate">
              {{ encoders?.ffmpegVersion ?? 'unknown' }}
            </dd>
          </div>
        </dl>
        <p v-if="!encodersLoading && encoders && !encoders.hardware" class="text-xs text-amber-600">
          No graphics-card encoder was found, so exports run on the processor and will be slower.
        </p>
      </div>
    </div>
  </section>
</template>
