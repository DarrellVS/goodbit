<script setup lang="ts">
import StatsColumnHead from './StatsColumnHead.vue';
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
  <section>
    <StatsColumnHead title="Activity" note="Last 14 days" />

    <p v-if="days.length === 0" class="py-8 text-sm text-muted-500">
      No activity in the last 14 days
    </p>

    <!--
      `.b-bars`: a 140px row of columns that grow from the bottom, each with
      its count above the bar and its weekday under it. A day with nothing
      recorded is a hairline rather than a short bar, so an empty day reads as
      empty rather than as a small amount.
    -->
    <div v-else class="flex items-end gap-2.5 h-[140px] mt-5">
      <div
        v-for="day in days"
        :key="day.date"
        class="flex-1 flex flex-col justify-end items-center gap-2 h-full"
      >
        <span
          v-if="day.count > 0"
          class="font-mono text-xs tabular-nums text-muted-500"
        >
          {{ day.count }}
        </span>
        <div
          class="w-full rounded-sm cursor-default"
          :class="day.count === 0 ? 'bg-border h-px' : 'bg-accent'"
          :style="day.count === 0 ? undefined : { height: getBarHeight(day.count) }"
          :title="`${new Date(day.date).toLocaleDateString()}: ${day.count} clips`"
        />
        <span class="text-xs text-muted-400">
          {{ new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }) }}
        </span>
      </div>
    </div>
  </section>
</template>

