<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useAppSettings } from '@renderer/composables/app/useAppSettings';
import { usePublisher } from '@renderer/composables/clips/usePublisher';
import { useSettingsSearch } from '@renderer/composables/settings/useSettingsSearch';
import { useToastStore } from '@renderer/stores/toast';
import SettingToggle from './SettingToggle.vue';
import BaseField from '@renderer/components/Base/BaseField.vue';
import { ICON_BOX } from '@renderer/components/Base/geometry';
import BaseButton from '@renderer/components/Base/BaseButton.vue';

/**
 * The server that hosts your public links.
 *
 * Under Connections, with the MCP server. Those two are the same kind of thing
 * seen from either end: an address, a token, and another program at the far
 * side of it. It was under App, where nothing about the name suggested that
 * "where does GoodBit publish to" was answered there, and the Advanced panel
 * had a paragraph pointing at it, which is a screen admitting it is a maze.
 */
const { settings, load, save } = useAppSettings();
const { refresh: refreshPublisher } = usePublisher();
const { settingRing } = useSettingsSearch();
const toast = useToastStore();

/** The setup guide on the website, in the person's own browser. */
const PUBLISHER_GUIDE = 'https://darrellvs.github.io/goodbit/publisher.html';

const publisherUrl = ref('');
const publisherToken = ref('');
const showToken = ref(false);
const publisherState = ref<'unknown' | 'checking' | 'ok' | 'unreachable'>('unknown');

onMounted(async () => {
  await load();
  publisherUrl.value = settings.value.publisherBaseUrl;
  publisherToken.value = settings.value.publisherToken ?? '';
});

function openGuide(): void {
  void window.goodbit?.openExternal(PUBLISHER_GUIDE);
}

/** The clip menus read this through `usePublisher`, so tell them. */
async function saveCompressPublished(on: boolean): Promise<void> {
  await save({ compressPublished: on });
  await refreshPublisher();
}

async function savePublisher(): Promise<void> {
  await save({
    publisherBaseUrl: publisherUrl.value.trim(),
    publisherToken: publisherToken.value.trim(),
  });
  toast.success(publisherUrl.value.trim() ? 'Publisher saved' : 'Publishing turned off');
  publisherState.value = 'unknown';
}

/** Reachability is the thing worth knowing; a saved URL that answers nothing is worse than none. */
async function testPublisher(): Promise<void> {
  const url = publisherUrl.value.trim();
  if (!url) return;

  publisherState.value = 'checking';
  try {
    await fetch(`${url.replace(/\/$/, '')}/health`, { method: 'GET' });
    publisherState.value = 'ok';
  } catch {
    publisherState.value = 'unreachable';
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      data-setting="Publisher"
      :class="['setting-card', settingRing('Publisher')]"
    >
      <h3>Publisher</h3>
      <p>
        Optional. A server that hosts public links for the clips you publish. Leave empty and
        publishing is simply off.
      </p>

      <!--
        The one genuinely hands-on thing GoodBit asks of anyone, so the guide is
        a click away rather than something to go looking for. A text button, and
        the underline is on the text rather than on a box around it.
      -->
      <button
        type="button"
        class="mt-2.5 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:text-foreground outline-none focus-visible:focus-ring rounded-xs transition-colors duration-150"
        @click="openGuide"
      >
        <Icon icon="material-symbols:open-in-new" :class="ICON_BOX" />
        How to set one up
      </button>

      <!--
        The address and the token, on underlined fields.

        They were bordered boxes with a two pixel ring on focus, which is the
        only pair of boxes left on these pages and the only focus treatment in
        the app that is not the one ring.
      -->
      <div class="flex items-end gap-2 mt-4">
        <BaseField class="flex-1">
          <input
            v-model="publisherUrl"
            type="text"
            placeholder="http://192.168.1.20:5555"
            aria-label="Publisher address"
            class="text-sm"
            @keydown.enter="savePublisher"
          />
        </BaseField>
        <BaseButton
          :disabled="!publisherUrl.trim()"
          @click="testPublisher"
        >
          Test
        </BaseButton>
        <BaseButton tone="strong" @click="savePublisher">Save</BaseButton>
      </div>

      <!--
        Serving clips is public on purpose; writing to the publisher is not.
        Without this the address is an open file drop under your own domain,
        so the publisher refuses every upload until both ends have it.
      -->
      <div class="flex items-end gap-2 mt-3">
        <BaseField class="flex-1">
          <input
            v-model="publisherToken"
            :type="showToken ? 'text' : 'password'"
            placeholder="Publish token"
            aria-label="Publish token"
            autocomplete="off"
            spellcheck="false"
            class="font-mono text-sm"
            @keydown.enter="savePublisher"
          />
        </BaseField>
        <BaseButton
          class="px-3"
          :title="showToken ? 'Hide the token' : 'Show the token'"
          :aria-label="showToken ? 'Hide the token' : 'Show the token'"
          @click="showToken = !showToken"
        >
          <Icon
            :icon="showToken ? 'material-symbols:visibility-off' : 'material-symbols:visibility'"
            :class="ICON_BOX"
          />
        </BaseButton>
      </div>

      <p class="!mt-2.5">
        The same value as <code class="font-mono">PUBLISH_TOKEN</code> on the server. Uploads are
        refused without it.
      </p>

      <!-- One line, and what it says depends on what the address answered. -->
      <p v-if="publisherState === 'checking'" class="!mt-2 !text-muted-400">Checking</p>
      <p v-else-if="publisherState === 'ok'" class="!mt-2 !text-success">That address answers.</p>
      <p v-else-if="publisherState === 'unreachable'" class="!mt-2 !text-danger-ink">
        No answer from that address.
      </p>

      <!--
        Inside the card, so the hairline under the card is under this too. It
        sat outside it, which put the Claude heading straight under its
        description with no rule between two unrelated things.
      -->
      <div class="mt-3">
        <!--
          A different question from compressing a trim, which is why it is a
          different switch and now on a different page: what goes to a public link
          is a copy, so shrinking it costs nothing on disk. Hidden when there is no
          publisher, since a setting for a feature you do not have is noise.
        -->
        <SettingToggle
          v-if="settings.publisherBaseUrl"
          label="Compress clips when publishing"
          description="The file on disk is untouched; only the copy behind the public link is re-encoded, so it downloads in a fifth of the time. Off uploads the recording as it is."
          :model-value="settings.compressPublished !== false"
          @update:model-value="saveCompressPublished($event)"
        />
      </div>
    </div>
  </div>
</template>
