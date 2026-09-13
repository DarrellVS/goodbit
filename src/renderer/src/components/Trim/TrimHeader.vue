<template>
  <!--
    No back button: the title bar already has one, and two arrows pointing the
    same way is one too many. Kept short — the page below it has to fit a
    preview, a timeline and a transport without scrolling.
  -->
  <header class="relative overflow-hidden border-b border-border flex-shrink-0">
    <div class="relative max-w-7xl mx-auto px-6 py-4">
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
          <Icon icon="material-symbols:content-cut" class="text-card text-xl" />
        </div>
        <div>
          <h1 class="text-2xl font-bold bg-gradient-to-b from-orange-500 to-orange-600 bg-clip-text text-transparent">
            Trim Your Clip
          </h1>
          <p class="text-xs text-muted-400">Select the perfect moment</p>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
</script>
