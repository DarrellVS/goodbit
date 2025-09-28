<template>
  <div class="p-6 space-y-6">
      <section class="h-[calc(100vh-120px)] grid grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-6 pr-2 h-fit mx-auto">
        <article v-for="clip in clips" :key="clip.id" class="card clip-card" @mouseenter="hoveredId = clip.id" @mouseleave="hoveredId = null">
          <div class="aspect-[21/9] bg-black clip-thumb">
            <video :src="`/api/clips/${clip.id}/stream`" :id="`preview-video-${clip.id}`" class="w-full h-full m-0 p-0 object-cover" preload="none" controls :poster="`/api/clips/${clip.id}/thumbnail`" @fullscreenchange="fullscreenCard($event, clip.id)"></video>
        </div>
        <div class="p-4 space-y-3">
          <input
            class="input"
            :value="clip.displayName ?? ''"
            :placeholder="clip.filename"
            @change="e => updateName(clip, (e.target as HTMLInputElement).value)"
          />
          <div class="text-sm text-muted-500 flex gap-4">
            <span>{{ clip.game }}</span>
            <span>{{ formatSize(clip.sizeBytes) }}</span>
            <span>{{ new Date(clip.fileModifiedAt).toLocaleString() }}</span>
          </div>
          <div class="flex justify-between gap-2">
            <div class="flex gap-2">
              <RouterLink class="btn" :to="`/trim/${clip.id}`">Trim</RouterLink>
              <button class="btn" @click="open(clip)">Reveal in Explorer</button>
            </div>
            <button class="btn btn-danger" @click="remove(clip)">Delete</button>
          </div>
        </div>
      </article>
    </section>

    <footer class="flex items-center justify-center gap-3" v-if="total > pageSize">
      <button class="btn" :disabled="page === 1" @click="goto(page - 1)">Prev</button>
      <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button class="btn" :disabled="page >= Math.ceil(total / pageSize)" @click="goto(page + 1)">Next</button>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, computed, ref, watch, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import axios from 'axios';
import { useClipsStore, type Clip } from '../stores/clips';

const store = useClipsStore();
const clips = computed(() => store.items);
const total = computed(() => store.total);
const page = computed(() => store.page);
const pageSize = computed(() => store.pageSize);
const hoveredId = ref<number | null>(null);

function goto(p: number) {
  store.goto(p);
}

function formatSize(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)} ${units[i]}`;
}

async function updateName(clip: Clip, name: string) {
  const { data } = await axios.patch<Clip>(`/api/clips/${clip.id}`, { displayName: name || null });
  const idx = store.items.findIndex(c => c.id === clip.id);
  if (idx >= 0) store.items[idx] = data;
}

async function remove(clip: Clip) {
  if (!confirm(`Move to Recycle Bin and remove from list?\n${clip.filename}`)) return;
  await axios.delete(`/api/clips/${clip.id}`);
  await store.fetchClips();
}

async function open(clip: Clip) {
  await axios.post(`/api/clips/${clip.id}/open`);
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
</script>


