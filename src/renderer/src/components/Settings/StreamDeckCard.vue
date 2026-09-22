<script setup lang="ts">
import { onMounted, ref } from 'vue';
import SettingToggle from './SettingToggle.vue';
import { useToastStore } from '@renderer/stores/toast';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { BUTTON_SMALL } from '@renderer/components/Base/geometry';

/**
 * The Stream Deck plugin's door into the library.
 *
 * Built the way the Claude block beside it is, because it is the same kind of
 * thing: a server on this machine only, behind a token, off until somebody
 * turns it on, with the address and the token shown so they can be pasted into
 * the plugin.
 *
 * **Discard is its own switch, and it starts off.** A key pressed mid-game by
 * somebody not looking at a screen has no room for a confirmation, so even
 * with it on the plugin only sends it on a long press, and GoodBit still keeps
 * any clip that carries something only it holds: a name, tags, notes, marks,
 * a star, or a public link.
 */

interface DeckState {
  enabled: boolean;
  running: boolean;
  url: string;
  token: string;
  allowDiscard: boolean;
}

const toast = useToastStore();
const { settingRing } = useSettingsSearch();
const { save } = useAppSettings();

const state = ref<DeckState | null>(null);
const working = ref(false);
const showToken = ref(false);

async function load(): Promise<void> {
  state.value = (await window.goodbit?.streamDeckState()) ?? null;
}

onMounted(load);

async function toggleServer(enabled: boolean): Promise<void> {
  working.value = true;
  try {
    await window.goodbit?.streamDeckEnable(enabled);
    await load();
    toast.success(enabled ? 'GoodBit is listening for the Stream Deck' : 'The connection is closed');
  } finally {
    working.value = false;
  }
}

async function toggleDiscard(allow: boolean): Promise<void> {
  await save({ streamDeckAllowDiscard: allow });
  await load();
}

async function copy(value: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  } catch {
    toast.error(`Could not copy the ${what.toLowerCase()}`);
  }
}
</script>

<template>
  <div class="setting-card">
    <div data-setting="Stream Deck" :class="settingRing('Stream Deck')">
      <h3 class="font-display text-lg font-medium text-foreground">Stream Deck</h3>
      <p class="text-sm text-muted-500 mt-1 max-w-[76ch]">
        Keys that tag or publish the clip you just saved, and show today's count, without leaving
        the game. Use Elgato's own OBS plugin for the key that saves the replay.
      </p>
      <p class="text-sm text-muted-400 mt-1.5 max-w-[76ch]">
        It listens on this machine only, behind a token. The token stops web pages and other
        machines; anything already running as you could read it from the plugin's settings.
      </p>
    </div>

    <div class="mt-1">
      <SettingToggle
        :model-value="state?.enabled ?? false"
        :disabled="working"
        label="Let the Stream Deck reach this library"
        description="Off by default. Nothing is listening until you turn this on."
        @update:model-value="toggleServer"
      />
    </div>

    <template v-if="state?.enabled">
      <div class="flex items-center gap-2 py-3 border-b border-border text-sm">
        <span
          class="size-1.5 rounded-full shrink-0"
          :class="state.running ? 'bg-success' : 'bg-accent'"
        />
        <span class="text-foreground">{{ state.running ? 'Listening' : 'Not listening' }}</span>
        <code class="font-mono text-xs text-muted-400 truncate">{{ state.url }}</code>
        <button
          type="button"
          :class="[BUTTON_SMALL, 'ml-auto shrink-0']"
          @click="copy(state.url, 'Address')"
        >
          Copy address
        </button>
      </div>

      <!-- The token is a password. It is not printed until somebody asks for it. -->
      <div class="flex items-center gap-2 py-3 border-b border-border text-sm">
        <span class="text-muted-500 shrink-0">Token</span>
        <code class="font-mono text-xs text-foreground truncate">
          {{ showToken ? state.token : '•'.repeat(16) }}
        </code>
        <button
          type="button"
          :class="[BUTTON_SMALL, 'ml-auto shrink-0']"
          @click="showToken = !showToken"
        >
          {{ showToken ? 'Hide' : 'Show' }}
        </button>
        <button type="button" :class="[BUTTON_SMALL, 'shrink-0']" @click="copy(state.token, 'Token')">
          Copy token
        </button>
      </div>

      <SettingToggle
        :model-value="state.allowDiscard"
        label="Let a key throw away the last clip"
        description="Off by default. The key has to be held, and GoodBit keeps any clip you have named, tagged, starred, marked, written a note on or published."
        @update:model-value="toggleDiscard"
      />
    </template>
  </div>
</template>
