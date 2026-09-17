<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useStats } from '@renderer/composables/library/useStats';
import { useClipsStore } from '@renderer/stores/clips';
import { formatBytes, formatDate, formatPercentage } from '@renderer/utils/formatters';
import StatCard from '@renderer/components/Stats/StatCard.vue';
import GamesList from '@renderer/components/Stats/GamesList.vue';
import TagsList from '@renderer/components/Stats/TagsList.vue';
import InfoPanel from '@renderer/components/Stats/InfoPanel.vue';
import ActivityChart from '@renderer/components/Stats/ActivityChart.vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

const router = useRouter();
const clipsStore = useClipsStore();
const { stats, loading, fetchStats } = useStats();

const statCards = computed(() => {
  if (!stats.value) return [];

  return [
    {
      title: 'Total Clips',
      value: stats.value.totalClips.toLocaleString(),
      subtitle: `${stats.value.gamesCount} games`,
      icon: 'material-symbols:video-library',
      clickable: false,
      onClick: undefined,
    },
    {
      title: 'Storage',
      value: formatBytes(stats.value.totalSize),
      subtitle: `${formatBytes(stats.value.avgClipSize)} avg`,
      icon: 'material-symbols:storage',
      clickable: false,
      onClick: undefined,
    },
    {
      title: 'Published',
      value: stats.value.publishedClips,
      subtitle: `${formatPercentage(stats.value.publishedClips, stats.value.totalClips)}%`,
      icon: 'material-symbols:cloud-upload',
      clickable: true,
      onClick: handlePublishedClick,
    },
    {
      title: 'Starred',
      value: stats.value.starredClips,
      subtitle: `${formatPercentage(stats.value.starredClips, stats.value.totalClips)}%`,
      icon: 'material-symbols:star',
      clickable: true,
      onClick: handleStarredClick,
    },
  ];
});

function handlePublishedClick(): void {
  clipsStore.setStarredFilter(false);
  clipsStore.setPublishedFilter(true);
  void router.push('/');
}

function handleStarredClick(): void {
  clipsStore.setPublishedFilter(false);
  clipsStore.setStarredFilter(true);
  void router.push('/');
}

const infoItems = computed(() => {
  if (!stats.value) return [];

  const taggedPercent = formatPercentage(stats.value.taggedClips, stats.value.totalClips);

  return [
    {
      label: 'Tagged',
      value: `${stats.value.taggedClips} (${taggedPercent}%)`,
    },
    {
      label: 'Oldest',
      value: formatDate(stats.value.oldestClip),
    },
    {
      label: 'Newest',
      value: formatDate(stats.value.newestClip),
    },
  ];
});

onMounted(() => {
  void fetchStats();
});
</script>

<template>
  <div class="px-12 py-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <BaseSpinner class="size-8 block text-muted-400" />
    </div>

    <template v-else-if="stats">
      <!--
        The rules between the tiles are a one pixel grid gap over a `border`
        coloured ground, which is how the design draws them: no tile has a
        border of its own, so the row reads as one band rather than as four
        boxes with gutters.
      -->
      <div
        class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border-y border-border"
      >
        <StatCard
          v-for="card in statCards"
          :key="card.title"
          :title="card.title"
          :value="card.value"
          :subtitle="card.subtitle"
          :icon="card.icon"
          :clickable="card.clickable"
          @click="card.onClick?.()"
        />
      </div>

      <!--
        Two columns, the wider one carrying the list you scan and the narrower
        one the facts you glance at. 48px between them, which is the page's own
        gutter: anything less and the two columns read as one table.
      -->
      <div class="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 pt-6">
        <div class="space-y-10">
          <GamesList :games="stats.gameStats" />
          <ActivityChart :days="stats.clipsByDay" />
        </div>

        <div class="space-y-10">
          <TagsList :tags="stats.mostUsedTags" />
          <InfoPanel :items="infoItems" />
        </div>
      </div>
    </template>
  </div>
</template>
