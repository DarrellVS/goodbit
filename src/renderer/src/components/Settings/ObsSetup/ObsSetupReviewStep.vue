<script setup lang="ts">
import { computed } from 'vue';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import ObsSetupBlocker from './ObsSetupBlocker.vue';
import ObsSetupChange from './ObsSetupChange.vue';
import ObsSetupQuickSummary from './ObsSetupQuickSummary.vue';
import type { ObsSetupPlan } from '@renderer/services/obs';
import type { ObsSetupRoute, ObsSetupTile } from '@renderer/utils/obsSetupWizard';

/**
 * What changes, before anything changes.
 *
 * Nothing is written until it has been seen. This edits another program's
 * configuration, and the honest version of that is showing the edit: every
 * file, every section and key, the value going in and the value that is there
 * now. `src/main/services/obs/setup.ts` builds the plan and this only renders
 * it, which is why the preview and the write can never disagree.
 *
 * The blockers are the other half. The plan carries the reasons it cannot be
 * applied, and the forward button is disabled while there is one, rather than
 * the press being allowed and then failing.
 */

interface Props {
  plan: ObsSetupPlan | null;
  route: ObsSetupRoute;
  /** The quick route's four lines. Built by `quickSummaryTiles`. */
  tiles: ObsSetupTile[];
  /** Whether the quick route's folded-away full list is open. */
  showEverything: boolean;
  closingObs: boolean;
  working: boolean;
  progress: { percent?: number; message: string } | null;
  error: string | null;
}

interface Emits {
  (e: 'update:showEverything', value: boolean): void;
  (e: 'close-obs'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

/**
 * Quick asked for a decision, not a reading.
 *
 * With nothing to change there is nothing to summarise, so the full list's own
 * "nothing to change" line is left to say it.
 */
const summarised = computed(
  () => props.route === 'quick' && props.plan !== null && props.plan.changes.length > 0,
);

/** The full list is always open on the step by step route. */
const showDetail = computed(() => props.route !== 'quick' || props.showEverything);
</script>

<template>
  <ObsSetupQuickSummary v-if="summarised" :tiles="tiles" />

  <ObsSetupBlocker
    v-for="blocker in plan?.blockers ?? []"
    :key="blocker"
    :blocker="blocker"
    :closing="closingObs"
    @close-obs="emit('close-obs')"
  />

  <button
    v-if="summarised"
    class="text-xs text-muted-500 hover:text-foreground text-left"
    @click="emit('update:showEverything', !showEverything)"
  >
    {{ showEverything ? 'Hide the details' : 'Every file and key this changes' }}
  </button>

  <ObsSetupChange
    v-for="change in plan?.changes ?? []"
    :key="change.file"
    v-show="showDetail"
    :change="change"
  />

  <div v-if="!plan" class="flex items-center gap-2 text-sm text-muted-500 py-4">
    <BaseSpinner class="text-lg" />
    <span>Working out what would change…</span>
  </div>

  <p v-else-if="!plan.changes.length && !plan.blockers.length" class="text-sm text-muted-500 py-4">
    Nothing to change: OBS already has everything this would set.
  </p>

  <!--
    Applying takes a moment, and most of it is somebody else's
    installer. A button that says "Writing…" for ninety seconds reads
    as a hang, so this says which part is happening.
  -->
  <div v-if="working" class="p-4 rounded-xl border border-orange-500/30 bg-orange-500/5 space-y-2">
    <div class="flex items-center gap-2 text-sm text-foreground">
      <BaseSpinner class="text-lg text-orange-500" />
      <span>{{ progress?.message ?? 'Writing the settings' }}</span>
    </div>
    <div v-if="progress?.percent !== undefined" class="h-1 bg-muted-100 rounded-sm overflow-hidden">
      <div
        class="h-full bg-orange-500 transition-[width] duration-200"
        :style="{ width: `${progress.percent}%` }"
      ></div>
    </div>
    <p class="text-xs text-muted-500">
      Downloading and installing OBS takes a minute the first time. It only happens once.
    </p>
  </div>

  <p
    v-for="note in plan?.notes ?? []"
    v-show="showDetail"
    :key="note"
    class="text-xs text-muted-500"
  >
    {{ note }}
  </p>
  <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
</template>
