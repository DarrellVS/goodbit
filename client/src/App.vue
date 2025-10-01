<script setup lang="ts">
import BaseToast from './components/Base/BaseToast.vue';
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
  <BaseToast />
</template>
