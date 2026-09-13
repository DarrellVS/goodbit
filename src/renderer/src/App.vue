<script setup lang="ts">
import BaseToast from './components/Base/BaseToast.vue';
import UpdateBanner from './components/App/UpdateBanner.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
  <BaseToast />
  <UpdateBanner />
</template>
