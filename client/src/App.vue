<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-top">
        <h2>Games</h2>
        <button @click="rescan" :disabled="loading">Rescan</button>
      </div>
      <div class="search">
        <input v-model="searchText" placeholder="Search name or filename" @input="onSearch" />
      </div>
      <ul class="games">
        <li :class="{ active: selectedGame === '' }" @click="selectGame('')">All</li>
        <li v-for="g in games" :key="g.game"
            :class="{ active: selectedGame === g.game }"
            @click="selectGame(g.game)">
          <span>{{ g.game || 'Unknown' }}</span>
          <span class="count">{{ g.count }}</span>
        </li>
      </ul>
    </aside>
    <main class="content">
      <header class="toolbar">
        <h1>Clips</h1>
        <span v-if="loading">Loading…</span>
      </header>
      <section class="grid">
        <article v-for="clip in clips" :key="clip.id" class="card">
          <video :src="`/api/clips/${clip.id}/stream`" controls preload="metadata"></video>
          <div class="meta">
            <div class="title">
              <input
                :value="clip.displayName ?? ''"
                :placeholder="clip.filename"
                @change="e => updateName(clip, (e.target as HTMLInputElement).value)"
              />
            </div>
            <div class="sub">
              <span>{{ clip.game }}</span>
              <span>{{ formatSize(clip.sizeBytes) }}</span>
              <span>{{ new Date(clip.fileModifiedAt).toLocaleString() }}</span>
            </div>
          </div>
          <div class="actions">
            <button class="danger" @click="remove(clip)">Delete</button>
          </div>
        </article>
      </section>
      <footer class="pager" v-if="total > pageSize">
        <button :disabled="page === 1" @click="goto(page - 1)">Prev</button>
        <span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
        <button :disabled="page >= Math.ceil(total / pageSize)" @click="goto(page + 1)">Next</button>
      </footer>
    </main>
  </div>
  
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue';
import axios from 'axios';

type GameRow = { game: string; count: number };
type Clip = {
  id: number;
  filePath: string;
  relPath: string;
  game: string;
  filename: string;
  displayName: string | null;
  extension: string;
  sizeBytes: number;
  fileModifiedAt: string;
};

const games = ref<GameRow[]>([]);
const clips = ref<Clip[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 50;
const selectedGame = ref('');
const searchText = ref('');
const loading = ref(false);

async function fetchGames() {
  const { data } = await axios.get<GameRow[]>('/api/games');
  games.value = data;
}

async function fetchClips() {
  loading.value = true;
  try {
    const params: Record<string, string | number> = { page: page.value, pageSize };
    if (selectedGame.value) params.game = selectedGame.value;
    if (searchText.value) params.q = searchText.value;
    const { data } = await axios.get<{ items: Clip[]; total: number; page: number; pageSize: number }>(
      '/api/clips',
      { params }
    );
    clips.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

function selectGame(g: string) {
  selectedGame.value = g;
  page.value = 1;
  fetchClips();
}

function onSearch() {
  page.value = 1;
  fetchClips();
}

async function rescan() {
  loading.value = true;
  try {
    await axios.post('/api/scan');
    await Promise.all([fetchGames(), fetchClips()]);
  } finally {
    loading.value = false;
  }
}

async function updateName(clip: Clip, name: string) {
  const { data } = await axios.patch<Clip>(`/api/clips/${clip.id}`, { displayName: name || null });
  const idx = clips.value.findIndex(c => c.id === clip.id);
  if (idx >= 0) clips.value[idx] = data;
}

async function remove(clip: Clip) {
  if (!confirm(`Move to Recycle Bin and remove from list?\n${clip.filename}`)) return;
  await axios.delete(`/api/clips/${clip.id}`);
  await Promise.all([fetchGames(), fetchClips()]);
}

function goto(p: number) {
  page.value = p;
  fetchClips();
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

onMounted(async () => {
  await fetchGames();
  await fetchClips();
});
</script>

<style scoped>
.layout { display: grid; grid-template-columns: 280px 1fr; height: 100vh; }
.sidebar { border-right: 1px solid #ddd; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.sidebar-top { display: flex; align-items: center; justify-content: space-between; }
.search input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; }
.games { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.games li { display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.games li.active { background: #eef6ff; }
.content { display: flex; flex-direction: column; height: 100vh; }
.toolbar { display: flex; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #ddd; }
.grid { padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; overflow: auto; }
.card { border: 1px solid #eee; border-radius: 8px; background: #fff; display: flex; flex-direction: column; }
.card video { width: 100%; height: 180px; object-fit: cover; background: #000; border-bottom: 1px solid #eee; }
.meta { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.meta .title input { width: 100%; font-weight: 600; border: none; outline: none; border-bottom: 1px dashed #ccc; padding: 4px; }
.meta .sub { display: flex; gap: 12px; color: #666; font-size: 12px; }
.actions { display: flex; justify-content: flex-end; padding: 8px; }
.actions .danger { background: #e53935; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
.pager { display: flex; align-items: center; gap: 12px; padding: 12px; border-top: 1px solid #ddd; }
</style>


