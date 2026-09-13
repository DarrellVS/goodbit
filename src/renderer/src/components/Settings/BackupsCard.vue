<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import { useFormat } from '../../composables/useFormat';
import { formatDate } from '../../helpers/dateFormat';

const toastStore = useToastStore();
const { formatBytes } = useFormat();

const backups = ref<BackupFileWire[]>([]);
const working = ref(false);

async function refresh(): Promise<void> {
  backups.value = (await window.goodbit?.backups.list()) ?? [];
}

async function backUpNow(): Promise<void> {
  if (working.value) return;
  working.value = true;

  try {
    const result = await window.goodbit?.backups.now();
    if (result?.taken) {
      toastStore.success(`Copied ${result.clips} clips — the copy was read back and is sound`);
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
    The app keeps its schema in step with the code automatically, which is
    convenient and occasionally destructive. This is the safety net, and it is
    worth showing rather than hiding: a backup nobody can see is a backup
    nobody trusts.
  -->
  <div class="p-4 bg-card border border-border rounded-lg space-y-4">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-xl bg-orange-500/12 flex items-center justify-center flex-shrink-0">
        <Icon icon="material-symbols:database" class="text-xl text-orange-500" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-medium text-foreground">Library backups</h3>
        <p class="text-sm text-muted-600 mt-1">
          A copy of the library is taken and read back whenever a new version of GoodBit starts, in
          case an update changes how things are stored. The last five are kept. Your clips
          themselves are never touched — this is only the names, tags, notes and collections.
        </p>
      </div>
    </div>

    <div v-if="backups.length" class="space-y-1.5">
      <div
        v-for="backup in backups"
        :key="backup.path"
        class="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted-50 border border-border text-sm"
      >
        <Icon icon="material-symbols:save" class="text-muted-500 flex-shrink-0" />
        <span class="font-mono text-xs text-foreground truncate flex-1">{{ backup.name }}</span>
        <span class="text-xs text-muted-500 flex-shrink-0">{{ formatBytes(backup.sizeBytes) }}</span>
        <span class="text-xs text-muted-500 flex-shrink-0 hidden sm:inline">
          {{ formatDate(new Date(backup.takenAt)) }}
        </span>
      </div>
    </div>

    <p v-else class="text-sm text-muted-500">No copies yet.</p>

    <div class="flex flex-wrap gap-2">
      <button
        class="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-60 flex items-center gap-2"
        :disabled="working"
        @click="backUpNow"
      >
        <Icon
          :icon="working ? 'material-symbols:progress-activity' : 'material-symbols:backup'"
          class="text-lg"
          :class="{ 'animate-spin': working }"
        />
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
