<template>
  <div class="p-6 space-y-6">
      <section class="h-[calc(100vh-120px)] grid grid-cols-3 gap-6 pr-2">
        <article v-for="clip in clips" :key="clip.id" class="card clip-card" @mouseenter="hoveredId = clip.id" @mouseleave="hoveredId = null">
          <div class="aspect-[21/9] bg-black clip-thumb">
            <video v-if="hoveredId === clip.id" :src="`/api/clips/${clip.id}/stream`" controls preload="none" autoplay class="w-full h-full"></video>
            <img v-else :src="`/api/clips/${clip.id}/thumbnail`" alt="thumbnail" class="w-full h-full" />
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
            <div class="flex justify-end gap-2">
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
import { onMounted, computed, ref } from 'vue';
import axios from 'axios';
import { useClipsStore, type Clip } from '../stores/clips';

const store = useClipsStore();
const clips = computed(() => store.items);
const total = computed(() => store.total);
const page = computed(() => store.page);
const pageSize = computed(() => store.pageSize);
const hoveredId = ref<number | null>(11);

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

onMounted(() => store.fetchClips());
</script>


