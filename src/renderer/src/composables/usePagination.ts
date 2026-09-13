import { computed, type Ref } from 'vue';

export function usePagination(currentPage: Ref<number> | number, totalPages: Ref<number> | number) {
  const current = computed(() => typeof currentPage === 'number' ? currentPage : currentPage.value);
  const total = computed(() => typeof totalPages === 'number' ? totalPages : totalPages.value);

  const hasNextPage = computed(() => current.value < total.value);
  const hasPreviousPage = computed(() => current.value > 1);

  const visiblePages = computed(() => {
    const pages: (number | string)[] = [];
    const totalPagesValue = total.value;
    const currentPageValue = current.value;
    
    if (totalPagesValue <= 7) {
      for (let i = 1; i <= totalPagesValue; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPageValue <= 4) {
        for (let i = 2; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPagesValue);
      } else if (currentPageValue >= totalPagesValue - 3) {
        pages.push('ellipsis');
        for (let i = totalPagesValue - 4; i <= totalPagesValue; i++) {
          pages.push(i);
        }
      } else {
        pages.push('ellipsis');
        pages.push(currentPageValue - 1);
        pages.push(currentPageValue);
        pages.push(currentPageValue + 1);
        pages.push('ellipsis');
        pages.push(totalPagesValue);
      }
    }
    
    return pages;
  });

  return {
    currentPage: current,
    totalPages: total,
    hasNextPage,
    hasPreviousPage,
    visiblePages,
  };
}

