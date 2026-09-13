<template>
  <header class="relative overflow-hidden border-b border-gray-300 dark:border-slate-700">
    <div class="relative max-w-7xl mx-auto px-6 py-8">
      <div class="flex items-center justify-between">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
              <Icon icon="material-symbols:content-cut" class="text-white text-2xl" />
            </div>
            <div>
              <h1 class="text-3xl font-bold bg-gradient-to-b from-orange-500 to-orange-600 bg-clip-text text-transparent">
                Trim Your Clip
              </h1>
              <p class="text-sm text-muted-400 mt-1">Select the perfect moment</p>
            </div>
          </div>
        </div>
        
        <RouterLink 
          to="/"
          class="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium border border-gray-300 bg-white/5 hover:bg-white/10 transition-all shadow-sm hover:shadow-md dark:border-slate-700"
        >
          <Icon icon="material-symbols:arrow-back" />
          <span>Back to Library</span>
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
</script>

