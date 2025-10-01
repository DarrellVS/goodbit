import { ref } from 'vue';

export function useClipHover() {
  const hoveredClipId = ref<number | null>(null);

  function setHoveredClip(clipId: number | null): void {
    hoveredClipId.value = clipId;
  }

  return {
    hoveredClipId,
    setHoveredClip,
  };
}

