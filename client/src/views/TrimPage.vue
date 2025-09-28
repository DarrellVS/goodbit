<template>
  <div class="h-full p-6 space-y-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-semibold">Trim Clip</h1>
      <RouterLink class="btn" to="/">Back</RouterLink>
    </div>

    <div class="card p-4 space-y-4">
      <div class="relative h-24">
        <img :src="withAuthToken(`/api/clips/${id}/frame-strip`)" alt="frames" class="w-full h-full object-cover rounded-lg pointer-events-none select-none" draggable="false" />
        <RangeTrimSlider v-model="range" :max="duration" :step="0.1" :min-steps-between-thumbs="1" />
        <div class="absolute inset-0 pointer-events-none">
          <div class="absolute inset-y-0 left-0 bg-black/30" :style="{ width: pct(range[0]) + '%' }"></div>
          <div class="absolute inset-y-0 right-0 bg-black/30" :style="{ width: (100 - pct(range[1])) + '%' }"></div>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <div class="text-sm text-muted-500">Start: {{ range[0].toFixed(1) }}s • End: {{ range[1].toFixed(1) }}s • Length: {{ Math.max(0, range[1]-range[0]).toFixed(1) }}s</div>
        <button class="btn btn-primary" :disabled="range[1] <= range[0] || saving" @click="doTrim">
          <span v-if="!saving">Overwrite Clip</span>
          <span v-else>Cropping…</span>
        </button>
      </div>
    </div>

    <div class="card p-4">
      <video ref="videoEl" :src="videoSrc(id)" controls preload="metadata" class="w-full rounded-lg"></video>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import RangeTrimSlider from '../components/RangeTrimSlider.vue';
import axios from '../axios';
import { useAuthStore } from '../stores/auth';
import { withAuthToken } from '../utils/withAuthToken';
import { useClipsStore } from '../stores/clips';

const props = defineProps<{ id: string }>();
const auth = useAuthStore();
const clipsStore = useClipsStore();
const duration = ref(0);
const range = ref<[number, number]>([0, 1]);
const videoEl = ref<HTMLVideoElement | null>(null);
const saving = ref(false);
const router = useRouter();

function pct(s: number) {
  if (!duration.value) return 0;
  return (s / duration.value) * 100;
}

function videoSrc(id: string) {
  return withAuthToken(`/api/clips/${id}/stream`);
}

async function loadMeta() {
  const { data } = await axios.get(`/api/clips/${props.id}/meta`);
  duration.value = data.durationSec || 0;
  range.value = [0, Math.max(1, duration.value)];
}

async function doTrim() {
  if (saving.value) return;
  saving.value = true;
  try {
    await axios.post(`/api/clips/${props.id}/trim`, { startSec: range.value[0], endSec: range.value[1] });
    await clipsStore.fetchClips();
    await router.push('/');
  } finally {
    saving.value = false;
  }
}

function handleTimeUpdate() {
  const v = videoEl.value;
  if (!v) return;
  const [start, end] = range.value;
  if (v.currentTime < start) v.currentTime = start;
  if (v.currentTime >= end - 0.02) {
    v.currentTime = start;
    if (v.paused) v.play().catch(() => {});
  }
}

function handleLoadedMetadata() {
  const v = videoEl.value;
  if (!v) return;
  v.currentTime = range.value[0];
}

watch(range, () => {
  const v = videoEl.value;
  if (!v) return;
  v.currentTime = range.value[0];
});

function handleKeydown(e: KeyboardEvent) {
  // Space toggles play/pause everywhere
  if (e.code === 'Space' || e.key === ' ') {
    const v = videoEl.value;
    if (!v) return;
    e.preventDefault();
    const [start, end] = range.value;
    if (v.paused) {
      if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }
}

onMounted(() => {
  void loadMeta();
  const v = videoEl.value;
  if (!v) return;
  v.addEventListener('timeupdate', handleTimeUpdate);
  v.addEventListener('loadedmetadata', handleLoadedMetadata);
  window.addEventListener('keydown', handleKeydown, { capture: true });
});

onBeforeUnmount(() => {
  const v = videoEl.value;
  if (!v) return;
  v.removeEventListener('timeupdate', handleTimeUpdate);
  v.removeEventListener('loadedmetadata', handleLoadedMetadata);
  window.removeEventListener('keydown', handleKeydown, { capture: true } as any);
});
</script>


