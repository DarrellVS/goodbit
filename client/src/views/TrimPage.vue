<template>
  <div class="h-full overflow-auto">
    <!-- Hero Header -->
    <div class="relative overflow-hidden border-b border-border/50">
      <div class="relative max-w-7xl mx-auto px-6 py-8">
        <div class="flex items-center justify-between">
          <div class="space-y-2">
            <div class="flex items-center gap-3">
              <div class="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
                <Icon icon="material-symbols:content-cut" class="text-white text-2xl" />
              </div>
              <div>
                <h1 class="text-3xl font-bold bg-gradient-to-b from-orange-500 to-orange-600 bg-clip-text text-transparent">Trim Your Clip</h1>
                <p class="text-sm text-muted-400 mt-1">Select the perfect moment</p>
              </div>
            </div>
          </div>
          <RouterLink class="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium border border-border/50 bg-white/5 hover:bg-white/10 transition-all shadow-sm hover:shadow-md" to="/">
            <Icon icon="material-symbols:arrow-back" />
            <span>Back to Library</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <!-- Video Preview -->
      <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl opacity-20 group-hover:opacity-30 blur transition"></div>
        <div class="relative bg-white/5 backdrop-blur-sm rounded-2xl border border-border/50 overflow-hidden shadow-xl">
          <video ref="videoEl" :src="videoSrc(id)" controls preload="metadata" class="w-full object-contain bg-black m-0 p-0"></video>
          
          <!-- Playback Hint -->
          <div class="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/60 pointer-events-none">
            <div class="flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <Icon icon="material-symbols:keyboard" class="text-sm" />
              <span>Press <kbd class="px-1.5 py-0.5 bg-white/20 rounded text-white/80">Space</kbd> to play/pause</span>
            </div>
            <div class="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              {{ Math.max(0, range[1]-range[0]).toFixed(1) }}s clip
            </div>
          </div>
        </div>
      </div>

      <!-- Timeline Editor -->
      <div class="bg-white/5 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-xl space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-orange-500/10">
              <Icon icon="material-symbols:timeline" class="text-orange-500 text-xl" />
            </div>
            <div>
              <h2 class="font-semibold text-lg">Timeline</h2>
              <p class="text-xs text-muted-400">Drag the handles to trim your clip</p>
            </div>
          </div>
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
              <Icon icon="material-symbols:timer" class="text-orange-500" />
              <span class="text-muted-400">Duration:</span>
              <span class="font-mono font-semibold text-orange-500">{{ duration.toFixed(1) }}s</span>
            </div>
          </div>
        </div>

        <div class="relative h-32 rounded-xl overflow-visible border border-border/50">
          <img :src="withAuthToken(`/api/clips/${id}/frame-strip`)" alt="frames" class="w-full h-full object-cover pointer-events-none select-none rounded-xl" draggable="false" />
          <RangeTrimSlider v-model="range" :max="duration" :step="0.1" :min-steps-between-thumbs="1" />
          <div class="absolute inset-0 pointer-events-none rounded-xl overflow-hidden">
            <div class="absolute inset-y-0 left-0 bg-gradient-to-r from-black/60 to-black/40 backdrop-blur-[2px]" :style="{ width: pct(range[0]) + '%' }"></div>
            <div class="absolute inset-y-0 right-0 bg-gradient-to-l from-black/60 to-black/40 backdrop-blur-[2px]" :style="{ width: (100 - pct(range[1])) + '%' }"></div>
          </div>
        </div>

        <!-- Action Bar -->
        <div class="flex items-center justify-between pt-4 border-t border-border/30">
          <div class="flex items-center gap-6 text-sm">
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-orange-500"></div>
              <span class="text-muted-400">Start:</span>
              <span class="font-mono font-semibold">{{ range[0].toFixed(1) }}s</span>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-2 h-2 rounded-full bg-orange-500"></div>
              <span class="text-muted-400">End:</span>
              <span class="font-mono font-semibold">{{ range[1].toFixed(1) }}s</span>
            </div>
            <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <Icon icon="material-symbols:cut" class="text-orange-500" />
              <span class="text-muted-400">Length:</span>
              <span class="font-mono font-semibold text-orange-500">{{ Math.max(0, range[1]-range[0]).toFixed(1) }}s</span>
            </div>
          </div>
          
          <button 
            class="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]" 
            :disabled="range[1] <= range[0] || saving" 
            @click="doTrim"
          >
            <Icon v-if="!saving" icon="material-symbols:save" class="text-lg" />
            <Icon v-else icon="material-symbols:progress-activity" class="text-lg animate-spin" />
            <span v-if="!saving">Save Trimmed Clip</span>
            <span v-else>Trimming...</span>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import RangeTrimSlider from '../components/RangeTrimSlider.vue';
import { getClipMeta, trimClip } from '../services/clips';
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
  const data = await getClipMeta(Number(props.id));
  duration.value = data.durationSec || 0;
  range.value = [0, Math.max(1, duration.value)];
}

async function doTrim() {
  if (saving.value) return;
  saving.value = true;
  try {
    await trimClip(Number(props.id), range.value[0], range.value[1]);
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


