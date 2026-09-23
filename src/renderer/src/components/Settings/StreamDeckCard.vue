<script setup lang="ts">
import { statusDotVariants } from '@renderer/components/Base/variants';
import { onMounted, ref } from 'vue';
import SettingToggle from './SettingToggle.vue';
import { useToastStore } from '@renderer/stores/toast';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

/**
 * The Stream Deck plugin's door into the library.
 *
 * Off until somebody turns it on. It used to show an address and a token to
 * paste into the plugin; the connection is a named pipe now, which Windows
 * only lets this account write to and which GoodBit tells the plugin about
 * itself, so there is nothing to copy and nothing secret to show.
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
  pipe: string;
  allowDiscard: boolean;
  pluginInstalled: boolean;
  pluginAvailable: boolean;
}

const toast = useToastStore();
const { settingRing } = useSettingsSearch();
const { save } = useAppSettings();

const state = ref<DeckState | null>(null);
const working = ref(false);

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

/*
 * One press: Windows hands the plugin to the Stream Deck app, which asks, and
 * GoodBit writes the address and token into it once it lands. The state is
 * polled for a while afterwards so the row turns to "Installed" by itself.
 */
const installing = ref(false);
async function installPlugin(): Promise<void> {
  installing.value = true;
  try {
    const result = await window.goodbit?.streamDeckInstallPlugin();
    if (!result) return;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('The Stream Deck app asks to install it. Say yes and the keys connect by themselves.');
    for (let i = 0; i < 60 && !state.value?.pluginInstalled; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await load();
    }
  } finally {
    installing.value = false;
  }
}

async function toggleDiscard(allow: boolean): Promise<void> {
  await save({ streamDeckAllowDiscard: allow });
  await load();
}
</script>

<template>
  <div class="setting-card">
    <div data-setting="Stream Deck" :class="settingRing('Stream Deck')">
      <h3 class="font-display text-lg font-medium text-foreground">Stream Deck</h3>
      <p class="text-sm text-muted-500 mt-1 max-w-[76ch]">
        Keys that save the replay, tag, publish or throw away the clip you just saved, and show
        today's count, without leaving the game. Saving presses the key OBS already has for it, so
        nothing in OBS changes.
      </p>
      <p class="text-sm text-muted-400 mt-1.5 max-w-[76ch]">
        It listens on this computer only, through a named pipe that web pages cannot reach and
        other Windows accounts cannot write to. There is no token to copy: GoodBit tells the plugin
        where to find it.
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
      <!--
        The plugin first: it is the part somebody came here for, and once it is
        installed the address and the token below are only for connecting by
        hand, because GoodBit hands them to the plugin itself.
      -->
      <div class="flex items-center gap-3 py-3 border-b border-border text-sm">
        <span :class="statusDotVariants({ tone: state.pluginInstalled ? 'ok' : 'waiting' })" />
        <div class="min-w-0">
          <div class="text-foreground">
            {{ state.pluginInstalled ? 'The plugin is installed' : 'The plugin is not installed yet' }}
          </div>
          <div class="text-muted-500">
            {{
              state.pluginInstalled
                ? 'It connects to GoodBit by itself. Drag GoodBit keys onto your Stream Deck.'
                : 'Needs the Stream Deck app. It asks before installing.'
            }}
          </div>
        </div>
        <BaseButton
          size="sm"
          :tone="state.pluginInstalled ? 'default' : 'strong'"
          class="ml-auto shrink-0"
          :disabled="installing || !state.pluginAvailable"
          :title="state.pluginAvailable ? undefined : 'This build of GoodBit does not carry the plugin'"
          @click="installPlugin"
        >
          {{ installing ? 'Installing' : state.pluginInstalled ? 'Reinstall' : 'Install the plugin' }}
        </BaseButton>
      </div>

      <div class="flex items-center gap-2 py-3 border-b border-border text-sm">
        <span :class="statusDotVariants({ tone: state.running ? 'ok' : 'waiting' })" />
        <span class="text-foreground">
          {{ state.running ? 'Listening, on this computer only' : 'Not listening' }}
        </span>
        <code class="ml-auto font-mono text-xs text-muted-400 truncate" :title="state.pipe">
          {{ state.pipe }}
        </code>
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
