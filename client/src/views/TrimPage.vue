<template>
  <div class="h-full overflow-auto">
    <TrimHeader />
    
    <main class="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <VideoPreview
        ref="videoPreviewRef"
        :video-source="videoSource"
      />
      
      <TimelineEditor
        v-model="range"
        :max-duration="duration"
        :duration="formatTime(duration)"
        :start-time="formatTime(range[0])"
        :end-time="formatTime(range[1])"
        :length="formatTime(trimmedLength)"
        :start-percentage="timeToPercentage(range[0])"
        :end-percentage="timeToPercentage(range[1])"
        :frame-strip-source="frameStripSource"
        :is-valid="isValidRange"
        :is-saving="isSaving"
        @save="handleSave"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useClipsStore } from '../stores/clips';
import { getClipMeta, trimClip } from '../services/clips';
import { withAuthToken } from '../utils/withAuthToken';
import { useTrimRange } from '../composables/useTrimRange';
import { useVideoPlayer } from '../composables/useVideoPlayer';
import TrimHeader from '../components/Trim/TrimHeader.vue';
import VideoPreview from '../components/Trim/VideoPreview.vue';
import TimelineEditor from '../components/Trim/TimelineEditor.vue';

interface Props {
  id: string;
}

const props = defineProps<Props>();

const router = useRouter();
const clipsStore = useClipsStore();

const {
  duration,
  range,
  trimmedLength,
  isValidRange,
  timeToPercentage,
  initializeRange,
  formatTime,
} = useTrimRange();

const videoPreviewRef = ref<InstanceType<typeof VideoPreview> | null>(null);
const isSaving = ref(false);

const videoSource = computed(() => 
  withAuthToken(`/api/clips/${props.id}/stream`)
);

const frameStripSource = computed(() => 
  withAuthToken(`/api/clips/${props.id}/frame-strip`)
);

const videoElement = computed(() => 
  videoPreviewRef.value?.videoElement ?? null
);

useVideoPlayer({
  videoElement,
  range,
});

async function loadClipMetadata(): Promise<void> {
  try {
    const metadata = await getClipMeta(Number(props.id));
    initializeRange(metadata.durationSec || 0);
  } catch (error) {
    console.error('Failed to load clip metadata:', error);
  }
}

async function handleSave(): Promise<void> {
  if (isSaving.value || !isValidRange.value) return;
  
  isSaving.value = true;
  
  try {
    const [startTime, endTime] = range.value;
    await trimClip(Number(props.id), startTime, endTime);
    clipsStore.resetPagination();
    await clipsStore.fetchClips(false);
    await router.push('/');
  } catch (error) {
    console.error('Failed to trim clip:', error);
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => {
  void loadClipMetadata();
});
</script>
