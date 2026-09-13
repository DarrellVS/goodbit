<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'radix-vue';
import { formatTime } from '../../utils/timeFormat';

interface Props {
  open: boolean;
  defaultName: string;
  clipCount: number;
  trackCount: number;
  duration: number;
  exporting?: boolean;
  progress?: number;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  (e: 'confirm', name: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  exporting: false,
  progress: 0,
});
const emit = defineEmits<Emits>();

const name = ref('');
const input = ref<HTMLInputElement | null>(null);

/** The name becomes a filename, so the characters Windows rejects go first. */
const cleanName = computed(() => name.value.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim());
const isValid = computed(() => cleanName.value.length > 0);
const wasCleaned = computed(() => cleanName.value !== name.value.trim());

/** Escape and backdrop clicks must not walk away from a render in flight. */
function handleOpenChange(value: boolean): void {
  if (!value && props.exporting) return;
  emit('update:open', value);
}

function submit(): void {
  if (!isValid.value || props.exporting) return;
  emit('confirm', cleanName.value);
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    name.value = props.defaultName;
    await nextTick();
    input.value?.select();
  }
);
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md flex flex-col outline-none modal-content-animate"
      >
        <div class="p-6 border-b border-gray-200">
          <DialogTitle class="text-xl font-bold text-gray-900 mb-1">Export timeline</DialogTitle>
          <DialogDescription class="text-sm text-gray-600">
            The render lands in your Editor folder under this name
          </DialogDescription>
        </div>

        <div class="p-6 space-y-4">
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Clip name
            </label>
            <div class="relative">
              <input
                ref="input"
                v-model="name"
                type="text"
                placeholder="Name your clip"
                class="w-full px-4 py-2.5 pr-14 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all disabled:bg-gray-50 disabled:text-gray-500"
                :disabled="exporting"
                @keydown.enter="submit"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-mono text-gray-400">
                .mp4
              </span>
            </div>
            <p v-if="wasCleaned" class="text-xs text-amber-600">
              Saved as “{{ cleanName }}” — characters a filename cannot hold were dropped.
            </p>
          </div>

          <div v-if="exporting" class="space-y-1.5">
            <div class="flex items-center justify-between text-xs font-medium text-gray-700">
              <span>Rendering…</span>
              <span class="font-mono">{{ Math.round(progress) }}%</span>
            </div>
            <div class="h-2 rounded-full bg-orange-100 overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-orange-500 to-orange-600 transition-[width] duration-300"
                :style="{ width: `${Math.max(2, progress)}%` }"
              />
            </div>
            <p class="text-xs text-gray-500">
              This runs on the server — it keeps going even if the render outlasts the page.
            </p>
          </div>

          <div class="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-1.5 text-sm text-gray-700">
            <div class="flex items-center gap-2">
              <Icon icon="material-symbols:movie" class="text-lg text-orange-500" />
              {{ clipCount }} clip{{ clipCount === 1 ? '' : 's' }}
              <span class="text-gray-400">·</span>
              <span class="font-mono">{{ formatTime(duration) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <Icon icon="material-symbols:music-note" class="text-lg text-orange-500" />
              {{ trackCount === 0 ? 'No music' : `${trackCount} music track${trackCount === 1 ? '' : 's'}` }}
            </div>
          </div>
        </div>

        <div class="p-6 border-t border-gray-200 flex items-center justify-end gap-3">
          <DialogClose as-child>
            <button
              class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              :disabled="exporting"
            >
              Cancel
            </button>
          </DialogClose>
          <button
            class="px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            :disabled="!isValid || exporting"
            @click="submit"
          >
            <Icon v-if="exporting" icon="svg-spinners:180-ring-with-bg" class="text-lg" />
            <Icon v-else icon="material-symbols:download" class="text-lg" />
            <span>{{ exporting ? `Exporting ${Math.round(progress)}%` : 'Export' }}</span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
