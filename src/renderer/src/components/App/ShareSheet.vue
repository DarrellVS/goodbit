<script setup lang="ts">
import { ref, watch } from 'vue';
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
import QRCode from 'qrcode';
import { useToastStore } from '../../stores/toast';

interface Props {
  open: boolean;
  /** The address to hand over. */
  url: string;
  title: string;
  /** True when the link is the public one rather than a LAN address. */
  isPublic: boolean;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const toastStore = useToastStore();
const dataUrl = ref('');
const failed = ref(false);

/**
 * The QR is drawn to a data URL rather than a canvas element.
 *
 * The dialog mounts its content lazily, so a canvas ref is not reliably there
 * when the URL arrives — an image source always is.
 */
async function render(): Promise<void> {
  if (!props.url) return;
  failed.value = false;
  try {
    dataUrl.value = await QRCode.toDataURL(props.url, {
      width: 480,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    });
  } catch (error) {
    console.error('Failed to draw the QR code:', error);
    failed.value = true;
  }
}

watch(() => [props.open, props.url], () => { if (props.open) void render(); }, { immediate: true });

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.url);
    toastStore.success('Link copied');
  } catch {
    toastStore.error('Could not copy the link');
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card rounded-xl shadow-2xl border border-border w-full max-w-sm flex flex-col outline-none modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">Send to my phone</DialogTitle>
          <DialogDescription class="text-sm text-muted-600 truncate">{{ title }}</DialogDescription>
        </div>

        <div class="p-6 flex flex-col items-center gap-4">
          <div class="p-3 bg-card rounded-xl border border-border">
            <img
              v-if="dataUrl"
              :src="dataUrl"
              alt="QR code for this clip"
              class="w-56 h-56 block"
            />
            <div v-else class="w-56 h-56 flex items-center justify-center text-sm text-muted-400">
              <span v-if="failed">Could not draw the code</span>
              <Icon v-else icon="svg-spinners:180-ring-with-bg" class="text-2xl" />
            </div>
          </div>

          <p class="text-xs text-center text-muted-500">
            <template v-if="isPublic">
              This is the public link — anyone with it can watch.
            </template>
            <template v-else>
              This address only works on your own network, and the phone has to be on your Wi-Fi.
            </template>
          </p>

          <div class="w-full flex items-center gap-2">
            <code class="flex-1 text-xs font-mono bg-muted-50 border border-border rounded-lg px-3 py-2 truncate">
              {{ url }}
            </code>
            <button
              class="px-3 py-2 rounded-lg border border-border text-muted-700 hover:bg-muted-50 transition-colors flex-shrink-0"
              title="Copy the link"
              @click="copy"
            >
              <Icon icon="material-symbols:content-copy" class="text-lg" />
            </button>
          </div>
        </div>

        <div class="p-6 border-t border-border flex justify-end">
          <DialogClose as-child>
            <button class="px-4 py-2 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors">
              Done
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
