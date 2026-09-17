<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@renderer/stores/toast';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatDate } from '@renderer/helpers/dateFormat';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';

// Confirmations are a dialog, never a toast.
const { confirm: confirmAction } = useConfirm();

const toastStore = useToastStore();
const { formatBytes } = useFormat();

const backups = ref<BackupFileWire[]>([]);
const working = ref(false);
const restoring = ref<string | null>(null);

async function refresh(): Promise<void> {
  backups.value = (await window.goodbit?.backups.list()) ?? [];
}

/**
 * Put a copy back, which restarts the app.
 *
 * Confirmed rather than immediate, and the confirmation says the two things
 * somebody needs to hear: their clips are not involved, and what is there now
 * is copied first so this is reversible. A list of timestamps is easy to pick
 * the wrong row from.
 */
function restore(backup: BackupFileWire): void {
  if (working.value || restoring.value) return;

  confirmAction(
    `Replace the current names, tags, notes and collections with the copy from ${formatDate(
      new Date(backup.takenAt),
    )}, then restart. Your clips are not touched, and what is there now is copied first.`,
    () => void doRestore(backup),
    'Restore this copy?',
  );
}

async function doRestore(backup: BackupFileWire): Promise<void> {
  restoring.value = backup.path;

  try {
    const result = await window.goodbit?.backups.restore(backup.path);

    if (result?.restored) {
      // The app is about to exit, so this is the last thing it will say.
      toastStore.success(`Restored ${result.clips} clips. Restarting…`);
    } else {
      toastStore.error(result?.reason ?? 'Could not restore that copy');
      restoring.value = null;
    }
  } catch (error) {
    console.error('Failed to restore a backup:', error);
    toastStore.error('Could not restore that copy');
    restoring.value = null;
  }
}

async function backUpNow(): Promise<void> {
  if (working.value) return;
  working.value = true;

  try {
    const result = await window.goodbit?.backups.now();
    if (result?.taken) {
      toastStore.success(`Copied ${result.clips} clips. The copy was read back and is sound`);
      await refresh();
    } else {
      toastStore.error(result?.reason ?? 'Could not take a copy');
    }
  } finally {
    working.value = false;
  }
}

function reveal(): void {
  void window.goodbit?.backups.reveal();
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <!--
    The safety net, and it is worth showing rather than hiding: a backup nobody
    can see is a backup nobody trusts, and one that cannot be put back is not a
    backup at all. Five copies existed here for months with no way to use one.

    Restoring replaces the database and restarts the app, because everything
    running is holding state derived from rows that are about to be different.
    What is there now is copied and verified first, so there is a way back from
    the way back.
  -->
  <div class="p-4 bg-card border border-border rounded-lg space-y-4">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-xl bg-accent/12 flex items-center justify-center shrink-0">
        <Icon icon="material-symbols:database" class="text-xl text-accent-ink" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-medium text-foreground">Library backups</h3>
        <p class="text-sm text-muted-600 mt-1">
          A copy of the library is taken and read back whenever a new version of GoodBit starts, in
          case an update changes how things are stored. The last five are kept, and any of them can
          be put back. Your clips themselves are never touched. This is only the names, tags, notes
          and collections.
        </p>
      </div>
    </div>

    <div v-if="backups.length" class="space-y-1.5">
      <div
        v-for="backup in backups"
        :key="backup.path"
        class="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted-50 border border-border text-sm"
      >
        <Icon icon="material-symbols:save" class="text-muted-500 shrink-0" />
        <span class="font-mono text-xs text-foreground truncate flex-1">{{ backup.name }}</span>
        <span class="text-xs text-muted-500 shrink-0">{{ formatBytes(backup.sizeBytes) }}</span>
        <span class="text-xs text-muted-500 shrink-0 hidden sm:inline">
          {{ formatDate(new Date(backup.takenAt)) }}
        </span>

        <!--
          One button per copy rather than one button and a dropdown. The thing
          being restored is the row you are looking at, and a list of
          timestamps is easy enough to misread without adding a second step
          that hides which one is selected.
        -->
        <button
          class="px-2.5 py-1 rounded-md border border-border text-xs font-medium text-muted-700 hover:bg-card hover:border-accent/50 transition-colors shrink-0 flex items-center gap-1.5 disabled:opacity-50"
          :disabled="!!restoring || working"
          :title="`Replace the current library with this copy and restart`"
          @click="restore(backup)"
        >
          <BaseSpinner v-if="restoring === backup.path" class="text-sm" />
          <Icon v-else icon="material-symbols:history" class="text-base" />
          {{ restoring === backup.path ? 'Restoring…' : 'Restore' }}
        </button>
      </div>
    </div>

    <p v-else class="text-sm text-muted-500">No copies yet.</p>

    <div class="flex flex-wrap gap-2">
      <button
        class="px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-60 flex items-center gap-2"
        :disabled="working"
        @click="backUpNow"
      >
        <BaseSpinner v-if="working" class="text-lg" />
        <Icon v-else icon="material-symbols:backup" class="text-lg" />
        {{ working ? 'Copying…' : 'Back up now' }}
      </button>

      <button
        class="px-4 py-2 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors flex items-center gap-2"
        @click="reveal"
      >
        <Icon icon="material-symbols:folder-open" class="text-lg" />
        Show me the files
      </button>
    </div>
  </div>
</template>
