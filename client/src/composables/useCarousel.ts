import { ref, watch, type Ref } from 'vue';
import type { EmblaCarouselType } from 'embla-carousel';

export function useCarousel(
  emblaApi: Ref<EmblaCarouselType | undefined>,
  thumbsApi?: Ref<EmblaCarouselType | undefined>
) {
  const selectedIndex = ref(0);
  const canScrollPrev = ref(false);
  const canScrollNext = ref(false);

  function pauseAllVideos(): void {
    const allVideos = document.querySelectorAll('.embla__slide video') as NodeListOf<HTMLVideoElement>;
    allVideos.forEach(video => {
      if (!video.paused) {
        video.pause();
        video.currentTime = 0;
      }
    });
  }

  function updateState(): void {
    const api = emblaApi.value;
    if (!api) return;

    const slideCount = api.slideNodes?.()?.length ?? 0;
    if (slideCount === 0) {
      selectedIndex.value = 0;
      canScrollPrev.value = false;
      canScrollNext.value = false;
      return;
    }

    const previousIndex = selectedIndex.value;
    const newIndex = api.selectedScrollSnap();
    
    if (previousIndex !== newIndex) {
      pauseAllVideos();
    }

    selectedIndex.value = newIndex;
    canScrollPrev.value = api.canScrollPrev();
    canScrollNext.value = api.canScrollNext();

    thumbsApi?.value?.scrollTo(selectedIndex.value);
  }

  function scrollPrev(): void {
    emblaApi.value?.scrollPrev();
  }

  function scrollNext(): void {
    emblaApi.value?.scrollNext();
  }

  function scrollTo(index: number): void {
    emblaApi.value?.scrollTo(index);
  }

  function reinitialize(): void {
    emblaApi.value?.reInit();
    updateState();
    thumbsApi?.value?.reInit();
    thumbsApi?.value?.scrollTo(selectedIndex.value);
  }

  watch(emblaApi, (api) => {
    if (!api) return;
    api.on('select', updateState);
    api.on('reInit', updateState);
    updateState();
  });

  if (thumbsApi) {
    watch(thumbsApi, (api) => {
      if (!api) return;
      api.on('reInit', () => thumbsApi.value?.scrollTo(selectedIndex.value));
    });
  }

  return {
    selectedIndex,
    canScrollPrev,
    canScrollNext,
    scrollPrev,
    scrollNext,
    scrollTo,
    reinitialize,
  };
}

