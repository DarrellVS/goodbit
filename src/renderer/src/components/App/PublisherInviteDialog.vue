<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useAppSettings } from '../../composables/useAppSettings';
import { usePublisher } from '../../composables/usePublisher';
import { useToastStore } from '../../stores/toast';

/**
 * "This page wants to point GoodBit at a publisher."
 *
 * The setup guide ends with a button that hands over the address and the token,
 * so nobody has to retype a forty-character secret. What arrives is a
 * `goodbit://` link, and anything that can open a browser can send one.
 *
 * So the link fills this in and stops. Applied without asking, a link on any
 * web page could repoint the publisher at someone else's server and every clip
 * published from then on would go to them. What it changes is on screen before
 * anyone agrees to it, including the address in full, because that is the part
 * that would be worth lying about.
 */
interface Invite {
  kind: string;
  url: string;
  token: string;
}

const { settings, load, save } = useAppSettings();
const { refresh: refreshPublisher } = usePublisher();
const toasts = useToastStore();

const invite = ref<Invite | null>(null);
const saving = ref(false);
const showToken = ref(false);

/** Says whether this replaces something, because that is a different decision. */
const replacing = computed(() => !!settings.value.publisherBaseUrl);

const masked = computed(() => {
  const token = invite.value?.token ?? '';
  if (!token) return 'none';
  if (showToken.value) return token;
  return token.length <= 8 ? '•'.repeat(token.length) : `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}`;
});

let detach: (() => void) | null = null;

onMounted(async () => {
  await load();
  detach =
    window.goodbit?.app.onDeepLink((raw) => {
      const link = raw as Invite;
      if (link?.kind === 'publisher' && typeof link.url === 'string') invite.value = link;
    }) ?? null;
});

onBeforeUnmount(() => {
  detach?.();
  detach = null;
});

function dismiss(): void {
  invite.value = null;
  showToken.value = false;
}

async function apply(): Promise<void> {
  if (!invite.value || saving.value) return;
  saving.value = true;
  try {
    await save({
      publisherBaseUrl: invite.value.url,
      publisherToken: invite.value.token,
    });
    await refreshPublisher();
    toasts.success('Publishing is set up. Try it on a clip.', 'Publisher saved');
    dismiss();
  } catch (error) {
    toasts.error((error as Error).message || 'Could not save those settings');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="invite"
    class="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-6"
    role="dialog"
    aria-modal="true"
    aria-label="Set up publishing"
    @click.self="dismiss"
  >
    <div class="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
      <div class="flex items-start gap-4 p-6">
        <div class="shrink-0 w-11 h-11 rounded-xl bg-orange-500 flex items-center justify-center">
          <Icon icon="material-symbols:cloud-upload" class="text-white text-2xl" />
        </div>
        <div class="min-w-0">
          <h2 class="text-lg font-semibold text-foreground leading-tight">Set up publishing?</h2>
          <p class="text-sm text-muted-500 mt-1">
            A page asked GoodBit to use this publisher. Nothing changes until you agree.
          </p>
        </div>
      </div>

      <dl class="px-6 pb-2 space-y-3 text-sm">
        <div>
          <dt class="text-muted-500">Clips would be uploaded to</dt>
          <dd class="font-mono text-foreground break-all mt-0.5">{{ invite.url }}</dd>
        </div>
        <div>
          <dt class="text-muted-500 flex items-center gap-2">
            Using the token
            <button
              class="text-xs text-orange-600 hover:text-orange-500"
              @click="showToken = !showToken"
            >
              {{ showToken ? 'hide' : 'show' }}
            </button>
          </dt>
          <dd class="font-mono text-foreground break-all mt-0.5">{{ masked }}</dd>
        </div>
      </dl>

      <!--
        Replacing a working publisher is the case worth a second look: the
        clips carry on being uploaded, just somewhere else.
      -->
      <p
        v-if="replacing"
        class="mx-6 mt-3 px-4 py-3 rounded-xl border border-orange-400/50 bg-orange-500/8 text-sm text-muted-700"
      >
        This replaces the publisher you have set up, at
        <span class="font-mono">{{ settings.publisherBaseUrl }}</span>. Clips already published stay
        where they are.
      </p>

      <p class="px-6 pt-3 text-xs text-muted-500">
        Only agree if you recognise that address. Anything published afterwards is uploaded there.
      </p>

      <div class="flex justify-end gap-2 p-6 pt-4">
        <button
          class="px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted-50 transition-colors"
          @click="dismiss"
        >
          Not now
        </button>
        <button
          class="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
          :disabled="saving"
          @click="apply"
        >
          {{ saving ? 'Saving…' : 'Use this publisher' }}
        </button>
      </div>
    </div>
  </div>
</template>
