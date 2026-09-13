<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useStats } from '../composables/useStats';
import { useClipsStore } from '../stores/clips';
import { formatBytes, formatDate, formatPercentage } from '../utils/formatters';
import StatCard from '../components/Stats/StatCard.vue';
import GamesList from '../components/Stats/GamesList.vue';
import TagsList from '../components/Stats/TagsList.vue';
import InfoPanel from '../components/Stats/InfoPanel.vue';
import ActivityChart from '../components/Stats/ActivityChart.vue';

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
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-500/8',
      clickable: false,
      onClick: undefined,
    },
    {
      title: 'Storage',
      value: formatBytes(stats.value.totalSize),
      subtitle: `${formatBytes(stats.value.avgClipSize)} avg`,
      icon: 'material-symbols:storage',
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-500/8',
      clickable: false,
      onClick: undefined,
    },
    {
      title: 'Published',
      value: stats.value.publishedClips,
      subtitle: `${formatPercentage(stats.value.publishedClips, stats.value.totalClips)}%`,
      icon: 'material-symbols:cloud-upload',
      iconColor: 'text-green-500',
      iconBg: 'bg-green-500/8',
      clickable: true,
      onClick: handlePublishedClick,
    },
    {
      title: 'Starred',
      value: stats.value.starredClips,
      subtitle: `${formatPercentage(stats.value.starredClips, stats.value.totalClips)}%`,
      icon: 'material-symbols:star',
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-500/8',
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
  <div class="p-6 space-y-6">
    <div v-if="loading" class="flex items-center justify-center py-20">
      <Icon icon="material-symbols:progress-activity" class="w-12 h-12 text-orange-500 animate-spin" />
    </div>

    <template v-else-if="stats">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          v-for="card in statCards"
          :key="card.title"
          :title="card.title"
          :value="card.value"
          :subtitle="card.subtitle"
          :icon="card.icon"
          :icon-color="card.iconColor"
          :icon-bg="card.iconBg"
          :clickable="card.clickable"
          @click="card.onClick?.()"
        />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2">
          <GamesList :games="stats.gameStats" />
        </div>

        <div class="space-y-6">
          <TagsList :tags="stats.mostUsedTags" />
          <InfoPanel :items="infoItems" />
        </div>
      </div>

      <ActivityChart :days="stats.clipsByDay" />
    </template>
  </div>
</template>
