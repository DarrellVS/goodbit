<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { formatTime } from '../../utils/timeFormat';
import { loadWaveformPeaks } from '../../composables/useAudioWaveform';
import type { TimelineAudio } from '../../types/editor';

interface Props {
  item: TimelineAudio;
  pixelsPerSecond: number;
  selected: boolean;
}

interface Emits {
  (e: 'select', id: string): void;
  (e: 'remove', id: string): void;
  (e: 'trim', id: string, trimStart: number, trimEnd: number): void;
  (e: 'move', id: string, newStartTime: number): void;
  /** Fired once when a gesture begins, so undo steps over a whole drag. */
  (e: 'drag-start'): void;
}

const enum DragMode {
  None,
  Move,
  TrimLeft,
  TrimRight,
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const canvas = ref<HTMLCanvasElement | null>(null);
const peaks = ref<Float32Array | null>(null);

const dragMode = ref(DragMode.None);
const dragStartX = ref(0);
const dragInitialValue = ref(0);

const width = computed(() => props.item.duration * props.pixelsPerSecond);

const style = computed(() => ({
  left: `${props.item.startTime * props.pixelsPerSecond}px`,
  width: `${width.value}px`,
}));

const isDragging = computed(() => dragMode.value !== DragMode.None);
// `const enum` is erased at compile time, so it cannot be referenced from the
// template — the cursor decision has to happen here.
const cursorClass = computed(() =>
  dragMode.value === DragMode.Move ? 'cursor-grabbing' : 'cursor-grab'
);

const fadeInWidth = computed(() => props.item.fadeIn * props.pixelsPerSecond);
const fadeOutWidth = computed(() => props.item.fadeOut * props.pixelsPerSecond);
const volumePercent = computed(() => Math.round(props.item.volume * 100));

function drawWaveform(): void {
  const element = canvas.value;
  if (!element) return;

  const cssWidth = Math.max(1, Math.round(width.value));
  const cssHeight = element.clientHeight || 40;
  const ratio = window.devicePixelRatio || 1;

  element.width = Math.round(cssWidth * ratio);
  element.height = Math.round(cssHeight * ratio);

  const context = element.getContext('2d');
  if (!context) return;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);

  const data = peaks.value;
  if (!data || !props.item.originalDuration) return;

  // Only the trimmed slice of the track is on screen, so the peaks are read
  // through the same window instead of squeezing the whole file into the bar.
  const from = Math.floor((props.item.trimStart / props.item.originalDuration) * data.length);
  const to = Math.ceil((props.item.trimEnd / props.item.originalDuration) * data.length);
  const span = Math.max(1, to - from);
  const middle = cssHeight / 2;

  context.fillStyle = 'rgba(234, 88, 12, 0.55)';

  for (let x = 0; x < cssWidth; x++) {
    const index = from + Math.floor((x / cssWidth) * span);
    const peak = data[Math.min(data.length - 1, Math.max(0, index))] ?? 0;
    const barHeight = Math.max(1, peak * (cssHeight - 4));
    context.fillRect(x, middle - barHeight / 2, 1, barHeight);
  }
}

async function loadPeaks(): Promise<void> {
  const url = props.item.url;
  const result = await loadWaveformPeaks(url);
  if (props.item.url !== url) return;

  peaks.value = result;
  drawWaveform();
}

function startDrag(mode: DragMode, initialValue: number, event: MouseEvent): void {
  event.stopPropagation();

  emit('drag-start');
  dragMode.value = mode;
  dragStartX.value = event.clientX;
  dragInitialValue.value = initialValue;

  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);
}

function handleDrag(event: MouseEvent): void {
  if (dragMode.value === DragMode.None) return;

  const deltaTime = (event.clientX - dragStartX.value) / props.pixelsPerSecond;

  if (dragMode.value === DragMode.TrimLeft) {
    const newStart = Math.max(
      0,
      Math.min(dragInitialValue.value + deltaTime, props.item.trimEnd - 0.1)
    );
    emit('trim', props.item.id, newStart, props.item.trimEnd);
  } else if (dragMode.value === DragMode.TrimRight) {
    const newEnd = Math.max(
      props.item.trimStart + 0.1,
      Math.min(dragInitialValue.value + deltaTime, props.item.originalDuration)
    );
    emit('trim', props.item.id, props.item.trimStart, newEnd);
  } else {
    emit('move', props.item.id, Math.max(0, dragInitialValue.value + deltaTime));
  }
}

function stopDrag(): void {
  dragMode.value = DragMode.None;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', stopDrag);
}

function startTrimLeft(event: MouseEvent): void {
  startDrag(DragMode.TrimLeft, props.item.trimStart, event);
}

function startTrimRight(event: MouseEvent): void {
  startDrag(DragMode.TrimRight, props.item.trimEnd, event);
}

function handleMouseDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).classList.contains('trim-handle')) return;
  startDrag(DragMode.Move, props.item.startTime, event);
}

onMounted(() => {
  void loadPeaks();
  drawWaveform();
});

watch(
  () => props.item.url,
  () => {
    peaks.value = null;
    void loadPeaks();
  }
);

watch(
  () => [width.value, props.item.trimStart, props.item.trimEnd],
  () => drawWaveform()
);

onBeforeUnmount(stopDrag);
</script>

<template>
  <div
    class="absolute top-0 h-12 rounded-lg overflow-hidden group select-none"
    :class="[
      selected ? 'ring-2 ring-orange-500 shadow-lg shadow-orange-500/30' : 'hover:ring-2 hover:ring-orange-400/50',
      cursorClass,
      isDragging ? '' : 'transition-[left,width] duration-150 ease-out',
      item.muted ? 'opacity-60' : ''
    ]"
    :style="style"
    @mousedown="handleMouseDown"
    @click.stop="emit('select', item.id)"
  >
    <div class="relative w-full h-full bg-gradient-to-br from-orange-500/16 to-amber-500/8 border border-orange-300">
      <canvas ref="canvas" class="absolute inset-0 w-full h-full" />

      <!-- Fade ramps, drawn as the wedge that the export actually applies. -->
      <div
        v-if="fadeInWidth > 0"
        class="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-card/90 to-transparent pointer-events-none"
        :style="{ width: `${fadeInWidth}px` }"
      />
      <div
        v-if="fadeOutWidth > 0"
        class="absolute top-0 bottom-0 right-0 bg-gradient-to-l from-card/90 to-transparent pointer-events-none"
        :style="{ width: `${fadeOutWidth}px` }"
      />

      <div class="absolute top-1 left-2 right-2 flex items-center justify-between gap-2">
        <div class="text-[10px] font-semibold text-foreground flex items-center gap-1 bg-card/85 backdrop-blur-sm px-1.5 py-0.5 rounded min-w-0">
          <Icon
            :icon="item.muted ? 'material-symbols:music-off' : 'material-symbols:music-note'"
            class="text-xs flex-shrink-0"
          />
          <span class="truncate">{{ item.name }}</span>
        </div>

        <button
          class="opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 rounded p-0.5 flex-shrink-0"
          @click.stop="emit('remove', item.id)"
        >
          <Icon icon="material-symbols:close" class="text-card text-xs" />
        </button>
      </div>

      <div class="absolute bottom-1 left-2 right-2 flex items-end justify-between">
        <div class="text-[10px] font-mono font-medium text-foreground bg-card/85 backdrop-blur-sm px-1.5 py-0.5 rounded">
          {{ formatTime(item.duration) }}
        </div>
        <div class="text-[10px] font-mono text-muted-700 bg-card/85 backdrop-blur-sm px-1.5 py-0.5 rounded">
          {{ volumePercent }}%
        </div>
      </div>

      <div
        class="trim-handle absolute left-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown="startTrimLeft($event)"
      />
      <div
        class="trim-handle absolute right-0 top-0 bottom-0 w-1 bg-orange-500 opacity-60 cursor-ew-resize hover:w-1.5 hover:opacity-100 transition-all z-10"
        @mousedown="startTrimRight($event)"
      />
    </div>
  </div>
</template>
