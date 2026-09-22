<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui';
import type { Clip } from '@renderer/types/clip';
import { menuItemVariants } from '@renderer/components/Base/variants';
import { MENU_CONTENT, MENU_ICON, MENU_SEPARATOR } from '@renderer/components/Base/geometry';

interface Props {
  selectedCount: number;
  selectedClips: Clip[];
  collectionId?: number;
}

interface Emits {
  (e: 'deselect-all'): void;
  (e: 'delete'): void;
  (e: 'add-to-collection'): void;
  (e: 'remove-from-collection'): void;
  (e: 'publish'): void;
  (e: 'unpublish'): void;
  (e: 'star'): void;
  (e: 'unstar'): void;
  (e: 'add-tags'): void;
  (e: 'open-in-editor'): void;
  (e: 'compress'): void;
  (e: 'compress-published'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const anyPublished = computed(() => props.selectedClips.some((clip) => clip.published));

const allPublished = computed(() => 
  props.selectedClips.every(clip => clip.published)
);

const allStarred = computed(() => 
  props.selectedClips.every(clip => clip.starred)
);

const somePublished = computed(() => 
  props.selectedClips.some(clip => clip.published)
);

const someStarred = computed(() => 
  props.selectedClips.some(clip => clip.starred)
);
</script>

<template>
  <div
    class="bg-card rounded-md shadow-pop border border-border px-4 py-3 flex items-center gap-4 min-w-[500px]"
  >
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-lg bg-accent flex items-center justify-center font-bold text-sm text-accent-fg count-animate">
        {{ selectedCount }}
      </div>
      <span class="font-medium text-foreground">
        {{ selectedCount === 1 ? 'clip selected' : `clips selected` }}
      </span>
    </div>

    <div class="flex-1 flex items-center justify-end gap-2">
      <!-- Star/Unstar -->
      <button
        v-if="!allStarred"
        class="px-3 py-1.5 rounded-lg hover:bg-muted-100 transition-colors flex items-center gap-2 text-sm font-medium text-muted-700 scale-on-hover"
        @click="emit('star')"
        title="Star selected clips"
      >
        <Icon icon="material-symbols:star" class="text-base transform-transition" />
        <span>Star</span>
      </button>
      <button
        v-else
        class="px-3 py-1.5 rounded-lg hover:bg-muted-100 transition-colors flex items-center gap-2 text-sm font-medium text-muted-700 scale-on-hover"
        @click="emit('unstar')"
        title="Unstar selected clips"
      >
        <Icon icon="material-symbols:star-outline" class="text-base transform-transition" />
        <span>Unstar</span>
      </button>

      <!-- Add Tags -->
      <button
        class="px-3 py-1.5 rounded-lg hover:bg-muted-100 transition-colors flex items-center gap-2 text-sm font-medium text-muted-700 scale-on-hover"
        @click="emit('add-tags')"
        title="Add tags to selected clips"
      >
        <Icon icon="material-symbols:label" class="text-base transform-transition" />
        <span>Tag</span>
      </button>

      <!-- More Actions Dropdown -->
      <DropdownMenuRoot>
        <DropdownMenuTrigger
          class="px-3 py-1.5 rounded-lg hover:bg-muted-100 transition-colors flex items-center gap-2 text-sm font-medium outline-hidden text-muted-700 scale-on-hover"
        >
          <Icon icon="material-symbols:more-horiz" class="text-base transform-transition" />
          <span>More</span>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent
            :class="MENU_CONTENT"
            :side-offset="8"
          >
            <!-- Open in Advanced Editor -->
            <DropdownMenuItem
              :class="menuItemVariants()"
              @click="emit('open-in-editor')"
            >
              <Icon icon="material-symbols:movie-edit" :class="MENU_ICON" />
              <span>Open in the editor</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator :class="MENU_SEPARATOR" />

            <!-- Publish/Unpublish -->
            <DropdownMenuItem
              v-if="!allPublished"
              :class="menuItemVariants()"
              @click="emit('publish')"
            >
              <Icon icon="material-symbols:cloud-upload" :class="MENU_ICON" />
              <span>Publish</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="somePublished"
              :class="menuItemVariants({ tone: 'danger' })"
              @click="emit('unpublish')"
            >
              <Icon icon="material-symbols:cloud-off" :class="MENU_ICON" />
              <span>Unpublish</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator :class="MENU_SEPARATOR" />

            <!-- Add to Collection -->
            <DropdownMenuItem
              :class="menuItemVariants()"
              @click="emit('add-to-collection')"
            >
              <Icon icon="material-symbols:create-new-folder" :class="MENU_ICON" />
              <span>Add to Collection</span>
            </DropdownMenuItem>

            <!-- Remove from Collection (if in collection view) -->
            <DropdownMenuItem
              v-if="collectionId"
              :class="menuItemVariants({ tone: 'accent' })"
              @click="emit('remove-from-collection')"
            >
              <Icon icon="material-symbols:folder-delete" :class="MENU_ICON" />
              <span>Remove from Collection</span>
            </DropdownMenuItem>

            <!--
              Only when something is selected that has a public copy to shrink.
              Offered on a selection of unpublished clips it would be a row
              that can only answer "none of these is published".
            -->
            <DropdownMenuItem
              v-if="anyPublished"
              :class="menuItemVariants()"
              @click="emit('compress-published')"
            >
              <Icon icon="material-symbols:cloud-sync" :class="MENU_ICON" />
              <span>Shrink published copies</span>
            </DropdownMenuItem>

            <!--
              Compress, above the separator rather than below it beside Delete.
              It changes the file, which nothing else in this group does, but
              the recording survives in the Recycle Bin and only the picture
              quality is spent, so it is not the same kind of act as deleting.
            -->
            <DropdownMenuItem
              :class="menuItemVariants()"
              @click="emit('compress')"
            >
              <Icon icon="material-symbols:compress" :class="MENU_ICON" />
              <span>Compress</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator :class="MENU_SEPARATOR" />

            <!-- Delete -->
            <DropdownMenuItem
              :class="menuItemVariants({ tone: 'danger' })"
              @click="emit('delete')"
            >
              <Icon icon="material-symbols:delete" :class="MENU_ICON" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenuRoot>

      <div class="w-px h-6 bg-muted-300"></div>

      <!-- Clear Selection -->
      <button
        class="px-3 py-1.5 rounded-lg hover:bg-muted-100 transition-colors flex items-center gap-2 text-sm font-medium text-muted-700 scale-on-hover"
        @click="emit('deselect-all')"
        title="Clear selection"
      >
        <Icon icon="material-symbols:close" class="text-base transform-transition" />
        <span>Clear</span>
      </button>
    </div>
  </div>
</template>

