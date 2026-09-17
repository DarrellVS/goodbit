<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import BaseToast from '@renderer/components/Base/BaseToast.vue';
import BaseConfirmDialog from '@renderer/components/Base/BaseConfirmDialog.vue';
import { useConfirm } from '@renderer/composables/ui/useConfirm';
import TitleBar from '@renderer/components/Shell/TitleBar.vue';
import UpdateBanner from '@renderer/components/Shell/UpdateBanner.vue';
import PublisherInviteDialog from '@renderer/components/Publish/PublisherInviteDialog.vue';
import ObsSetupInviteListener from '@renderer/components/Obs/ObsSetupInviteListener.vue';

// The tray menu opens screens, "trim the latest clip", and main only knows
// paths, so the router is asked from here, the one place that always exists.
const router = useRouter();
let detachNavigate: (() => void) | null = null;

// One question on screen at a time, drawn here so it outlives whichever
// component asked it and sits above everything that component is inside.
const { pending, accept, cancel } = useConfirm();

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
  <BaseConfirmDialog
    :open="pending !== null"
    :title="pending?.title ?? ''"
    :description="pending?.description ?? ''"
    :confirm-label="pending?.confirmLabel"
    :tone="pending?.tone"
    :icon="pending?.icon"
    @confirm="accept"
    @cancel="cancel"
  />
  <UpdateBanner />
  <PublisherInviteDialog />
  <ObsSetupInviteListener />
</template>
