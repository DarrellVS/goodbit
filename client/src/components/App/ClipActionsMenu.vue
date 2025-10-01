<script setup lang="ts">
import { computed } from 'vue';
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
import type { Clip } from '../../types/clip';

interface Props {
  clip: Clip;
  isPublishing: boolean;
}

interface Emits {
  (e: 'trim'): void;
  (e: 'advanced-edit'): void;
  (e: 'reveal'): void;
  (e: 'copy-url'): void;
  (e: 'publish'): void;
  (e: 'unpublish'): void;
  (e: 'delete'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <MenubarRoot>
    <MenubarMenu>
      <MenubarTrigger
        class="rounded-lg inline-flex items-center justify-center bg-black/60 backdrop-blur-sm border border-white/20 px-2 py-2 outline-none size-8 hover:bg-black/80 transition cursor-pointer"
      >
        <Icon icon="material-symbols:more-vert" class="text-white" />
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent
          class="min-w-[200px] bg-white rounded-lg p-1 shadow-lg border border-gray-200 outline-none z-50"
          align="end"
          :side-offset="8"
        >
          <!-- Edit Submenu -->
          <MenubarSub>
            <MenubarSubTrigger
              class="flex items-center justify-between px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none data-[state=open]:bg-gray-100"
            >
              <div class="flex items-center gap-2">
                <Icon icon="material-symbols:edit" class="text-base" />
                <span>Edit</span>
              </div>
              <Icon icon="material-symbols:chevron-right" class="text-base text-gray-400" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent
                class="min-w-[180px] bg-white rounded-lg p-1 shadow-lg border border-gray-200 outline-none z-50"
              >
                <MenubarItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none"
                  @click="emit('trim')"
                >
                  <Icon icon="material-symbols:content-cut" class="text-base" />
                  <span>Trim</span>
                </MenubarItem>
                <MenubarItem
                  class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none"
                  @click="emit('advanced-edit')"
                >
                  <Icon icon="material-symbols:video-settings" class="text-base" />
                  <span>Advanced Edit</span>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>

          <MenubarSeparator class="h-px bg-gray-200 my-1" />

          <!-- Reveal in Explorer -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none"
            @click="emit('reveal')"
          >
            <Icon icon="material-symbols:folder-open" class="text-base" />
            <span>Reveal in Explorer</span>
          </MenubarItem>

          <!-- Copy URL (conditional) -->
          <MenubarItem
            v-if="clip.published && clip.publishedUrl"
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none"
            @click="emit('copy-url')"
          >
            <Icon icon="material-symbols:link" class="text-base" />
            <span>Copy URL</span>
          </MenubarItem>

          <MenubarSeparator class="h-px bg-gray-200 my-1" />

          <!-- Publish/Unpublish -->
          <MenubarItem
            v-if="clip.published"
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-red-50 text-red-600 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="emit('unpublish')"
          >
            <Icon icon="material-symbols:cloud-off" class="text-base" />
            <span>{{ isPublishing ? 'Unpublishing…' : 'Unpublish' }}</span>
          </MenubarItem>
          <MenubarItem
            v-else
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="emit('publish')"
          >
            <Icon icon="material-symbols:cloud-upload" class="text-base" />
            <span>{{ isPublishing ? 'Publishing…' : 'Publish' }}</span>
          </MenubarItem>

          <!-- Delete -->
          <MenubarItem
            class="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-red-50 text-red-600 outline-none cursor-pointer select-none"
            :class="{ 'opacity-50 pointer-events-none': isPublishing }"
            @click="emit('delete')"
          >
            <Icon icon="material-symbols:delete" class="text-base" />
            <span>Delete</span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>
  </MenubarRoot>
</template>

