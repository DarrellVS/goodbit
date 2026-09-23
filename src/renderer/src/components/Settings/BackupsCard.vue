<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@renderer/stores/toast';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatDate } from '@renderer/helpers/dateFormat';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import { ICON_BOX } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

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
  <div class="setting-card">
    <!--
      No glyph in a tinted tile beside the heading. Nothing else on these
      pages has one, and a 40px accent square is the loudest thing on the
      screen next to a paragraph that is only explaining itself.
    -->
    <h3>Library backups</h3>
    <p>
      Names, tags, notes and collections. Taken on every update; the last five are kept.
    </p>

    <!--
      Five hairline rows, not five filled boxes with borders.

      Each copy is the same kind of thing as the one above it and differs only
      by a date, so a box around each said five unrelated things. The name,
      the size and the date are one mono line; the numbers are tabular, so
      they form columns down the list.
    -->
    <div v-if="backups.length" class="mt-4">
      <div
        v-for="backup in backups"
        :key="backup.path"
        class="flex items-center gap-3 py-2.5 border-t border-border text-sm"
      >
        <span class="font-mono text-xs text-foreground truncate flex-1">{{ backup.name }}</span>
        <span class="font-mono text-xs tabular-nums text-muted-400 shrink-0">
          {{ formatBytes(backup.sizeBytes) }}
        </span>
        <span class="text-xs text-muted-400 shrink-0 hidden sm:inline">
          {{ formatDate(new Date(backup.takenAt)) }}
        </span>

        <!--
          One button per copy rather than one button and a dropdown. The thing
          being restored is the row you are looking at, and a list of
          timestamps is easy enough to misread without adding a second step
          that hides which one is selected.
        -->
        <BaseButton
          size="sm"
          class="shrink-0"
          :disabled="!!restoring || working"
          title="Replace the current library with this copy and restart"
          @click="restore(backup)"
        >
          <BaseSpinner v-if="restoring === backup.path" :class="ICON_BOX" />
          <Icon v-else icon="material-symbols:history" :class="ICON_BOX" />
          {{ restoring === backup.path ? 'Restoring' : 'Restore' }}
        </BaseButton>
      </div>
    </div>

    <p v-else class="!mt-4">No copies yet.</p>

    <div class="flex flex-wrap gap-2 mt-4">
      <BaseButton tone="strong" :disabled="working" @click="backUpNow">
        <BaseSpinner v-if="working" :class="ICON_BOX" />
        <Icon v-else icon="material-symbols:backup" :class="ICON_BOX" />
        {{ working ? 'Copying' : 'Back up now' }}
      </BaseButton>

      <BaseButton @click="reveal">
        <Icon icon="material-symbols:folder-open" :class="ICON_BOX" />
        Show me the files
      </BaseButton>
    </div>
  </div>
</template>
