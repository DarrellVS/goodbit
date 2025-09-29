<script lang="ts" setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue';
import emblaCarouselVue from 'embla-carousel-vue';
import { EditableArea, EditableInput, EditablePreview, EditableRoot } from 'radix-vue';
import { useClipsStore } from '../stores/clips';
import { updateClipName, deleteClip } from '../services/clips';
import { withAuthToken } from '../utils/withAuthToken';
import { Icon } from '@iconify/vue';

const store = useClipsStore();
const [emblaRef, emblaApi] = emblaCarouselVue({ loop: true, duration: 24 }, []);
const todayClips = computed(() => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return store.items.filter(c => new Date(c.fileModifiedAt) >= start);
});

function thumbSrc(id: number) { return withAuthToken(`/api/clips/${id}/thumbnail`); }
function videoSrc(id: number) { return withAuthToken(`/api/clips/${id}/stream`); }

const selectedIndex = ref(0);
const canPrev = ref(false);
const canNext = ref(false);
function onSelect() {
  const api = emblaApi.value;
  if (!api) return;
  const count = typeof api.slideNodes === 'function' ? api.slideNodes().length : 0;
  if (count === 0) {
    selectedIndex.value = 0;
    canPrev.value = false;
    canNext.value = false;
    return;
  }
  selectedIndex.value = api.selectedScrollSnap();
  canPrev.value = api.canScrollPrev();
  canNext.value = api.canScrollNext();
}

function prev() { emblaApi.value?.scrollPrev(); }
function next() { emblaApi.value?.scrollNext(); }
function goTo(index: number) { emblaApi.value?.scrollTo(index); }

watch(emblaApi, (api) => {
  if (api) {
    api.on('select', onSelect);
    api.on('reInit', onSelect);
    onSelect();
  }
});

watch(todayClips, async () => {
  const api = emblaApi.value;
  if (!api) return;
  await nextTick();
  api.reInit();
  onSelect();
});

async function onRename(clipId: number, name: string) {
  const updated = await updateClipName(clipId, name || null);
  const idx = store.items.findIndex(c => c.id === updated.id);
  if (idx >= 0) store.items[idx] = updated;
}

async function onDelete(clipId: number) {
  if (!confirm('Delete this clip?')) return;
  await deleteClip(clipId);
  await store.fetchClips();
}

onMounted(() => store.fetchClips());
</script>

<template>
  <div class="p-6 space-y-6 max-w-7xl mx-auto mt-12">
    <div class="embla relative group">
        <div class="embla__viewport" ref="emblaRef">
          <div class="embla__container">
              <div class="embla__slide" v-for="(clip, idx) in todayClips" :key="clip.id" :class="{ 'is-active': selectedIndex === idx }">
                <div class="relative rounded-2xl overflow-hidden shadow-xl">
                  <video :src="videoSrc(clip.id)" class="w-full aspect-[21/9] object-cover" controls :poster="thumbSrc(clip.id)"></video>
                </div>
                <div class="mt-3 px-1 flex items-center justify-between">
                  <EditableRoot :default-value="clip.displayName || clip.filename" @update:model-value="(v: string) => onRename(clip.id, v)">
                    <EditableArea class="text-lg font-semibold text-gray-900">
                      <EditablePreview />
                      <EditableInput class="bg-transparent outline-none border-b border-border" />
                    </EditableArea>
                  </EditableRoot>
                  <button class="text-red-500 hover:text-red-400" @click="onDelete(clip.id)">Delete</button>
                </div>
              </div>
          </div>
        </div>
        <button
          class="absolute -left-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full w-11 h-11 flex items-center justify-center bg-neutral-800/70 backdrop-blur border border-white/10 shadow-md hover:shadow-lg hover:bg-neutral-700/80"
          :class="{ 'opacity-40 cursor-not-allowed': !canPrev }"
          :disabled="!canPrev"
          aria-label="Previous"
          @click="prev"
          v-if="todayClips.length > 0"
        >
          <Icon icon="radix-icons:chevron-left" class="text-neutral-200 text-xl" />
        </button>
        <button
          class="absolute -right-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-full w-11 h-11 flex items-center justify-center bg-neutral-800/70 backdrop-blur border border-white/10 shadow-md hover:shadow-lg hover:bg-neutral-700/80"
          :class="{ 'opacity-40 cursor-not-allowed': !canNext }"
          :disabled="!canNext"
          aria-label="Next"
          @click="next"
          v-if="todayClips.length > 0"
        >
          <Icon icon="radix-icons:chevron-right" class="text-neutral-200 text-xl" />
        </button>
      </div>

      <div class="mt-6 flex flex-wrap justify-center gap-4">
        <div v-for="(clip, idx) in todayClips" :key="'thumb-'+clip.id" class="group transition-all cursor-pointer w-40" @click="goTo(idx)" :aria-current="selectedIndex === idx ? 'true' : 'false'" :class="{ 'scale-105': selectedIndex === idx }">
          <div class="rounded-xl overflow-hidden transition-all" :class="{ 'shadow-[0_8px_8px_rgba(0,0,0,0.2)]': selectedIndex === idx }">
            <img :src="thumbSrc(clip.id)" class="w-full h-24 object-cover" />
          </div>
          <div class="text-sm mt-2 text-muted-300 text-center">
            {{ clip.game }}
          </div>
        </div>
      </div>
    <div v-if="todayClips.length === 0" class="py-24 flex flex-col items-center justify-center text-center gap-4 opacity-80">
      <div class="rounded-full w-20 h-20 flex items-center justify-center bg-muted-800 border border-border">
        <Icon icon="radix-icons:video" class="text-3xl text-muted-300" />
      </div>
      <h2 class="text-2xl font-semibold text-gray-900">No clips from today</h2>
    </div>
  </div>
</template>

<style scoped>
.embla__viewport { overflow: hidden; }
.embla__container { display: flex; gap: 24px; }
.embla__slide { flex: 0 0 100%; min-width: 0; }
.embla__slide > div { transform: translateZ(0); transition: transform 1000ms cubic-bezier(.22,1,.36,1); }
.embla__slide.is-active > div { transform: scale(1); }
.embla__slide:not(.is-active) > div { transform: scale(.75); }
</style>


