<script lang="ts" setup>
import BaseCard from '../Base/BaseCard.vue';
import BaseButton from '../Base/BaseButton.vue';
import { RouterLink } from 'vue-router';
import type { Clip } from '../../types/clip';
import { useFormat } from '../../composables/useFormat';
import { updateClipName, deleteClip, openClip } from '../../services/clips';
import { publishClip, unpublishClip } from '../../services/clips';
import { ref } from 'vue';

const props = defineProps<{ clip: Clip; posterUrl: string; videoUrl: string }>();
const emit = defineEmits<{ 
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void 
  (e: 'isHovered', isHovered: boolean): void
}>();
const { formatBytes } = useFormat();
const isPublishing = ref(false);
const lastPublishedUrl = ref<string | null>(null);

async function updateName(e: Event) {
  const input = e.target as HTMLInputElement;
  const updated = await updateClipName(props.clip.id, input.value || null);
  emit('updated', updated);
}

async function remove() {
  if (!confirm(`Move to Recycle Bin and remove from list?\n${props.clip.filename}`)) return;
  await deleteClip(props.clip.id);
  emit('deleted');
}

async function open() {
  await openClip(props.clip.id);
}

async function publish() {
  if (isPublishing.value) return;
  isPublishing.value = true;
  try {
    const updated = await publishClip(props.clip.id);
    emit('updated', updated);
    if (updated.publishedUrl) {
      lastPublishedUrl.value = updated.publishedUrl;
      await navigator.clipboard.writeText(updated.publishedUrl).catch(() => {});
    }
  } finally {
    isPublishing.value = false;
  }
}

async function unpublish() {
  if (isPublishing.value) return;
  isPublishing.value = true;
  try {
    const updated = await unpublishClip(props.clip.id);
    emit('updated', updated);
    lastPublishedUrl.value = null;
  } finally {
    isPublishing.value = false;
  }
}

async function copyUrl() {
  const url = props.clip.publishedUrl;
  if (!url) return;
  await navigator.clipboard.writeText(url).catch(() => {});
}

function onMouseEnter() {
  emit('isHovered', true);
}

function onMouseLeave() {
  emit('isHovered', false);
}
</script>

<template>
  <BaseCard class="clip-card" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <div class="aspect-[21/9] bg-black clip-thumb">
      <video :src="videoUrl" :id="`preview-video-${clip.id}`" class="w-full h-full m-0 p-0 object-cover" preload="none" controls :poster="posterUrl"></video>
    </div>
    <div class="p-4 space-y-3">
      <input class="w-full rounded-xl border border-border bg-white/70 dark:bg-white/10 px-3 py-2 outline-none" :value="clip.displayName ?? ''" :placeholder="clip.filename" @change="updateName" />
      <div class="text-sm text-muted-500 flex gap-4">
        <span>{{ clip.game }}</span>
        <span>{{ formatBytes(clip.sizeBytes) }}</span>
        <span>{{ new Date(clip.fileModifiedAt).toLocaleString() }}</span>
      </div>
      <div class="flex justify-between gap-2">
        <div class="flex gap-2 flex-wrap">
          <RouterLink class="btn" :to="`/trim/${clip.id}`">Trim</RouterLink>
          <BaseButton @click="open">Reveal in Explorer</BaseButton>
          <BaseButton v-if="!clip.published" :disabled="isPublishing" @click="publish">
            <span v-if="isPublishing">Publishing…</span>
            <span v-else>Publish</span>
          </BaseButton>
          <BaseButton v-else variant="danger" :disabled="isPublishing" @click="unpublish">
            <span v-if="isPublishing">Unpublishing…</span>
            <span v-else>Unpublish</span>
          </BaseButton>
          <BaseButton v-if="clip.published && clip.publishedUrl" variant="outline" @click="copyUrl">
            Copy URL
          </BaseButton>
        </div>
        <BaseButton variant="danger" class="h-fit" @click="remove">Delete</BaseButton>
      </div>
    </div>
  </BaseCard>
</template>


