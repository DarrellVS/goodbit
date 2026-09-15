<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import SettingToggle from './SettingToggle.vue';
import { useToastStore } from '../../stores/toast';

/**
 * Connecting Claude Code to the library.
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

interface McpClient {
  id: string;
  label: string;
  installed: boolean;
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
const allRegistered = computed(
  () => found.value.length > 0 && found.value.every((client) => client.registered),
);

async function copyCommand(): Promise<void> {
  if (!state.value) return;
  await navigator.clipboard.writeText(state.value.command);
  toast.success('Copied, token and all. Run it in a terminal.');
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-1">Connections</h2>
      <p class="text-sm text-muted-500">Let Claude work on your clips</p>
    </div>

    <div class="p-4 bg-card rounded-lg border border-border space-y-4">
      <div class="flex items-start gap-3">
        <Icon icon="material-symbols:robot-2-outline" class="text-xl text-orange-500 mt-0.5" />
        <div class="min-w-0">
          <p class="font-medium text-foreground">Claude</p>
          <p class="text-sm text-muted-500 mt-1">
            GoodBit can answer questions about your library and act on it: find the clip you are
            thinking of, tag a batch of them, say where the interesting part of a recording is, and
            trim to it.
          </p>
          <p class="text-xs text-muted-500 mt-2">
            It listens on this machine only, behind a token, and nothing it offers can delete a
            clip.
          </p>
        </div>
      </div>

      <SettingToggle
        :model-value="state?.enabled ?? false"
        :disabled="working"
        label="Let Claude reach this library"
        description="Off by default. Nothing is listening until you turn this on."
        @update:model-value="toggleServer"
      />

      <template v-if="state?.enabled">
        <div class="pt-3 border-t border-border space-y-3">
          <div class="flex items-center gap-2 text-sm">
            <span
              class="w-2 h-2 rounded-full flex-shrink-0"
              :class="state.running ? 'bg-emerald-500' : 'bg-orange-500'"
            />
            <span class="text-foreground">
              {{ state.running ? 'Listening' : 'Not listening' }}
            </span>
            <code class="text-xs text-muted-500 truncate">{{ state.url }}</code>
          </div>

          <div v-if="found.length" class="space-y-2">
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
            -->
            <div
              v-for="client in found"
              :key="client.id"
              class="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div class="min-w-0">
                <p class="text-sm text-foreground">{{ client.label }}</p>
                <p class="text-xs text-muted-500 truncate">{{ client.configPath }}</p>
                <p v-if="client.note" class="text-xs text-muted-500 mt-1">{{ client.note }}</p>
              </div>
              <button
                class="px-2.5 py-1.5 rounded-lg border text-xs flex-shrink-0"
                :class="
                  client.registered
                    ? 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                    : 'border-border text-foreground hover:bg-muted-50'
                "
                :disabled="working || !state.running"
                @click="toggleRegistration(!client.registered, client.id)"
              >
                {{ client.registered ? 'Connected' : 'Connect' }}
              </button>
            </div>
          </div>

          <p v-else class="text-xs text-muted-500">
            Nothing that speaks MCP was found on this machine. The command below works wherever you
            do have one.
          </p>

          <div class="rounded-lg border border-border p-3 space-y-2">
            <p class="text-xs text-muted-500">
              Or do it yourself. This is the same thing the switch above writes.
            </p>
            <code
              class="block text-xs text-muted-500 bg-muted-50 rounded p-2 break-all font-mono"
            >{{ shownCommand }}</code>
            <div class="flex items-center gap-2">
              <button
                class="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted-50 text-xs text-foreground"
                @click="copyCommand"
              >
                Copy
              </button>
              <button
                class="px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted-50 text-xs text-foreground"
                @click="showToken = !showToken"
              >
                {{ showToken ? 'Hide the token' : 'Show the token' }}
              </button>
            </div>
          </div>

          <p class="text-xs text-muted-500">
            These read their config when they start, so restart after connecting. Then ask
            something like "what did I record yesterday?"
          </p>
        </div>
      </template>
    </div>
  </section>
</template>
