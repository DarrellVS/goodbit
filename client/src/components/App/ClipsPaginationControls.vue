<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { usePagination } from '../../composables/usePagination';
import { pluralize } from '../../utils/pluralize';

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

const currentPageRef = ref(props.currentPage);
const totalPagesRef = ref(props.totalPages);

const { visiblePages, hasPreviousPage, hasNextPage } = usePagination(currentPageRef, totalPagesRef);

watch(() => props.currentPage, (val) => { currentPageRef.value = val; });
watch(() => props.totalPages, (val) => { totalPagesRef.value = val; });

function goToPage(page: number): void {
  if (page >= 1 && page <= props.totalPages && page !== props.currentPage) {
    emit('page-change', page);
  }
}

function goToPrevious(): void {
  if (hasPreviousPage.value) {
    goToPage(props.currentPage - 1);
  }
}

function goToNext(): void {
  if (hasNextPage.value) {
    goToPage(props.currentPage + 1);
  }
}
</script>

<template>
  <div v-if="loading" class="flex justify-center py-8">
    <Icon icon="material-symbols:progress-activity" class="w-8 h-8 text-orange-500 animate-spin" />
  </div>

  <div v-else-if="showPagination" class="flex flex-col items-center gap-4 py-8">
    <div class="text-sm text-gray-500">
      Showing page {{ currentPage }} of {{ totalPages }} ({{ total }} total {{ pluralize(total, 'clip') }})
    </div>
    
    <div class="flex items-center gap-2">
      <!-- Previous Button -->
      <button
        :disabled="!hasPreviousPage"
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
        :disabled="!hasNextPage"
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

