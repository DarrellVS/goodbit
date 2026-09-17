<script setup lang="ts">
import { watch, nextTick } from 'vue';
import emblaCarouselVue from 'embla-carousel-vue';
import { updateClipName, deleteClip } from '@renderer/services/clips';
import { useTodayClips } from '@renderer/composables/library/useTodayClips';
import { useCarousel } from '@renderer/composables/ui/useCarousel';
import { useVideoPlayback } from '@renderer/composables/media/useVideoPlayback';
import { useClipHandlers } from '@renderer/composables/clips/useClipHandlers';
import type { Clip } from '@renderer/types/clip';
import CarouselSlide from '@renderer/components/Library/CarouselSlide.vue';
import CarouselNavigation from '@renderer/components/Library/CarouselNavigation.vue';
import ThumbnailStrip from '@renderer/components/Library/ThumbnailStrip.vue';
import BaseEmptyState from '@renderer/components/Base/BaseEmptyState.vue';

const { todayClips, clipsStore } = useTodayClips();
const { getVideoUrl, getThumbUrl } = useClipHandlers();

const [emblaRef, emblaApi] = emblaCarouselVue(
  { loop: false, duration: 24 },
  []
);

const [thumbsRef, thumbsApi] = emblaCarouselVue(
  { 
    axis: 'x', 
    align: 'start', 
    containScroll: 'keepSnaps', 
    dragFree: true, 
    loop: false 
  },
  []
);

const {
  selectedIndex,
  canScrollPrev,
  canScrollNext,
  scrollPrev,
  scrollNext,
  scrollTo,
  reinitialize,
} = useCarousel(emblaApi, thumbsApi);

useVideoPlayback(selectedIndex);

async function handleClipRename(clipId: number, name: string): Promise<void> {
  const updated = await updateClipName(clipId, name || null);
  clipsStore.updateClip(updated);
}

async function handleClipDelete(clipId: number): Promise<void> {
  await deleteClip(clipId);
  clipsStore.resetPagination();
  await clipsStore.fetchClips(false);
}

watch(todayClips, async () => {
  if (!emblaApi.value) return;
  await nextTick();
  reinitialize();
});
</script>

<template>
  <div class="px-12 py-6 space-y-6">
    <!-- Same reason as the library: this is where the waiting happens. -->

    <div class="embla relative group">
      <div class="embla__viewport" ref="emblaRef">
        <div class="embla__container">
          <CarouselSlide
            v-for="(clip, index) in todayClips"
            :key="clip.id"
            :clip="clip"
            :video-url="getVideoUrl(clip)"
            :poster-url="getThumbUrl(clip)"
            :is-active="selectedIndex === index"
            @rename="name => handleClipRename(clip.id, name)"
            @delete="handleClipDelete(clip.id)"
          />
        </div>
      </div>

      <CarouselNavigation
        :can-prev="canScrollPrev"
        :can-next="canScrollNext"
        :show-controls="todayClips.length > 0"
        @previous="scrollPrev"
        @next="scrollNext"
      />
    </div>

    <nav class="embla-thumbs mt-6" aria-label="Clip thumbnails">
      <div class="embla-thumbs__viewport px-8 pt-2 -mx-8" ref="thumbsRef">
        <ThumbnailStrip
          :clips="todayClips"
          :selected-index="selectedIndex"
          :get-thumb-url="getThumbUrl"
          @select="scrollTo"
        />
      </div>
    </nav>

    <BaseEmptyState
      v-if="todayClips.length === 0"
      icon="material-symbols:video-library"
      title="No clips from today"
      description="Clips you create today will appear here."
    />
  </div>
</template>

<style scoped>
.embla__viewport {
  overflow: hidden;
  border-radius: 18px;
}

.embla__container {
  display: flex;
  gap: 24px;
}

.embla__slide {
  flex: 0 0 100%;
  min-width: 0;
}

.embla__slide > div {
  transform: translateZ(0);
  transition: transform 1000ms cubic-bezier(0.22, 1, 0.36, 1);
}

.embla__slide.is-active > div {
  transform: scale(1);
}

.embla__slide:not(.is-active) > div {
  transform: scale(0.75);
}

.embla-thumbs__viewport {
  overflow: hidden;
}
</style>
