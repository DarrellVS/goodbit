<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import ObsSetupDialog from '@renderer/components/Settings/ObsSetupDialog.vue';

/**
 * The website's handoff into the app.
 *
 * The OBS guide on the site ends with a button, the way the publisher guide
 * does, so nobody has to walk the same steps twice in two places. The link
 * carries which steps the reader chose and nothing else: no paths, no secrets,
 * and no authority. It opens the setup dialog, and a person still reads the
 * list of changes and presses Apply.
 */

interface ObsSetupInvite {
  kind?: string;
  steps?: string[];
  bufferSeconds?: number | null;
  hotkey?: string | null;
}

const open = ref(false);
const invite = ref<ObsSetupInvite | null>(null);

let detach: (() => void) | null = null;

onMounted(() => {
  detach =
    window.goodbit?.app.onDeepLink((raw) => {
      const link = raw as ObsSetupInvite;
      if (link?.kind !== 'obs-setup') return;
      invite.value = link;
      open.value = true;
    }) ?? null;
});

onBeforeUnmount(() => {
  detach?.();
  detach = null;
});
</script>

<template>
  <ObsSetupDialog
    v-model:open="open"
    :invited-steps="invite?.steps ?? null"
    :invited-buffer="invite?.bufferSeconds ?? null"
    :invited-hotkey="invite?.hotkey ?? null"
  />
</template>
