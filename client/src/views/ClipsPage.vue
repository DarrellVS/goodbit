<script lang="ts" setup>
import { onMounted, computed, ref, watch, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import { videoUrl as videoUrlFor, thumbUrl as thumbUrlFor } from '../utils/mediaUrl';
import axios from '../axios';
import { useClipsStore } from '../stores/clips';
import type { Clip } from '../types/clip';
import { useAuthStore } from '../stores/auth';
import { withAuthToken } from '../utils/withAuthToken';
import { useGamesStore } from '../stores/games';
import AppClipCard from '../components/App/AppClipCard.vue';

const store = useClipsStore();
const gamesStore = useGamesStore();
const auth = useAuthStore();
const clips = computed(() => store.items);
const total = computed(() => store.total);
const page = computed(() => store.page);
const pageSize = computed(() => store.pageSize);
const hoveredId = ref<number | null>(null);

function goto(p: number) {
  store.goto(p);
}

function onCardHovered(isHovered: boolean, clipId: number) {
  hoveredId.value = isHovered ? clipId : null;
}

function onCardUpdated(updated: Clip) {
  const idx = store.items.findIndex(c => c.id === updated.id);
  if (idx >= 0) store.items[idx] = updated;
}

async function onCardDeleted() {
  await store.fetchClips();
  await gamesStore.fetchGames();
}

function fullscreenCard(e: Event, id: number) {
  e.preventDefault();
  const card = document.getElementById(`clip-card-${id}`) as HTMLDivElement;
  card.requestFullscreen();
}

watch(hoveredId, (id) => {
  const v = document.getElementById(`preview-video-${id}`) as HTMLVideoElement;
  const otherVideos = document.querySelectorAll(`video:not(#preview-video-${id})`) as NodeListOf<HTMLVideoElement>;
  otherVideos.forEach(v => {
    v.pause();
    v.currentTime = 0;
  });
  if (v) v.play().catch(() => {});
});


onMounted(() => store.fetchClips());

function videoSrc(clip: Clip) { return videoUrlFor(clip.id, clip.fileModifiedAt); }
function thumbSrc(clip: Clip) { return thumbUrlFor(clip.id, clip.fileModifiedAt); }
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between mb-4">
      <div></div>
      <div class="text-sm text-muted-400">{{ total }} Videos</div>
    </div>

    <section class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      <AppClipCard
        v-for="clip in clips"
        :key="clip.id"
        :clip="clip"
          :poster-url="thumbSrc(clip)"
          :video-url="videoSrc(clip)"
        @isHovered="isHovered => onCardHovered(isHovered, clip.id)"
        @updated="onCardUpdated"
        @deleted="onCardDeleted"
      />
    </section>

    <footer class="flex items-center justify-center gap-3 pt-6" v-if="total > pageSize">
      <button class="px-4 py-2 rounded-lg bg-white/5 border border-border/50 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed" :disabled="page === 1" @click="goto(page - 1)">Prev</button>
      <span class="text-sm text-muted-400">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="px-4 py-2 rounded-lg bg-white/5 border border-border/50 hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed" :disabled="page >= Math.ceil(total / pageSize)" @click="goto(page + 1)">Next</button>
    </footer>
  </div>
</template>




