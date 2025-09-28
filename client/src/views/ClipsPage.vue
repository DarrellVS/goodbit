<script lang="ts" setup>
import { onMounted, computed, ref, watch, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
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

function videoSrc(id: number) {
  return withAuthToken(`/api/clips/${id}/stream`);
}

function thumbSrc(id: number) {
  return withAuthToken(`/api/clips/${id}/thumbnail`);
}
</script>

<template>
  <div class="p-6 space-y-6">
      <section class="h-[calc(100vh-120px)] grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-6 pr-2 h-fit mx-auto">
        <AppClipCard
          v-for="clip in clips"
          :key="clip.id"
          :clip="clip"
          :poster-url="thumbSrc(clip.id)"
          :video-url="videoSrc(clip.id)"
          @isHovered="isHovered => onCardHovered(isHovered, clip.id)"
          @updated="onCardUpdated"
          @deleted="onCardDeleted"
        />
      </section>

    <footer class="flex items-center justify-center gap-3" v-if="total > pageSize">
      <button class="btn" :disabled="page === 1" @click="goto(page - 1)">Prev</button>
      <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="btn" :disabled="page >= Math.ceil(total / pageSize)" @click="goto(page + 1)">Next</button>
    </footer>
  </div>
</template>




