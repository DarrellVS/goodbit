import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { useStats } from './useStats';
import { formatBytes, formatDate, formatPercentage } from '../utils/formatters';

export function useStatsCards() {
  const router = useRouter();
  const clipsStore = useClipsStore();
  const { stats } = useStats();

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

  const statCards = computed(() => {
    if (!stats.value) return [];
    
    return [
      {
        title: 'Total Clips',
        value: stats.value.totalClips.toLocaleString(),
        subtitle: `${stats.value.gamesCount} games`,
        icon: 'material-symbols:video-library',
        iconColor: 'text-orange-500',
        iconBg: 'bg-orange-50',
        clickable: false,
        onClick: undefined,
      },
      {
        title: 'Storage',
        value: formatBytes(stats.value.totalSize),
        subtitle: `${formatBytes(stats.value.avgClipSize)} avg`,
        icon: 'material-symbols:storage',
        iconColor: 'text-blue-500',
        iconBg: 'bg-blue-50',
        clickable: false,
        onClick: undefined,
      },
      {
        title: 'Published',
        value: stats.value.publishedClips,
        subtitle: `${formatPercentage(stats.value.publishedClips, stats.value.totalClips)}%`,
        icon: 'material-symbols:cloud-upload',
        iconColor: 'text-green-500',
        iconBg: 'bg-green-50',
        clickable: true,
        onClick: handlePublishedClick,
      },
      {
        title: 'Starred',
        value: stats.value.starredClips,
        subtitle: `${formatPercentage(stats.value.starredClips, stats.value.totalClips)}%`,
        icon: 'material-symbols:star',
        iconColor: 'text-orange-500',
        iconBg: 'bg-orange-50',
        clickable: true,
        onClick: handleStarredClick,
      },
    ];
  });

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

  return {
    statCards,
    infoItems,
  };
}

