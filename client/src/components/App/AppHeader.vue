<script lang="ts" setup>
import { Icon } from '@iconify/vue';
import BasePopover from '../Base/BasePopover.vue';

defineProps<{ 
  search: string; 
  rescanLoading?: boolean;
  title?: string;
  subtitle?: string;
}>();
defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'rescan'): void;
}>();
</script>

<template>
  <header class="bg-white/5 backdrop-blur-sm">
    <div class="px-6 py-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold">{{ title || 'My Library' }}</h2>
          <p 
            v-if="subtitle" 
            class="text-sm mt-1 text-muted-500"
          >
            {{ subtitle }}
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div class="relative">
            <Icon icon="material-symbols:search" class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-400" />
            <input
              id="global-search-input"
              type="text"
              :value="search"
              placeholder="Search your video, recent, tags, idea"
              class="pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 bg-white/5 outline-none focus:ring-2 focus:ring-orange-500/50 transition w-96"
              @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
            />
          </div>
          
          <BasePopover side="bottom" :side-offset="10">
            <template #trigger>
              <button class="rounded-lg inline-flex items-center justify-center border border-gray-300 bg-white/5 hover:bg-white/10 px-3 py-2 outline-none gap-2">
                <Icon icon="material-symbols:label" class="text-lg" />
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
            <Icon icon="material-symbols:refresh" :class="{ 'animate-spin': rescanLoading }" />
            <span>Rescan</span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>


