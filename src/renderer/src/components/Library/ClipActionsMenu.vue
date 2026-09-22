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
} from 'reka-ui';
import { createClipActionHandlers } from '@renderer/helpers/clipActionHandlers';
import { usePublisher } from '@renderer/composables/clips/usePublisher';
import MoveClipDialog from './MoveClipDialog.vue';
import type { Clip } from '@renderer/types/clip';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import { buttonVariants, menuItemVariants } from '@renderer/components/Base/variants';
import { cn } from '@renderer/components/Base/cn';
import { MENU_CONTENT, MENU_ICON, MENU_SEPARATOR } from '@renderer/components/Base/geometry';

interface Props {
  clip: Clip;
  collectionId?: number;
  /**
   * Trim and the editor are listed here for a tile in the library, which has no
   * room for anything else. The clip page gives them their own buttons, so it
   * turns them off rather than naming the same action twice on one card.
   */
  showEditActions?: boolean;
  /**
   * `tile` is the dark pill that sits over a thumbnail, which needs its own
   * ground to be legible against a picture. `row` is a full width row for a
   * card of buttons, where that pill read as a stray control: it was paired
   * with the words "Publish, move, delete" in grey beside it, so the label and
   * the thing you press were two separate objects and neither looked clickable.
   */
  variant?: 'tile' | 'row';
}

interface Emits {
  (e: 'updated', clip: Clip): void;
  (e: 'deleted'): void;
}

const props = withDefaults(defineProps<Props>(), {
  showEditActions: true,
  variant: 'tile',
});
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
  onCompress,
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
        v-if="variant === 'row'"
        title="Publish, move or delete this clip"
        class="w-full h-11 grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 px-3 rounded-md text-left hover:bg-muted-50 outline-none focus-visible:focus-ring transition-colors duration-150 cursor-pointer"
      >
        <Icon icon="material-symbols:more-horiz" class="size-5 shrink-0 block text-muted-500" />
        <span class="text-sm font-medium text-foreground">Publish, move or delete</span>
        <Icon
          icon="material-symbols:chevron-right-rounded"
          :class="MENU_ICON"
        />
      </MenubarTrigger>

      <MenubarTrigger
        v-else
        title="More actions"
        :class="
          cn(
            buttonVariants({ tone: 'quiet', size: 'sm', iconOnly: true }),
            'transition-[opacity,color,background-color] cursor-pointer',
          )
        "
      >
        <Icon icon="material-symbols:more-vert" class="size-4 shrink-0 block" />
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent
          :class="MENU_CONTENT"
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
              :class="menuItemVariants()"
              @click="onTrim"
            >
              <Icon icon="material-symbols:content-cut" :class="MENU_ICON" />
              <span>Trim to the good bit</span>
            </MenubarItem>
            <MenubarItem
              :class="menuItemVariants()"
              @click="onAdvancedEdit"
            >
              <Icon icon="material-symbols:video-settings" :class="MENU_ICON" />
              <span>Open in the editor</span>
            </MenubarItem>

            <MenubarSeparator :class="MENU_SEPARATOR" />
          </template>

          <!-- Reveal in Explorer -->
          <MenubarItem
            :class="menuItemVariants()"
            @click="onReveal"
          >
            <Icon icon="material-symbols:folder-open" :class="MENU_ICON" />
            <span>Reveal in Explorer</span>
          </MenubarItem>

          <!-- Export Audio -->
          <MenubarItem
            :class="menuItemVariants()"
            :disabled="isExportingAudio"
            @click="onExportAudio"
          >
            <BaseSpinner v-if="isExportingAudio" class="text-base" />
            <Icon v-else icon="material-symbols:audio-file" :class="MENU_ICON" />
            <span>{{ isExportingAudio ? 'Exporting Audio...' : 'Export Audio' }}</span>
          </MenubarItem>

          <!--
            Compress, above Move to Game and below the exports, because it is
            the other thing in this menu that changes the file rather than what
            is written about it. Not beside Delete: it is not destructive in the
            same way, the recording goes to the Recycle Bin and only the picture
            quality is spent.
          -->
          <MenubarItem
            :class="menuItemVariants()"
            @click="onCompress"
          >
            <Icon icon="material-symbols:compress" :class="MENU_ICON" />
            <span>Compress</span>
          </MenubarItem>

          <!-- Move to Game -->
          <MenubarItem
            :class="menuItemVariants()"
            @click="showMoveDialog = true"
          >
            <Icon icon="material-symbols:drive-file-move" :class="MENU_ICON" />
            <span>Move to Game</span>
          </MenubarItem>

          <!-- Copy URL (conditional) -->
          <MenubarItem
            v-if="clip.published && clip.publishedUrl"
            :class="menuItemVariants()"
            @click="onCopyUrl"
          >
            <Icon icon="material-symbols:link" :class="MENU_ICON" />
            <span>Copy URL</span>
          </MenubarItem>

          <MenubarSeparator v-if="collectionId" :class="MENU_SEPARATOR" />

          <!-- Remove from Collection -->
          <MenubarItem
            v-if="collectionId"
            :class="menuItemVariants({ tone: 'accent' })"
            @click="onRemoveFromCollection"
          >
            <Icon icon="material-symbols:folder-delete" :class="MENU_ICON" />
            <span>Remove from Collection</span>
          </MenubarItem>

          <MenubarSeparator :class="MENU_SEPARATOR" />

          <!-- Publish/Unpublish -->
          <MenubarItem
            v-if="clip.published"
            :class="menuItemVariants({ tone: 'danger' })"
            :disabled="isPublishing"
            @click="onUnpublish"
          >
            <Icon icon="material-symbols:cloud-off" :class="MENU_ICON" />
            <span>{{ isPublishing ? 'Unpublishing…' : 'Unpublish' }}</span>
          </MenubarItem>
          <template v-else>
            <MenubarItem
              :class="menuItemVariants()"
              :disabled="isPublishing"
              @click="onPublish"
            >
              <Icon icon="material-symbols:cloud-upload" :class="MENU_ICON" />
              <!--
                Say which one this is.

                The menu held "Publish" and "Publish the original file" with
                nothing to tell them apart, and a walkthrough user pressed both
                and still could not say what differed. `compressesPublished` is
                already known here, so the default can name itself and the
                entry below it is plainly the other choice.
              -->
              <span>
                {{
                  isPublishing
                    ? 'Publishing…'
                    : compressesPublished
                      ? 'Publish a compressed copy'
                      : 'Publish the original file'
                }}
              </span>
            </MenubarItem>
            <!--
              The other choice, whichever way the setting is pointed. Either
              way the file on disk is untouched; only the copy behind the link
              differs. Not offered once a clip is published. The file up there
              is the file.
            -->
            <MenubarItem
              :class="menuItemVariants()"
              :disabled="isPublishing"
              @click="compressesPublished ? onPublishOriginal() : onPublishCompressed()"
            >
              <Icon
                :icon="compressesPublished ? 'material-symbols:hd' : 'material-symbols:compress'"
                :class="MENU_ICON"
              />
              <span>
                {{ compressesPublished ? 'Publish the original file' : 'Publish a compressed copy' }}
              </span>
            </MenubarItem>
          </template>

          <MenubarSeparator :class="MENU_SEPARATOR" />

          <!-- Delete -->
          <MenubarItem
            :class="menuItemVariants({ tone: 'danger' })"
            :disabled="isPublishing"
            @click="onDelete"
          >
            <Icon icon="material-symbols:delete" :class="MENU_ICON" />
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

