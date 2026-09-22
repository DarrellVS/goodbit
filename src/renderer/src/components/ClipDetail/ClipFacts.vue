<script setup lang="ts">
import { computed } from 'vue';
import { useFormat } from '@renderer/composables/ui/useFormat';
import { formatRelativeTime, formatExactDate } from '@renderer/helpers/dateFormat';
import { formatTimeSimple } from '@renderer/utils/timeFormat';
import type { ClipMeta } from '@renderer/services/clips';
import type { Clip } from '@renderer/types/clip';

/**
 * The file and the picture, as facts rather than as features.
 *
 * These were two cards, each with a coloured icon in a gradient tile and a
 * bold heading, sitting level with the video and later spanning the whole
 * width of the modal. That is a great deal of screen and visual weight for a
 * file name and a frame rate, which is information you look up rather than
 * information you came for.
 *
 * One quiet block at the bottom of the actions column instead. No icons, no
 * headings above each half, labels in the muted ladder and values only just
 * brighter than them. It reads as a footnote, which is what it is.
 */
interface Props {
  clip: Clip;
  metadata: ClipMeta | null;
  showExactDate: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: 'toggle-date'): void }>();

const { formatBytes } = useFormat();

/**
 * ffprobe reports the frame rate as a fraction, `30/1`, `60000/1001`, which is
 * exact and unreadable. Divided out and rounded to one place, 29.97 stays
 * 29.97 and 30 stays 30.
 */
const frameRate = computed(() => {
  const raw = props.metadata?.fps;
  if (!raw) return null;

  const [top, bottom] = raw.split('/').map(Number);
  const value = bottom ? top / bottom : top;
  if (!Number.isFinite(value)) return raw;

  return Math.round(value * 100) / 100;
});

/** The picture's own numbers, on one line, because they belong together. */
const picture = computed(() => {
  const parts: string[] = [];
  if (props.metadata?.width && props.metadata?.height) {
    parts.push(`${props.metadata.width}x${props.metadata.height}`);
  }
  if (frameRate.value) parts.push(`${frameRate.value} fps`);
  return parts.join(' · ');
});
</script>

<template>
  <div class="rounded-lg border border-border/60 px-4 py-3.5 space-y-2.5">
    <div class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-muted-500 shrink-0">Recorded</span>
      <!--
        When it was recorded, not when the file last changed. A trim rewrites
        the file, and "Modified" then reported the moment you pressed save.
      -->
      <button
        class="text-xs text-muted-600 hover:text-accent-ink transition-colors text-right"
        :title="showExactDate ? 'Show it the short way' : 'Show the exact date'"
        @click="emit('toggle-date')"
      >
        {{
          showExactDate
            ? formatExactDate(clip.recordedAt ?? clip.fileModifiedAt)
            : formatRelativeTime(clip.recordedAt ?? clip.fileModifiedAt)
        }}
      </button>
    </div>

    <div v-if="metadata?.durationSec" class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-muted-500 shrink-0">Length</span>
      <span class="text-xs text-muted-600">{{ formatTimeSimple(metadata.durationSec) }}</span>
    </div>

    <div v-if="picture" class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-muted-500 shrink-0">Picture</span>
      <span class="text-xs text-muted-600 text-right">{{ picture }}</span>
    </div>

    <!--
      Said here as a fact rather than shown as a badge, because by the time
      somebody has a clip open they are deciding what to do with it, and what
      this changes is exactly that: a recording is the only copy of a moment,
      and an export can be rendered again from the timeline it came from.
    -->
    <div v-if="clip.isExport" class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-muted-500 shrink-0">Made</span>
      <span class="text-xs text-muted-600 text-right">In the editor</span>
    </div>

    <div class="flex items-baseline justify-between gap-3">
      <span class="text-xs text-muted-500 shrink-0">Size</span>
      <span class="text-xs text-muted-600">{{ formatBytes(clip.sizeBytes) }}</span>
    </div>

    <!--
      Last, and allowed to wrap, because a recording's filename is a timestamp
      nobody reads and it is the one thing here that cannot fit on a line.
    -->
    <div class="pt-1.5 border-t border-border/60">
      <div class="text-xs text-muted-500 mb-0.5">File</div>
      <div class="text-xs text-muted-600 break-all leading-relaxed">{{ clip.filename }}</div>
    </div>
  </div>
</template>
