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
  <div class="bg-white border border-gray-300 rounded-xl p-6">
    <div class="flex items-center gap-2 mb-6">
      <Icon icon="material-symbols:calendar-month" class="text-xl text-orange-500" />
      <h3 class="text-lg font-semibold">Activity</h3>
      <span class="text-sm text-gray-500 ml-auto">Last 14 days</span>
    </div>
    
    <div v-if="days.length === 0" class="text-center py-12 text-gray-400">
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
          :class="day.count === 0 ? 'bg-gray-100' : 'bg-orange-500'"
          :style="{ height: getBarHeight(day.count) }"
          :title="`${new Date(day.date).toLocaleDateString()}: ${day.count} clips`"
        >
          <div v-if="day.count > 0" class="text-xs font-medium text-white text-center mt-2">
            {{ day.count }}
          </div>
        </div>
        <span class="text-xs text-gray-400">
          {{ new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }) }}
        </span>
      </div>
    </div>
  </div>
</template>

