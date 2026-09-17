<script setup lang="ts">
import { Icon } from '@iconify/vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import type { ObsInstallPlan } from '@renderer/services/obs';

/**
 * No OBS, no clips.
 *
 * The page only exists on a machine without it, and it keeps watching while it
 * is on screen: the installer is another program and finishes without telling
 * this one. The watching is the wizard's (`useObsSetupWizard`), so this draws
 * what it found.
 */

interface Props {
  installPlan: ObsInstallPlan | null;
  installed: boolean;
  installing: boolean;
  progress: { percent?: number; message: string } | null;
  error: string | null;
}

interface Emits {
  (e: 'install', method: 'winget' | 'download' | 'manual'): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <p class="text-sm text-muted-500">
    OBS does the recording; GoodBit keeps what it records. It is free and open source, and
    this installs it from the OBS project's own release.
  </p>

  <div v-if="progress" class="p-4 rounded-md bg-muted-50 space-y-2">
    <p class="text-sm text-muted-500">{{ progress.message }}</p>
    <div v-if="progress.percent !== undefined" class="h-1 bg-muted-100 rounded-sm overflow-hidden">
      <div
        class="h-full bg-accent transition-[width] duration-200"
        :style="{ width: `${progress.percent}%` }"
      ></div>
    </div>
  </div>

  <div class="flex flex-wrap gap-2">
    <!-- The first option is the recommended one; see installOptions. -->
    <button
      v-for="(option, index) in installPlan?.options ?? []"
      :key="option.method"
      class="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      :class="
        index === 0
          ? 'bg-accent hover:bg-accent-hover text-accent-fg'
          : 'border border-border hover:bg-muted-50 text-foreground'
      "
      :disabled="installing"
      :title="option.detail"
      @click="emit('install', option.method)"
    >
      {{ installing && option.method !== 'manual' ? 'Working…' : option.label }}
    </button>
  </div>

  <p v-if="installPlan?.installer" class="text-xs text-muted-500">
    OBS {{ installPlan.installer.version }},
    {{ Math.round(installPlan.installer.bytes / 1_000_000) }} MB, the current release. It
    opens OBS's own installer, which asks its own questions.
  </p>

  <p v-if="!installed" class="text-xs text-muted-500 flex items-center gap-1.5">
    <BaseSpinner class="text-sm" />
    Watching for OBS to appear. This carries on by itself once it is installed.
  </p>
  <p v-else class="text-xs text-success flex items-center gap-1.5">
    <Icon icon="material-symbols:check-circle" class="text-sm" />
    OBS is here.
  </p>
  <p v-if="error" class="text-sm text-danger-ink">{{ error }}</p>
</template>
