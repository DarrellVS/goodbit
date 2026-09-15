<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import BaseToast from './components/Base/BaseToast.vue';
import TitleBar from './components/App/TitleBar.vue';
import UpdateBanner from './components/App/UpdateBanner.vue';
import PublisherInviteDialog from './components/App/PublisherInviteDialog.vue';
import ObsSetupInviteListener from './components/App/ObsSetupInviteListener.vue';

// The tray menu opens screens, "trim the latest clip", and main only knows
// paths, so the router is asked from here, the one place that always exists.
const router = useRouter();
let detachNavigate: (() => void) | null = null;

onMounted(() => {
  detachNavigate = window.goodbit?.app.onNavigate((path) => void router.push(path)) ?? null;
});

onUnmounted(() => {
  detachNavigate?.();
  detachNavigate = null;
});
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
  <PublisherInviteDialog />
  <ObsSetupInviteListener />
</template>
