<script setup lang="ts">
import { statusDotVariants } from '@renderer/components/Base/variants';
import { onMounted, ref } from 'vue';
import SettingToggle from './SettingToggle.vue';
import { useToastStore } from '@renderer/stores/toast';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

/**
 * The local API: other programs on this PC reading what GoodBit is doing.
 *
 * Off until somebody turns it on. It is a named pipe with a name chosen at
 * every launch, so there is no address to show and nothing secret to paste;
 * a program finds the pipe by reading a small file, and that file's path is
 * the one thing worth giving somebody who is writing one.
 *
 * **Deleting is its own switch, and it starts off**, the same as the Stream
 * Deck's: a client may send the latest clip to the Recycle Bin only when this
 * is on, and GoodBit still keeps any clip carrying something it alone holds.
 */

interface ApiState {
  enabled: boolean;
  running: boolean;
  allowDiscard: boolean;
  discoveryPath: string;
}

const toast = useToastStore();
const { settingRing } = useSettingsSearch();

const state = ref<ApiState | null>(null);
const working = ref(false);

async function load(): Promise<void> {
  state.value = (await window.goodbit?.localApiState()) ?? null;
}

onMounted(load);

async function toggleServer(enabled: boolean): Promise<void> {
  working.value = true;
  try {
    await window.goodbit?.localApiEnable(enabled);
    await load();
    toast.success(enabled ? 'Other apps on this PC can now connect' : 'The connection is closed');
  } finally {
    working.value = false;
  }
}

async function toggleDiscard(allow: boolean): Promise<void> {
  await window.goodbit?.localApiAllowDiscard(allow);
  await load();
}

async function copyPath(): Promise<void> {
  if (!state.value) return;
  await navigator.clipboard.writeText(state.value.discoveryPath);
  toast.success('Path copied.');
}
</script>

<template>
  <div class="setting-card">
    <div data-setting="Other apps on this PC" :class="settingRing('Other apps on this PC')">
      <h3 class="font-display text-lg font-medium text-foreground">Other apps on this PC</h3>
      <p class="text-sm text-muted-500 mt-1">
        Let a status bar, a script or a deck follow your clips and act on the latest one.
      </p>
    </div>

    <div class="mt-1">
      <SettingToggle
        :model-value="state?.enabled ?? false"
        :disabled="working"
        label="Let other apps reach this library"
        description="Off until you turn it on."
        @update:model-value="toggleServer"
      />
    </div>

    <template v-if="state?.enabled">
      <div class="flex items-center gap-2 py-3 border-t border-border text-sm">
        <span :class="statusDotVariants({ tone: state.running ? 'ok' : 'blocker' })" />
        <span class="text-foreground">
          {{ state.running ? 'Ready' : 'Not running. Another GoodBit may be using this profile.' }}
        </span>
      </div>

      <SettingToggle
        :model-value="state.allowDiscard"
        label="Allow deleting clips"
        description="A connected app may send the latest clip to the Recycle Bin. Clips you tagged, starred or wrote a note on are kept."
        @update:model-value="toggleDiscard"
      />

      <div class="flex items-center justify-between gap-3 py-3 border-t border-border">
        <div class="min-w-0">
          <p class="text-sm text-foreground">Where a program finds the connection</p>
          <p class="text-sm text-muted-500 mt-0.5 font-mono truncate" :title="state.discoveryPath">
            {{ state.discoveryPath }}
          </p>
        </div>
        <BaseButton size="sm" class="shrink-0" @click="copyPath">Copy</BaseButton>
      </div>
    </template>
  </div>
</template>
