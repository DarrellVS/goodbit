<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { EDITOR_CONSTANTS } from '@renderer/constants/editor';
import { Icon } from '@iconify/vue';
import { formatTime } from '@renderer/utils/timeFormat';
import { frameStripUrl } from '@renderer/utils/mediaUrl';
import type { TimelineClip } from '@renderer/types/editor';
import TimelineClipMarks from './TimelineClipMarks.vue';

interface Props {
  clip: TimelineClip;
  pixelsPerSecond: number;
  selected: boolean;
}

interface Emits {
  (e: 'select', clipId: string): void;
  (e: 'remove', clipId: string): void;
  (e: 'trim', clipId: string, trimStart: number, trimEnd: number): void;
  (e: 'move', clipId: string, newStartTime: number): void;
  /** Fired once when a gesture begins, so undo steps over a whole drag. */
  (e: 'drag-start'): void;
  (e: 'drag-end'): void;
}

const enum DragMode {
  None,
  Move,
  TrimLeft,
  TrimRight,
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const dragMode = ref(DragMode.None);
const dragStartX = ref(0);
const dragInitialValue = ref(0);

const style = computed(() => ({
  // The lane's own inset, so a clip at 0:00 does not sit on its corner.
  left: `${EDITOR_CONSTANTS.TIMELINE_LANE_INSET_PX + props.clip.startTime * props.pixelsPerSecond}px`,
  width: `${props.clip.duration * props.pixelsPerSecond}px`,
}));

/**
 * The strip, positioned so the visible stills are the ones between the handles.
 *
 * The image spans the whole source clip, so the kept fraction decides how far
 * it is blown up and the head trim decides how far it is pushed left. Dimmed,
 * because the labels on top of it have to stay readable.
 */
const stripStyle = computed(() => {
  const { originalDuration, trimStart, duration } = props.clip;
  if (!frameStripUrlFor.value || !originalDuration || duration <= 0) return null;

  const keptFraction = Math.min(1, duration / originalDuration);
  if (keptFraction <= 0) return null;

  const scale = 1 / keptFraction;
  const offsetPercent = originalDuration > duration
    ? (trimStart / (originalDuration - duration)) * 100
    : 0;

  return {
    backgroundImage: `url("${frameStripUrlFor.value}")`,
    backgroundSize: `${scale * 100}% 100%`,
    backgroundPosition: `${offsetPercent}% center`,
    opacity: '0.45',
  };
});

const frameStripUrlFor = computed(() => frameStripUrl(props.clip.clipId));

const cursorClass = computed(() =>
  dragMode.value === DragMode.Move ? 'cursor-grabbing' : 'cursor-grab'
);

const isDragging = computed(() => dragMode.value !== DragMode.None);

function startDrag(mode: DragMode, initialValue: number, event: MouseEvent): void {
  event.stopPropagation();

  emit('drag-start');
  dragMode.value = mode;
  dragStartX.value = event.clientX;
  dragInitialValue.value = initialValue;

  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', endDrag);
}

function handleDrag(event: MouseEvent): void {
  if (dragMode.value === DragMode.None) return;

  const deltaTime = (event.clientX - dragStartX.value) / props.pixelsPerSecond;
  const mode = dragMode.value;

  if (mode === DragMode.TrimLeft) {
    const newStart = Math.max(0, Math.min(dragInitialValue.value + deltaTime, props.clip.trimEnd - 0.1));
    emit('trim', props.clip.id, newStart, props.clip.trimEnd);
  } else if (mode === DragMode.TrimRight) {
    const newEnd = Math.max(props.clip.trimStart + 0.1, Math.min(dragInitialValue.value + deltaTime, props.clip.originalDuration));
    emit('trim', props.clip.id, props.clip.trimStart, newEnd);
  } else if (mode === DragMode.Move) {
    const newStart = Math.max(0, dragInitialValue.value + deltaTime);
    emit('move', props.clip.id, newStart);
  }
}

function stopDrag(): void {
  dragMode.value = DragMode.None;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', endDrag);
}

function endDrag(): void {
  const wasDragging = dragMode.value !== DragMode.None;
  stopDrag();

  // Lets the timeline close any gap the drag opened, once the gesture is over.
  if (wasDragging) emit('drag-end');
}

function handleMouseDown(event: MouseEvent): void {
  if ((event.target as HTMLElement).classList.contains('trim-handle')) return;
  startDrag(DragMode.Move, props.clip.startTime, event);
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <!--
    Inset from the lane, and selected by its own edge.

    It sat flush to the top of the lane with a card's border *and* a 2px accent
    ring, so a selected clip was three concentric outlines. The design insets
    the block 6px inside the lane and marks the selected one by turning its own
    hairline accent, which costs no layout and cannot stack.
  -->
  <div
    class="absolute top-1.5 bottom-1.5 rounded-sm overflow-hidden group select-none border"
    :class="[
      selected ? 'border-accent' : 'border-line-strong hover:border-muted-300',
      cursorClass,
      // Follow the cursor 1:1 while dragging; glide when the timeline reflows on release.
      isDragging ? '' : 'transition-[left,width] duration-150 ease-out'
    ]"
    :style="style"
    @mousedown="handleMouseDown"
    @click.stop="emit('select', clip.id)"
  >
    <div class="relative w-full h-full bg-muted-100 overflow-hidden">
      <!--
        The frame strip covers the whole source clip, so the block shows only
        the slice between the trim handles, scroll it by trimStart and stretch
        it by the share of the clip that is kept, and the stills stay under the
        moments they belong to while the handles move.
      -->
      <div
        v-if="stripStyle"
        class="absolute inset-0 bg-no-repeat pointer-events-none"
        :style="stripStyle"
      />
      <img
        v-else
        :src="clip.thumbnailUrl"
        :alt="`Clip ${clip.clipId}`"
        class="w-full h-full object-cover opacity-45"
      />

      <!--
        The name and the duration sit straight on the still, which is already
        at 45%. They each had a pill of their own behind them, plus a gradient
        over the whole block, which is three grounds for two short strings.
      -->
      <span
        class="absolute top-0 left-0 right-6 px-2 py-1 text-[11.5px] text-foreground truncate pointer-events-none"
      >
        {{ clip.name }}
      </span>

      <span
        class="absolute left-2 font-mono text-[10.5px] text-muted-600 pointer-events-none"
        :class="clip.goodBits?.length ? 'bottom-3.5' : 'bottom-1'"
      >
        {{ formatTime(clip.duration) }}
      </span>

      <!--
        The marks, along the bottom edge. Drawn after the labels so a band is
        never hidden under one, and before the controls so the remove button
        still takes its clicks.
      -->
      <TimelineClipMarks
        :marks="clip.goodBits"
        :trim-start="clip.trimStart"
        :trim-end="clip.trimEnd"
      />

      <Icon
        v-if="clip.muted"
        icon="material-symbols:volume-off"
        class="absolute right-2 size-3.5 block text-muted-500 pointer-events-none"
        :class="clip.goodBits?.length ? 'bottom-3.5' : 'bottom-1'"
      />

      <button
        type="button"
        class="absolute right-0.5 top-0.5 size-6 inline-flex items-center justify-center rounded-sm text-muted-500 hover:text-foreground hover:bg-muted-200 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 outline-none focus-visible:focus-ring transition-opacity duration-150"
        :title="`Remove ${clip.name} from the timeline`"
        :aria-label="`Remove ${clip.name} from the timeline`"
        @click.stop="emit('remove', clip.id)"
      >
        <Icon icon="material-symbols:close" class="size-3.5 block" />
      </button>

      <!--
        14px of grab either side, per the design, and no width change on hover:
        a handle that grows moves its own edge out from under the pointer.
      -->
      <div
        class="trim-handle absolute left-0 top-0 bottom-0 w-3.5 cursor-ew-resize z-10"
        @mousedown="startDrag(DragMode.TrimLeft, clip.trimStart, $event)"
      />
      <div
        class="trim-handle absolute right-0 top-0 bottom-0 w-3.5 cursor-ew-resize z-10"
        @mousedown="startDrag(DragMode.TrimRight, clip.trimEnd, $event)"
      />
    </div>
  </div>
</template>
