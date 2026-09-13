import { onMounted, onBeforeUnmount, ref } from 'vue';

interface UseInfiniteScrollOptions {
  onLoadMore: () => void | Promise<void>;
  threshold?: number;
  enabled?: () => boolean;
}

export function useInfiniteScroll(options: UseInfiniteScrollOptions) {
  const { onLoadMore, threshold = 300, enabled = () => true } = options;
  const isLoading = ref(false);
  let scrollContainer: HTMLElement | null = null;

  function handleScroll(event: Event): void {
    if (!enabled() || isLoading.value) return;

    const target = event.target as HTMLElement;
    const scrollHeight = target.scrollHeight;
    const scrollTop = target.scrollTop;
    const clientHeight = target.clientHeight;

    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < threshold) {
      isLoading.value = true;
      Promise.resolve(onLoadMore()).finally(() => {
        isLoading.value = false;
      });
    }
  }

  onMounted(() => {
    scrollContainer = document.querySelector('main');
    
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }
  });

  onBeforeUnmount(() => {
    if (scrollContainer) {
      scrollContainer.removeEventListener('scroll', handleScroll);
    }
  });

  return {
    isLoading,
  };
}

