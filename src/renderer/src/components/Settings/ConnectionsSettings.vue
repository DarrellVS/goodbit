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
const showToken = ref(false);

/** The token is a password. It is not printed until somebody asks for it. */
const shownCommand = computed(() => {
  if (!state.value) return '';
  return showToken.value
    ? state.value.command
    : state.value.command.replace(state.value.token, '•'.repeat(12));
});

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

async function copyCommand(): Promise<void> {
  if (!state.value) return;
  await navigator.clipboard.writeText(state.value.command);
  toast.success('Copied, token and all. Run it in a terminal.');
}
</script>

<template>
  <section class="settings-page">
    <div class="pb-2">
      <h2 class="font-display text-[28px] leading-tight font-medium text-foreground">Connections</h2>
      <p class="mt-2 text-muted-500">
        Claude, and the server that hosts your public links. Both optional, both off until you set
        them up.
      </p>
    </div>

    <!--
      The publisher first, Claude after it.

      Claude was at the top because it was the only thing on this page when the
      page was called Claude. Publishing is what somebody comes here to get
      working, and it is the half that has an address, a token and something
      that can be unreachable; Claude is a switch and a config file.
    -->
    <PublisherCard />

    <div class="setting-card">
      <!--
        No glyph beside the heading. Nothing else on these pages has one, and a
        robot face over a paragraph about what a program may read is a decoration
        on the one block here that wants to be read carefully.
      -->
      <div data-setting="Claude" :class="settingRing('Claude')">
        <h3 class="font-display text-lg font-medium text-foreground">Claude</h3>
        <p class="text-sm text-muted-500 mt-1 max-w-[76ch]">
          GoodBit can answer questions about your library and act on it: find the clip you are
          thinking of, tag a batch of them, say where the interesting part of a recording is, and
          trim to it.
        </p>
        <p class="text-sm text-muted-400 mt-1.5 max-w-[76ch]">
          It listens on this machine only, behind a token, and nothing it offers can delete a clip.
        </p>
      </div>

      <div class="mt-1">
        <SettingToggle
          :model-value="state?.enabled ?? false"
          :disabled="working"
          label="Let Claude reach this library"
          description="Off by default. Nothing is listening until you turn this on."
          @update:model-value="toggleServer"
        />
      </div>

      <template v-if="state?.enabled">
        <!--
          What is true, read back from the machine: a dot, a word and the
          address it is answering on.
        -->
        <div class="flex items-center gap-2 py-3 border-b border-border text-sm">
          <span :class="statusDotVariants({ tone: state.running ? 'ok' : 'waiting' })" />
          <span class="text-foreground">{{ state.running ? 'Listening' : 'Not listening' }}</span>
          <code class="font-mono text-xs text-muted-400 truncate">{{ state.url }}</code>
        </div>

        <template v-if="found.length">
          <SettingToggle
            :model-value="allRegistered"
            :disabled="working || !state.running"
            label="Set them up for me"
            description="Writes GoodBit into the config of everything below, so there is nothing to paste. Your other servers are left alone and each file is backed up first."
            @update:model-value="(wanted: boolean) => toggleRegistration(wanted)"
          />

          <!--
            One row per client actually on this machine, so somebody can
            connect Claude Code and leave Cursor alone. A client that is not
            installed is never listed and never written: an empty config for
            an app somebody does not have is litter.

            Hairline rows, not bordered boxes. Three boxes in a column inside a
            block that is itself a list of blocks was three nested frames deep.
          -->
          <div
            v-for="client in found"
            :key="client.id"
            class="flex items-center justify-between gap-3 py-3 border-b border-border"
          >
            <div class="min-w-0">
              <p class="text-sm text-foreground">{{ client.label }}</p>
              <p v-if="client.writable" class="font-mono text-xs text-muted-400 truncate">
                {{ client.configPath }}
              </p>
              <p v-if="client.note" class="text-sm text-muted-500 mt-1">{{ client.note }}</p>
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

        <p v-else class="text-sm text-muted-500 py-3 border-b border-border">
          Nothing that speaks MCP was found on this machine. The command below works wherever you
          do have one.
        </p>

        <!--
          The one filled thing allowed in a block like this, and it holds
          exactly what an inset is for: something you copy rather than read.
        -->
        <div class="setting-inset space-y-2">
          <p class="text-sm text-muted-500">
            Or do it yourself. This is the same thing the switch above writes.
          </p>
          <code class="block font-mono text-xs text-muted-600 break-all">{{ shownCommand }}</code>
          <div class="flex items-center gap-2 pt-0.5">
            <BaseButton size="sm" @click="copyCommand">Copy</BaseButton>
            <BaseButton size="sm" @click="showToken = !showToken">
              {{ showToken ? 'Hide the token' : 'Show the token' }}
            </BaseButton>
          </div>
        </div>

        <p class="text-sm text-muted-400 mt-3 max-w-[76ch]">
          These read their config when they start, so restart after connecting. Then ask something
          like "what did I record yesterday?"
        </p>
      </template>
    </div>

    <!--
      Last, because it is the one of the three that needs a device somebody
      has to own first. Same shape as Claude above it: a server on this machine
      only, behind a token, off until switched on.
    -->
    <StreamDeckCard />
  </section>
</template>
