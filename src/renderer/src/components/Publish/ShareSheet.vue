<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui';
import QRCode from 'qrcode';
import { useToastStore } from '@renderer/stores/toast';
import { useLocalShare } from '@renderer/composables/clips/useLocalShare';
import { usePublisher } from '@renderer/composables/clips/usePublisher';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';

interface Props {
  open: boolean;
  /** Which clip this sheet is about. */
  clipId: number;
  /** The public address of this clip, or null when it has none. */
  url: string | null;
  title: string;
}

interface Emits {
  (e: 'update:open', value: boolean): void;
  /**
   * `undefined` lets the compress-published setting decide; a boolean
   * overrides it for this one upload.
   */
  (e: 'publish', compressed: boolean | undefined): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const toastStore = useToastStore();
const { isConfigured: publisherConfigured, compressesPublished } = usePublisher();
const {
  state: shareState,
  starting: shareStarting,
  minutesLeft,
  refresh: refreshShare,
  start: startShare,
  stop: stopShare,
} = useLocalShare();

const dataUrl = ref('');
const failed = ref(false);

/** True while this very clip is the one being served on the network. */
const sharingThisClip = computed(() => shareState.value?.clipId === props.clipId);

/**
 * What the code points at.
 *
 * A share running for this clip wins: it is the thing the user just asked for,
 * it streams off the LAN, and it works whether or not the clip was ever
 * published.
 */
const activeUrl = computed(() =>
  sharingThisClip.value ? shareState.value!.url : props.url
);

const isLocal = computed(() => sharingThisClip.value);

/**
 * The QR is drawn to a data URL rather than a canvas element.
 *
 * The dialog mounts its content lazily, so a canvas ref is not reliably there
 * when the URL arrives, an image source always is.
 */
async function render(): Promise<void> {
  const target = activeUrl.value;
  if (!target) {
    dataUrl.value = '';
    return;
  }

  failed.value = false;
  try {
    dataUrl.value = await QRCode.toDataURL(target, {
      width: 480,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    });
  } catch (error) {
    console.error('Failed to draw the QR code:', error);
    failed.value = true;
  }
}

watch(
  () => [props.open, activeUrl.value],
  () => {
    if (props.open) void render();
  },
  { immediate: true }
);

// A share may already be running from an earlier sheet, or from before this
// window was opened.
watch(
  () => props.open,
  (open) => {
    if (open) void refreshShare();
  },
  { immediate: true }
);

async function copy(): Promise<void> {
  if (!activeUrl.value) return;
  try {
    await navigator.clipboard.writeText(activeUrl.value);
    toastStore.success('Link copied');
  } catch {
    toastStore.error('Could not copy the link');
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <!--
        Above the clip layer, which is `z-50`. This sheet is only ever opened
        from inside it, and at the same level the layer wins on document order.
      -->
      <DialogOverlay class="fixed inset-0 bg-black/50 z-60 backdrop-blur-sm modal-overlay-animate" />
      <DialogContent
        class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-60 bg-card rounded-xl shadow-2xl border border-border w-full max-w-sm flex flex-col outline-hidden modal-content-animate"
      >
        <div class="p-6 border-b border-border">
          <DialogTitle class="text-xl font-bold text-foreground mb-1">Share on your wifi</DialogTitle>
          <DialogDescription class="text-sm text-muted-600 truncate">{{ title }}</DialogDescription>
        </div>

        <!--
          Two ways off this machine: the local network, which needs nothing but
          the same wifi, and a published link, which needs a publisher. Media
          served by goodbit:// is not one of them. Nothing but this app can
          open that, and a QR of it made phones say no app could use the code.
        -->
        <div v-if="activeUrl" class="p-6 flex flex-col items-center gap-4">
          <div class="p-3 bg-white rounded-xl border border-border">
            <img v-if="dataUrl" :src="dataUrl" alt="QR code for this clip" class="w-56 h-56 block" />
            <div v-else class="w-56 h-56 flex items-center justify-center text-sm text-muted-400">
              <span v-if="failed">Could not draw the code</span>
              <BaseSpinner v-else class="text-2xl" />
            </div>
          </div>

          <p v-if="isLocal" class="text-xs text-center text-muted-500">
            Point a camera at this from a phone on the same wifi. Nothing leaves the house, and the
            link stops working in {{ minutesLeft }} minutes.
          </p>
          <p v-else class="text-xs text-center text-muted-500">
            This is the public link. Anyone with it can watch.
          </p>

          <div class="w-full flex items-center gap-2">
            <code class="flex-1 text-xs font-mono bg-muted-50 border border-border rounded-lg px-3 py-2 truncate">
              {{ activeUrl }}
            </code>
            <button
              class="px-3 py-2 rounded-lg border border-border text-muted-700 hover:bg-muted-50 transition-colors shrink-0"
              title="Copy the link"
              @click="copy"
            >
              <Icon icon="material-symbols:content-copy" class="text-lg" />
            </button>
          </div>
        </div>

        <div v-else class="p-6 flex flex-col items-center gap-3 text-center">
          <Icon icon="material-symbols:wifi-tethering" class="text-4xl text-orange-400" />
          <p class="text-sm text-muted-600">
            Hand this clip to a phone on the same wifi, without uploading it anywhere.
          </p>
        </div>

        <div class="px-6 pb-6 space-y-2">
          <button
            v-if="!sharingThisClip"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-60"
            :disabled="shareStarting"
            @click="startShare(clipId)"
          >
            <BaseSpinner v-if="shareStarting" class="text-lg" />
            <Icon v-else icon="material-symbols:wifi-tethering" class="text-lg" />
            {{ shareStarting ? 'Starting…' : 'Share on my network' }}
          </button>

          <button
            v-else
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors"
            @click="stopShare()"
          >
            <Icon icon="material-symbols:stop-circle" class="text-lg" />
            Stop sharing
          </button>

          <button
            v-if="!url && publisherConfigured"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors"
            @click="emit('publish', undefined)"
          >
            <Icon icon="material-symbols:cloud-upload" class="text-lg" />
            Publish for a permanent link
          </button>
          <button
            v-if="!url && publisherConfigured"
            class="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors"
            @click="emit('publish', !compressesPublished)"
          >
            <Icon
              :icon="compressesPublished ? 'material-symbols:hd' : 'material-symbols:compress'"
              class="text-lg"
            />
            {{ compressesPublished ? 'Publish the original file' : 'Publish a compressed copy' }}
          </button>
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
