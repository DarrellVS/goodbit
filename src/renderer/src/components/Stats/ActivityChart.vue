<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface DayActivity {
  date: string;
  count: number;
}

interface Props {
  days: DayActivity[];
}

defineProps<Props>();

function getBarHeight(count: number): string {
  if (count === 0) return '8px';
  return `${Math.max(20, Math.min(120, count * 30))}px`;
}
</script>

<template>
  <div class="bg-muted-50 rounded-md p-5">
    <div class="flex items-center gap-2 mb-6">
      <h3 class="text-sm font-medium text-muted-600">Activity</h3>
      <span class="text-sm text-muted-500 ml-auto">Last 14 days</span>
    </div>

    <div v-if="days.length === 0" class="text-center py-12 text-muted-400">
      No activity in the last 14 days
    </div>

    <div v-else class="flex items-end justify-between gap-2">
      <div
        v-for="day in days"
        :key="day.date"
        class="flex-1 flex flex-col items-center gap-2"
      >
        <div
          class="w-full rounded-t-lg transition-all hover:opacity-80 cursor-default"
          :class="day.count === 0 ? 'bg-muted-100' : 'bg-accent'"
          :style="{ height: getBarHeight(day.count) }"
          :title="`${new Date(day.date).toLocaleDateString()}: ${day.count} clips`"
        >
          <div v-if="day.count > 0" class="text-xs font-medium text-accent-fg text-center mt-2">
            {{ day.count }}
          </div>
        </div>
        <span class="text-xs text-muted-400">
          {{ new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }) }}
        </span>
      </div>
    </div>
  </div>
</template>

