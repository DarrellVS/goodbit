<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import BasePopover from '../Base/BasePopover.vue';

defineProps<{ 
  search: string; 
  rescanLoading?: boolean; 
  activeFilter?: string;
}>();
defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'rescan'): void;
  (e: 'update:filter', value: string): void;
}>();
</script>

<template>
  <header class="bg-white/5 backdrop-blur-sm border-b border-border/50">
    <div class="px-6 py-4">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold">My Library</h2>
        <div class="flex items-center gap-3">
          <div class="relative">
            <Icon icon="radix-icons:magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-400" />
            <input
              type="text"
              :value="search"
              placeholder="Search your video, recent, tags, idea"
              class="pl-10 pr-4 py-2.5 rounded-lg border border-border/50 bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/50 transition w-96"
              @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
            />
          </div>
          
          <button class="p-2.5 rounded-lg border border-border/50 bg-white/5 hover:bg-white/10 transition">
            <Icon icon="radix-icons:bell" class="text-lg" />
          </button>
          
          <BasePopover side="bottom" :side-offset="10">
            <template #trigger>
              <button class="rounded-lg inline-flex items-center justify-center border border-border/50 bg-white/5 hover:bg-white/10 px-3 py-2 outline-none gap-2">
                <Icon icon="radix-icons:component-1" class="text-lg" />
                <span>Tags</span>
              </button>
            </template>
            <slot name="tags-filter" />
          </BasePopover>

          <button
            class="rounded-lg inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 px-4 py-2.5 outline-none gap-2 text-white font-medium transition"
            :disabled="rescanLoading"
            @click="$emit('rescan')"
          >
            <Icon icon="radix-icons:reload" :class="{ 'animate-spin': rescanLoading }" />
            <span>Rescan</span>
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex items-center gap-6 border-b border-border/30 -mb-px">
        <button
          class="flex items-center gap-2 px-1 py-3 border-b-2 transition-colors font-medium"
          :class="!activeFilter || activeFilter === 'videos' ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-400 hover:text-foreground'"
          @click="$emit('update:filter', 'videos')"
        >
          <Icon icon="radix-icons:video" />
          <span>Videos</span>
        </button>

        <button
          class="flex items-center gap-2 px-1 py-3 border-b-2 transition-colors font-medium"
          :class="activeFilter === 'starred' ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-400 hover:text-foreground'"
          @click="$emit('update:filter', 'starred')"
        >
          <Icon icon="radix-icons:star" />
          <span>Starred</span>
        </button>

        <button
          class="flex items-center gap-2 px-1 py-3 border-b-2 transition-colors font-medium"
          :class="activeFilter === 'published' ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-400 hover:text-foreground'"
          @click="$emit('update:filter', 'published')"
        >
          <Icon icon="radix-icons:check-circled" />
          <span>Published</span>
        </button>

        <button
          class="flex items-center gap-2 px-1 py-3 border-b-2 transition-colors font-medium"
          :class="activeFilter === 'not-published' ? 'border-orange-500 text-orange-500' : 'border-transparent text-muted-400 hover:text-foreground'"
          @click="$emit('update:filter', 'not-published')"
        >
          <Icon icon="radix-icons:cross-circled" />
          <span>Not Published</span>
        </button>
      </div>
    </div>
  </header>
</template>


