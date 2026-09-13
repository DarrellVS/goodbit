<script setup lang="ts">
import BaseToast from './components/Base/BaseToast.vue';
import TitleBar from './components/App/TitleBar.vue';
import UpdateBanner from './components/App/UpdateBanner.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <div class="flex flex-col h-full">
    <TitleBar />
    <div class="flex-1 min-h-0">
      <RouterView />
    </div>
  </div>
  <BaseToast />
  <UpdateBanner />
</template>
