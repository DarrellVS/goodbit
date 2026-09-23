<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { AnimatePresence, motion } from 'motion-v';
import type { NotchAction, NotchIsland } from '@shared/notch';
import BaseButton from '@renderer/components/Base/BaseButton.vue';
import { ICON_BOX } from '@renderer/components/Base/geometry';
import { thumbUrl } from '@renderer/utils/mediaUrl';

/**
 * The open notch, read top to bottom in three steps.
 *
 * It was three rings, three rows of label and value and two buttons, all at
 * one weight, which is a dashboard and not something to take in with a glance
 * at the top of the screen. So: one line that says whether a clip can be made
 * right now and how many there are today; the latest clip as a picture with its
 * name, because the next thing anybody does with it is recognise it; then what
 * to do with it. The drive only speaks when it is filling up.
 */
const props = defineProps<{ island: NotchIsland }>();
const emit = defineEmits<{ act: [action: NotchAction] }>();

const recording = computed(
  () =>
    ({
      running: { dot: 'bg-success', text: 'Recording' },
      closed: { dot: 'bg-warning', text: 'OBS is closed' },
      missing: { dot: 'bg-muted-400', text: 'OBS is not installed' },
    })[props.island.recording],
);

const thumb = computed(() =>
  props.island.latest ? thumbUrl(props.island.latest.id, props.island.latest.modifiedAt) : null,
);

/*
 * Deleting the latest clip, asked in place.
 *
 * A square bin beside Open GoodBit. Pressing it grows the square leftwards
 * over Open GoodBit into the question, "Delete this clip", with a way back;
 * pressing that sends the file to the Recycle Bin. Asked here rather than in a
 * dialog because the notch has no window to put one in, and asked at all
 * because the row is the only copy of the clip's name, tags and marks. Trim
 * never moves: it keeps the left half whatever the right half is doing.
 */
const confirming = ref(false);
const half = ref<HTMLElement | null>(null);
/** The right half's width, measured when the question opens, so the spring has pixels to go to. */
const fullWidth = ref(0);

function ask(): void {
  fullWidth.value = half.value?.offsetWidth ?? 0;
  confirming.value = true;
}

function remove(): void {
  confirming.value = false;
  emit('act', 'delete-latest');
}

// A different latest clip is a different question.
watch(
  () => props.island.latest?.id,
  () => {
    confirming.value = false;
  },
);

const SPRING = { type: 'spring', visualDuration: 0.3, bounce: 0.12 } as const;
</script>

<template>
  <div class="flex h-full flex-col px-5 pb-[18px] pt-4">
    <div class="flex h-6 items-center justify-between gap-4 text-[12.5px]">
      <span class="inline-flex items-center gap-2 font-medium text-muted-900">
        <span class="size-2 rounded-full" :class="recording.dot" />
        {{ recording.text }}
      </span>
      <span class="text-muted-400">
        <span class="tabular-nums font-semibold text-muted-900">{{ island.today.count }}</span>
        {{ island.today.count === 1 ? 'clip' : 'clips' }} today
        <template v-if="island.today.count">
          · <span class="tabular-nums">{{ island.today.total }}</span>
        </template>
      </span>
    </div>

    <button
      v-if="island.latest"
      type="button"
      class="group mt-4 flex items-center gap-3 rounded-lg text-left outline-none focus-visible:focus-ring"
      @click="emit('act', 'open-latest')"
    >
      <span class="relative h-[63px] w-[112px] shrink-0 overflow-hidden rounded-md bg-video-bed">
        <img v-if="thumb" :src="thumb" alt="" class="size-full object-cover" draggable="false" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-400">
          Latest clip
        </span>
        <span class="mt-0.5 block truncate text-[13.5px] font-medium text-muted-900 group-hover:underline">
          {{ island.latest.name }}
        </span>
        <span class="mt-0.5 flex items-center gap-2 text-[12px] text-muted-400">
          <span class="truncate">{{ island.latest.meta }}</span>
          <span
            v-if="island.latest.moments"
            class="shrink-0 rounded-full bg-accent-sunk px-1.5 text-[11px] font-medium text-accent-ink"
          >
            {{ island.latest.moments }} {{ island.latest.moments === 1 ? 'GoodBit' : 'GoodBits' }} found
          </span>
        </span>
      </span>
    </button>
    <p v-else class="mt-4 flex h-[63px] items-center text-[13px] text-muted-400">
      No clips yet. Press your replay key in a game and it lands here.
    </p>

    <div class="mt-5 grid grid-cols-2 gap-2.5">
      <BaseButton tone="strong" :disabled="!island.latest" @click="emit('act', 'trim')">
        Trim the latest clip
      </BaseButton>

      <div ref="half" class="relative flex gap-2.5">
        <motion.div
          class="min-w-0 flex-1"
          :animate="{ opacity: confirming ? 0 : 1 }"
          :transition="{ duration: 0.15 }"
          :class="{ 'pointer-events-none': confirming }"
        >
          <BaseButton class="w-full" :tabindex="confirming ? -1 : 0" @click="emit('act', 'library')">
            Open GoodBit
          </BaseButton>
        </motion.div>

        <!-- Keeps the square's place in the row; the square itself floats so it can grow over Open. -->
        <span class="size-9 shrink-0" aria-hidden="true" />

        <motion.div
          v-if="island.latest"
          class="absolute inset-y-0 right-0 flex overflow-hidden rounded-md border border-danger bg-notch"
          :initial="false"
          :animate="{ width: confirming ? fullWidth : 36 }"
          :transition="SPRING"
        >
          <AnimatePresence mode="popLayout" :initial="false">
            <button
              v-if="!confirming"
              key="bin"
              type="button"
              class="flex size-9 shrink-0 items-center justify-center text-danger-ink outline-none transition-colors duration-150 hover:bg-danger/10 focus-visible:focus-ring"
              aria-label="Delete the latest clip"
              title="Delete the latest clip"
              @click="ask"
            >
              <Icon icon="material-symbols:delete-outline" :class="ICON_BOX" />
            </button>
            <motion.div
              v-else
              key="ask"
              class="flex min-w-0 flex-1 items-center"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1, transition: { delay: 0.12, duration: 0.15 } }"
              :exit="{ opacity: 0, transition: { duration: 0.08 } }"
            >
              <button
                type="button"
                class="h-full min-w-0 flex-1 whitespace-nowrap px-3 text-sm font-medium text-danger-ink outline-none transition-colors duration-150 hover:bg-danger/10 focus-visible:focus-ring"
                @click="remove"
              >
                Delete this clip
              </button>
              <button
                type="button"
                class="flex size-9 shrink-0 items-center justify-center border-l border-danger/40 text-muted-400 outline-none transition-colors duration-150 hover:text-muted-900 focus-visible:focus-ring"
                aria-label="Keep it"
                title="Keep it"
                @click="confirming = false"
              >
                <Icon icon="material-symbols:close" :class="ICON_BOX" />
              </button>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>

    <p v-if="island.disk" class="mt-3 text-[12px]" :class="island.disk.danger ? 'text-danger-ink' : 'text-warning'">
      {{ island.disk.drive }} is {{ island.disk.percent }}% full, {{ island.disk.free }} left
    </p>
  </div>
</template>
