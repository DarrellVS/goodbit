<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useToastStore } from '@renderer/stores/toast';
import { useStorageSaver } from '@renderer/composables/library/useStorageSaver';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import GraveyardSection from '@renderer/components/Storage/GraveyardSection.vue';
import BurstSection from '@renderer/components/Storage/BurstSection.vue';
import type { Clip } from '@renderer/types/clip';

/**
 * Storage Saver: the clips nobody opened, and the ones that are one moment
 * three times.
 *
 * A route rather than a mode of the library, because it is not a filtered view
 * of browsing. The library is for finding a clip; this is for deciding which
 * ones to stop keeping, its unit is the group rather than the clip, and its
 * verb is destructive. A filter chip that quietly turns the grid into a
 * deletion queue is the version of this that gets somebody's clips deleted.
 *
 * **This is the only new screen in the release whose main verb destroys
 * something**, and the thing worth saying is that a clip row is the only copy
 * of its tags, notes, name, stars, collections and marks. The file goes to the
 * Recycle Bin and comes back; the row does not. So the question asked before
 * anything happens counts them, and `useStorageSaver` builds it.
 */
const saver = useStorageSaver();
const { settings, load: loadSettings } = useAppSettings();

const days = computed(() => settings.value.unreviewedDays ?? 30);
const windowSec = computed(() => settings.value.burstWindowSec ?? 90);

onMounted(async () => {
  // Settings first: both queries take a threshold from it, and firing them
  // with the default and again with the real value is two scans of the
  // library and a list that visibly changes under somebody's hands.
  await loadSettings();
  await Promise.all([saver.loadUnreviewed(), saver.loadBursts()]);
});

/*
 * A tile's picture opens the clip itself. When that panel closes, the one
 * clip is brought up to date rather than the list reloaded: see `refresh`.
 */
const { openClipId } = useClipDetail();
watch(openClipId, (now, before) => {
  if (now === null && before !== null && before !== undefined) void saver.refresh(before);
});

/*
 * A clip renamed on its tile keeps its place until the reader says otherwise.
 *
 * Refreshing on save would pull the tile away from somebody who pressed Enter
 * on a typo and was about to fix it. So the new name shows at once, the list
 * stays still, and the toast says why the clip will go and offers to do it.
 */
const toast = useToastStore();
function renamed(clip: Clip): void {
  saver.patch(clip);
  if (!clip.displayName?.trim()) return;
  toast.show({
    type: 'success',
    title: 'Renamed',
    description: 'A clip with a name is one you want, so it leaves this list when you refresh it.',
    duration: 8000,
    action: { label: 'Refresh list', onClick: () => void saver.refreshAll() },
  });
}

function deleteSelected(): void {
  void saver.remove(saver.selectedClips.value, 'Delete these clips?');
}

function deleteCluster(clips: Clip[]): void {
  void saver.remove(clips, 'Keep one and delete the rest?');
}

function toggleGroup(game: string): void {
  const group = saver.unreviewed.value?.groups.find((entry) => entry.game === game);
  if (group) saver.toggleGroup(group);
}
</script>

<template>
  <div class="px-12 py-6 space-y-10 pb-16">
    <p v-if="saver.error.value" class="text-sm text-danger-ink">{{ saver.error.value }}</p>

    <GraveyardSection
      :data="saver.unreviewed.value"
      :loading="saver.loadingUnreviewed.value"
      :deleting="saver.deleting.value"
      :selected="saver.selected.value"
      :days="days"
      @toggle="saver.toggle"
      @toggle-group="toggleGroup"
      @delete="deleteSelected"
      @renamed="renamed"
    />

    <BurstSection
      :data="saver.bursts.value"
      :loading="saver.loadingBursts.value"
      :deleting="saver.deleting.value"
      :keepers="saver.keepers.value"
      :window-sec="windowSec"
      @keep="saver.keep"
      @delete="deleteCluster"
      @renamed="renamed"
    />
  </div>
</template>
