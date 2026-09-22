<script setup lang="ts">
import BasePanel from '@renderer/components/Base/BasePanel.vue';
import { Icon } from '@iconify/vue';
import { ICON_BOX_LG } from '@renderer/components/Base/geometry';
import { useFormat } from '@renderer/composables/ui/useFormat';

/**
 * Three numbers about somebody else's disk.
 *
 * **The disk figure says whose it is**, which is not a nicety: a number headed
 * "storage used" on a screen inside GoodBit reads as this machine's drive, and
 * it is not. It is the server the clips were uploaded to, which is usually a
 * NAS in another room with completely different room on it.
 *
 * Mono, tabular and right-aligned, with the label under rather than beside, so
 * three cards of different magnitudes line up on the digits.
 */
interface Props {
  clips: number;
  bytes: number;
  views: number;
}

defineProps<Props>();
const { formatBytes } = useFormat();
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <BasePanel>
      <div class="flex items-center gap-2 text-muted-500">
        <Icon icon="material-symbols:cloud-done-outline" :class="ICON_BOX_LG" />
        <span class="text-xs">Published</span>
      </div>
      <div class="mt-1.5 font-mono text-2xl tabular-nums text-foreground">{{ clips }}</div>
      <p class="text-xs text-muted-500">{{ clips === 1 ? 'clip' : 'clips' }} behind a public link</p>
    </BasePanel>

    <BasePanel>
      <div class="flex items-center gap-2 text-muted-500">
        <Icon icon="material-symbols:dns-outline" :class="ICON_BOX_LG" />
        <span class="text-xs">On the publisher</span>
      </div>
      <div class="mt-1.5 font-mono text-2xl tabular-nums text-foreground">
        {{ formatBytes(bytes) }}
      </div>
      <!--
        Said out loud. A storage figure on a screen in this app reads as this
        machine's drive, and this one is the server the clips were sent to.
      -->
      <p class="text-xs text-muted-500">on the server, not on this computer</p>
    </BasePanel>

    <BasePanel>
      <div class="flex items-center gap-2 text-muted-500">
        <Icon icon="material-symbols:visibility-outline" :class="ICON_BOX_LG" />
        <span class="text-xs">Opened</span>
      </div>
      <div class="mt-1.5 font-mono text-2xl tabular-nums text-foreground">{{ views }}</div>
      <p class="text-xs text-muted-500">times somebody opened a link</p>
    </BasePanel>
  </div>
</template>
