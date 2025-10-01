import { ref, computed } from 'vue';

export type TimeRange = [number, number];

export function useTrimRange() {
  const duration = ref<number>(0);
  const range = ref<TimeRange>([0, 1]);
  
  const timeToPercentage = (timeInSeconds: number): number => {
    if (!duration.value) return 0;
    return (timeInSeconds / duration.value) * 100;
  };
  
  const trimmedLength = computed(() => 
    Math.max(0, range.value[1] - range.value[0])
  );
  
  const isValidRange = computed(() => 
    range.value[1] > range.value[0]
  );
  
  const initializeRange = (videoDuration: number) => {
    duration.value = videoDuration;
    range.value = [0, Math.max(1, videoDuration)];
  };
  
  const formatTime = (timeInSeconds: number, decimals: number = 1): string => {
    return `${timeInSeconds.toFixed(decimals)}s`;
  };
  
  return {
    duration,
    range,
    trimmedLength,
    isValidRange,
    timeToPercentage,
    initializeRange,
    formatTime,
  };
}

