import { ref } from 'vue';

export type DragData = {
  type: 'clip';
  clipId: number;
};

const draggedData = ref<DragData | null>(null);

export function useDragAndDrop() {
  function startDrag(data: DragData, event: DragEvent) {
    draggedData.value = data;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', JSON.stringify(data));
    }
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function onDrop(event: DragEvent, handler: (data: DragData) => void) {
    event.preventDefault();
    if (draggedData.value) {
      handler(draggedData.value);
      draggedData.value = null;
    }
  }

  function endDrag() {
    draggedData.value = null;
  }

  return {
    startDrag,
    onDragOver,
    onDrop,
    endDrag,
    draggedData,
  };
}

