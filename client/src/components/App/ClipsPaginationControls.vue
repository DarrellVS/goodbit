<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  loading: boolean;
  currentPage: number;
  totalPages: number;
  total: number;
  hasClips: boolean;
}

interface Emits {
  (e: 'page-change', page: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const showPagination = computed(() => props.hasClips && props.totalPages > 1);

function goToPage(page: number): void {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('page-change', page);
  }
}

function goToPrevious(): void {
  if (props.currentPage > 1) {
    goToPage(props.currentPage - 1);
  }
}

function goToNext(): void {
  if (props.currentPage < props.totalPages) {
    goToPage(props.currentPage + 1);
  }
}

// Calculate which page numbers to show
const visiblePages = computed(() => {
  const pages: (number | string)[] = [];
  const total = props.totalPages;
  const current = props.currentPage;
  
  if (total <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= total; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);
    
    if (current <= 4) {
      // Show pages 1-5, then ellipsis, then last
      for (let i = 2; i <= 5; i++) {
        pages.push(i);
      }
      pages.push('ellipsis');
      pages.push(total);
    } else if (current >= total - 3) {
      // Show first, ellipsis, then last 5 pages
      pages.push('ellipsis');
      for (let i = total - 4; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Show first, ellipsis, current-1, current, current+1, ellipsis, last
      pages.push('ellipsis');
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push('ellipsis');
      pages.push(total);
    }
  }
  
  return pages;
});
</script>

<template>
  <div v-if="loading" class="flex justify-center py-8">
    <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
  </div>

  <div v-else-if="showPagination" class="flex flex-col items-center gap-4 py-8">
    <div class="text-sm text-gray-500">
      Showing page {{ currentPage }} of {{ totalPages }} ({{ total }} total {{ total === 1 ? 'clip' : 'clips' }})
    </div>
    
    <div class="flex items-center gap-2">
      <!-- Previous Button -->
      <button
        :disabled="currentPage === 1"
        class="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
        @click="goToPrevious"
      >
        <Icon icon="material-symbols:chevron-left" class="text-lg" />
        <span>Previous</span>
      </button>

      <!-- Page Numbers -->
      <div class="flex items-center gap-1">
        <template v-for="(page, index) in visiblePages" :key="`${page}-${index}`">
          <button
            v-if="page !== 'ellipsis'"
            :class="[
              'px-3 py-2 rounded-lg text-sm font-medium transition-colors min-w-[40px]',
              page === currentPage
                ? 'bg-orange-500 text-white'
                : 'border border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
            ]"
            @click="goToPage(page as number)"
          >
            {{ page }}
          </button>
          <span
            v-else
            class="px-2 text-gray-400"
          >
            ...
          </span>
        </template>
      </div>

      <!-- Next Button -->
      <button
        :disabled="currentPage === totalPages"
        class="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm font-medium"
        @click="goToNext"
      >
        <span>Next</span>
        <Icon icon="material-symbols:chevron-right" class="text-lg" />
      </button>
    </div>
  </div>

  <div v-else-if="!hasClips" class="text-center py-8 text-sm text-gray-400">
    No clips found
  </div>
</template>

