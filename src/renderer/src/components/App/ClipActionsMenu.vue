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
  MenubarTrigger,
} from 'radix-vue';
import { createClipActionHandlers } from '../../helpers/clipActionHandlers';
import { usePublisher } from '../../composables/usePublisher';
import MoveClipDialog from './MoveClipDialog.vue';
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  collectionId?: number;
  /**
   * Trim and the editor are listed here for a tile in the library, which has no
   * room for anything else. The clip page gives them their own buttons, so it
   * turns them off rather than naming the same action twice on one card.
   */
  showEditActions?: boolean;
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
}

const props = withDefaults(defineProps<Props>(), { showEditActions: true });
const emit = defineEmits<Emits>();
const router = useRouter();

const isPublishing = ref(false);
const isExportingAudio = ref(false);
const showMoveDialog = ref(false);

// What a plain Publish does, so the two entries can say which is which.
const { compressesPublished } = usePublisher();

const {
  onPublish,
  onPublishCompressed,
  onPublishOriginal,
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
        title="More actions"
        class="rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/30 px-2 py-2 outline-none size-8 hover:bg-black/80 transition cursor-pointer"
      >
        <Icon icon="material-symbols:more-vert" class="text-white" />
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent
          class="min-w-[200px] bg-card rounded-lg p-1 shadow-lg border border-border outline-none z-50"
          align="end"
          :side-offset="8"
        >
          <template v-if="showEditActions">
            <!--
              Trim sits at the top, not behind a submenu.

              It used to be two levels down under "Edit", which opens on hover,
              and no tester found it. Cutting a clip down is the thing this app
              is for, so it is the first item in its own menu.
            -->
            <MenubarItem
              class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
              @click="onTrim"
            >
              <Icon icon="material-symbols:content-cut" class="text-base" />
              <span>Trim to the good bit</span>
            </MenubarItem>
            <MenubarItem
              class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
              @click="onAdvancedEdit"
            >
              <Icon icon="material-symbols:video-settings" class="text-base" />
              <span>Open in the editor</span>
            </MenubarItem>

            <MenubarSeparator class="h-px bg-muted-200 my-1" />
          </template>

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
          <template v-else>
            <MenubarItem
              class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
              :class="{ 'opacity-50 pointer-events-none': isPublishing }"
              @click="onPublish"
            >
              <Icon icon="material-symbols:cloud-upload" class="text-base" />
              <span>{{ isPublishing ? 'Publishing…' : 'Publish' }}</span>
            </MenubarItem>
            <!--
              The other choice, whichever way the setting is pointed. Either
              way the file on disk is untouched; only the copy behind the link
              differs. Not offered once a clip is published. The file up there
              is the file.
            -->
            <MenubarItem
              class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-muted-100 outline-none cursor-pointer select-none"
              :class="{ 'opacity-50 pointer-events-none': isPublishing }"
              @click="compressesPublished ? onPublishOriginal() : onPublishCompressed()"
            >
              <Icon
                :icon="compressesPublished ? 'material-symbols:hd' : 'material-symbols:compress'"
                class="text-base"
              />
              <span>
                {{ compressesPublished ? 'Publish the original file' : 'Publish a compressed copy' }}
              </span>
            </MenubarItem>
          </template>

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

