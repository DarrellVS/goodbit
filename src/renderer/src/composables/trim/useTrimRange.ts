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
  
  /*
   * There is no `formatTime` here any more.
   *
   * It printed `12.3s`, which was the whole of item 3.3's complaint: the cut is
   * frame accurate and the page was writing it down to a tenth. The trim
   * timeline formats through `utils/frameRate.ts` now, which needs the clip's
   * frame rate and so cannot live in a composable that only knows its length.
   */
  return {
    duration,
    range,
    trimmedLength,
    isValidRange,
    timeToPercentage,
    initializeRange,
  };
}

