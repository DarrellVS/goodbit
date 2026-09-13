<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import {
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarRoot,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from 'radix-vue';
import { createClipActionHandlers } from '../../helpers/clipActionHandlers';
import MoveClipDialog from './MoveClipDialog.vue';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  collectionId?: number;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const router = useRouter();

const isPublishing = ref(false);
const isExportingAudio = ref(false);
const showMoveDialog = ref(false);

const {
  onPublish,
  onUnpublish,
  onCopyUrl,
  onReveal,
  onTrim,
  onDelete,
  onAdvancedEdit,
  onMoveToGame,
  onRemoveFromCollection,
  onExportAudio,
} = createClipActionHandlers({
  clip: computed(() => props.clip),
  isPublishing,
  isExportingAudio,
  emitUpdated: (clip) => emit('updated', clip),
  emitDeleted: () => emit('deleted'),
  router,
  collectionId: props.collectionId,
});

async function handleMoveToGame(targetGame: string) {
  await onMoveToGame(targetGame);
  showMoveDialog.value = false;
}
</script>

<template>
  <MenubarRoot>
    <MenubarMenu>
      <MenubarTrigger
        class="rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition cursor-pointer"
      >
        <Icon icon="material-symbols:more-vert" class="text-card" />
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent
          class="min-w-[200px] bg-card rounded-lg p-1 shadow-lg border border-border outline-none z-50"
          align="end"
          :side-offset="8"
        >
          <!-- Edit Submenu -->
          <MenubarSub>
            <MenubarSubTrigger
              class="flex items-center justify-between px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none data-[state=open]:bg-muted-100"
            >
              <div class="flex items-center gap-2">
                <Icon icon="material-symbols:edit" class="text-base" />
                <span>Edit</span>
              </div>
              <Icon icon="material-symbols:chevron-right" class="text-base text-muted-400" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent
                class="min-w-[180px] bg-card rounded-lg p-1 shadow-lg border border-border outline-none z-50"
              >
                <MenubarItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
                  @click="onTrim"
                >
                  <Icon icon="material-symbols:content-cut" class="text-base" />
                  <span>Trim</span>
                </MenubarItem>
                <MenubarItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
                  @click="onAdvancedEdit"
                >
                  <Icon icon="material-symbols:video-settings" class="text-base" />
                  <span>Advanced Edit</span>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>

          <MenubarSeparator class="h-px bg-muted-200 my-1" />

          <!-- Reveal in Explorer -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
            @click="onReveal"
          >
            <Icon icon="material-symbols:folder-open" class="text-base" />
            <span>Reveal in Explorer</span>
          </MenubarItem>

          <!-- Export Audio -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isExportingAudio }"
            @click="onExportAudio"
          >
            <Icon 
              :icon="isExportingAudio ? 'material-symbols:progress-activity' : 'material-symbols:audio-file'" 
              class="text-base"
              :class="{ 'animate-spin': isExportingAudio }"
            />
            <span>{{ isExportingAudio ? 'Exporting Audio...' : 'Export Audio' }}</span>
          </MenubarItem>

          <!-- Move to Game -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
            @click="showMoveDialog = true"
          >
            <Icon icon="material-symbols:drive-file-move" class="text-base" />
            <span>Move to Game</span>
          </MenubarItem>

          <!-- Copy URL (conditional) -->
          <MenubarItem
            v-if="clip.published && clip.publishedUrl"
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
            @click="onCopyUrl"
          >
            <Icon icon="material-symbols:link" class="text-base" />
            <span>Copy URL</span>
          </MenubarItem>

          <MenubarSeparator v-if="collectionId" class="h-px bg-muted-200 my-1" />

          <!-- Remove from Collection -->
          <MenubarItem
            v-if="collectionId"
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-orange-500/8 text-orange-600 outline-none cursor-pointer select-none"
            @click="onRemoveFromCollection"
          >
            <Icon icon="material-symbols:folder-delete" class="text-base" />
            <span>Remove from Collection</span>
          </MenubarItem>

          <MenubarSeparator class="h-px bg-muted-200 my-1" />

          <!-- Publish/Unpublish -->
          <MenubarItem
            v-if="clip.published"
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-red-500/8 text-red-600 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="onUnpublish"
          >
            <Icon icon="material-symbols:cloud-off" class="text-base" />
            <span>{{ isPublishing ? 'Unpublishing…' : 'Unpublish' }}</span>
          </MenubarItem>
          <MenubarItem
            v-else
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="onPublish"
          >
            <Icon icon="material-symbols:cloud-upload" class="text-base" />
            <span>{{ isPublishing ? 'Publishing…' : 'Publish' }}</span>
          </MenubarItem>

          <MenubarSeparator class="h-px bg-muted-200 my-1" />

          <!-- Delete -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-red-500/8 text-red-600 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="onDelete"
          >
            <Icon icon="material-symbols:delete" class="text-base" />
            <span>Delete</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>
  </MenubarRoot>

  <!-- Move to Game Dialog -->
  <MoveClipDialog
    v-model:open="showMoveDialog"
    :clip="clip"
    @move="handleMoveToGame"
  />
</template>

