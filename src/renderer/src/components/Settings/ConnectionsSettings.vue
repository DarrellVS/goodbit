<script setup lang="ts">
import { statusDotVariants } from '@renderer/components/Base/variants';
import { computed, onMounted, ref } from 'vue';
import SettingToggle from './SettingToggle.vue';
import PublisherCard from './PublisherCard.vue';
import StreamDeckCard from './StreamDeckCard.vue';
import { useToastStore } from '@renderer/stores/toast';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

/**
 * The two programs GoodBit talks to, and nothing else.
 *
 * Claude was here on its own and the publisher was under App, where nothing in
 * the name suggested that "where does GoodBit publish to" was answered there.
 * They are the same kind of thing from either end: an address, a token, and
 * another program at the far side of it, each of them optional and each off
 * until somebody sets it up.
 *
 * Two switches, and they are genuinely separate decisions. The first starts a
 * server. The second tells Claude Code it exists. Somebody who manages their
 * own Claude config wants the first without the second, and the one click
 * route is exactly the second done for them.
 *
 * The screen says what is true rather than what was intended: whether it is
 * listening, at which address, and whether the config already has it. All of
 * that is read back from the machine each time this opens.
 */

const toast = useToastStore();
/* The cards here carry their own name from `utils/settingsCatalog.ts`. */
const { settingRing } = useSettingsSearch();

interface McpClient {
  id: string;
  label: string;
  installed: boolean;
  writable: boolean;
  registered: boolean;
  configPath: string | null;
  note?: string;
}

interface McpState {
  enabled: boolean;
  running: boolean;
  url: string;
  token: string;
  command: string;
  clients: McpClient[];
}

const state = ref<McpState | null>(null);
const working = ref(false);

async function load(): Promise<void> {
  state.value = (await window.goodbit?.mcpState()) ?? null;
}

onMounted(load);

async function toggleServer(enabled: boolean): Promise<void> {
  working.value = true;
  try {
    await window.goodbit?.mcpEnable(enabled);
    await load();
    toast.success(
      enabled ? 'GoodBit is listening for Claude Code' : 'The connection is closed',
    );
  } finally {
    working.value = false;
  }
}

/** One client, or every one on the machine when no id is given. */
async function toggleRegistration(wanted: boolean, id?: string): Promise<void> {
  working.value = true;
  try {
    const results = (await window.goodbit?.mcpRegister(wanted, id ? [id] : undefined)) ?? [];
    await load();

    const failed = results.filter((result) => !result.ok);
    const done = results.filter((result) => result.ok).map((result) => result.label);

    if (failed.length) {
      toast.error(
        failed.map((result) => `${result.label}: ${result.error ?? 'could not be written'}`).join('. '),
        'Not connected',
      );
    }

    if (done.length) {
      toast.success(
        wanted
          ? `${done.join(' and ')} now know about your library. Restart them, then ask about your clips.`
          : `GoodBit was removed from ${done.join(' and ')}.`,
      );
    }
  } finally {
    working.value = false;
  }
}

const found = computed(() => state.value?.clients.filter((client) => client.installed) ?? []);
/*
 * Only the clients GoodBit can actually set up.
 *
 * Claude Desktop is listed because the person has it, but it only runs servers
 * it starts itself, so an address written into its config is rejected and it
 * complains at every launch. It gets the address to paste instead, and it must
 * not count towards "all set up" or the switch would never look finished.
 */
const settable = computed(() => found.value.filter((client) => client.writable));
const allRegistered = computed(
  () => settable.value.length > 0 && settable.value.every((client) => client.registered),
);

/** The URL and token on their own, for a client that is set up by pasting. */
async function copyAddress(): Promise<void> {
  if (!state.value) return;
  await navigator.clipboard.writeText(
    `${state.value.url}
Authorization: Bearer ${state.value.token}`,
  );
  toast.success('Address and token copied. Paste them into that app’s connector settings.');
}

</script>

<template>
  <section class="settings-page">
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Connections</h2>
      <p class="mt-2 text-muted-500">Publishing, Claude and Stream Deck. All optional.</p>
    </div>

    <PublisherCard />

    <div class="setting-card">
      <div data-setting="Claude" :class="settingRing('Claude')">
        <h3>Claude</h3>
        <p class="text-sm text-muted-500 mt-1">Let Claude find, tag and trim your clips.</p>
      </div>

      <SettingToggle
        :model-value="state?.enabled ?? false"
        :disabled="working"
        label="Let Claude reach this library"
        description="Works with Claude Code, Claude Desktop and Cursor on this PC."
        @update:model-value="toggleServer"
      />

      <template v-if="state?.enabled">
        <div class="flex items-center gap-2 py-3 border-t border-border text-sm">
          <span :class="statusDotVariants({ tone: state.running ? 'ok' : 'waiting' })" />
          <span class="text-foreground">{{ state.running ? 'Ready' : 'Not running' }}</span>
        </div>

        <template v-if="found.length">
          <SettingToggle
            :model-value="allRegistered"
            :disabled="working || !state.running"
            label="Set them up for me"
            description="Connects every app below."
            @update:model-value="(wanted: boolean) => toggleRegistration(wanted)"
          />

          <!-- One row per app actually on this machine, so each can be connected on its own. -->
          <div
            v-for="client in found"
            :key="client.id"
            class="flex items-center justify-between gap-3 py-3 border-t border-border"
          >
            <div class="min-w-0">
              <p class="text-sm text-foreground">{{ client.label }}</p>
              <p v-if="client.note" class="text-sm text-muted-500 mt-0.5">{{ client.note }}</p>
            </div>
            <BaseButton
              v-if="client.writable"
              size="sm"
              :tone="client.registered ? 'success' : 'default'"
              class="shrink-0"
              :disabled="working || !state.running"
              @click="toggleRegistration(!client.registered, client.id)"
            >
              {{ client.registered ? 'Connected' : 'Connect' }}
            </BaseButton>
            <BaseButton v-else size="sm" class="shrink-0" @click="copyAddress">
              Copy address
            </BaseButton>
          </div>
        </template>
        <p v-else class="text-sm text-muted-500 py-3 border-t border-border">
          No supported apps found on this PC.
        </p>

        <p class="text-sm text-muted-400 pt-3 border-t border-border">
          Restart an app after connecting it.
        </p>
      </template>
    </div>

    <StreamDeckCard />
  </section>
</template>
