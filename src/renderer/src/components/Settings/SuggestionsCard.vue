<script setup lang="ts">
import BaseToggle from '@renderer/components/Base/BaseToggle.vue';
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '@renderer/stores/toast';
import BaseSpinner from '@renderer/components/Base/BaseSpinner.vue';
import {
  fitSuggestionModel,
  forgetSuggestionModel,
  getLabelSummary,
  getLabels,
  type FitReport,
  type LabelSummary,
} from '@renderer/services/clips';

const toastStore = useToastStore();

const summary = ref<LabelSummary | null>(null);
const working = ref(false);
const lastFit = ref<FitReport | null>(null);

const ready = computed(() => !!summary.value && summary.value.usable >= summary.value.needed);

const progress = computed(() => {
  const s = summary.value;
  if (!s) return 0;
  return Math.min(100, Math.round((s.usable / s.needed) * 100));
});

async function refresh(): Promise<void> {
  try {
    summary.value = await getLabelSummary();
  } catch {
    summary.value = null;
  }
}

/**
 * Fitting happens on its own as labels arrive; this is for the person who
 * wants to see it happen, or who turned the automatic part off.
 */
async function fitNow(): Promise<void> {
  if (working.value) return;
  working.value = true;
  try {
    const outcome = await fitSuggestionModel();
    if (outcome.fitted) {
      lastFit.value = outcome.report;
      toastStore.success(
        `Fitted to ${outcome.report.examples} of your decisions, ` +
          `${Math.round(outcome.report.accuracy * 100)}% right on the ones it was not shown`,
      );
    } else {
      toastStore.info(`Not yet: ${outcome.reason}`);
    }
    await refresh();
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not fit the model');
  } finally {
    working.value = false;
  }
}

async function revert(): Promise<void> {
  if (working.value) return;
  working.value = true;
  try {
    await forgetSuggestionModel();
    lastFit.value = null;
    toastStore.success('Back to the built-in rule. Your decisions are still recorded.');
    await refresh();
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not remove the model');
  } finally {
    working.value = false;
  }
}

async function setAutomatic(on: boolean): Promise<void> {
  try {
    await window.goodbit?.saveSettings({ learnFromTrims: on });
    await refresh();
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not save that');
  }
}

/** For anyone who wants to fit something of their own, offline. */
async function exportLabels(): Promise<void> {
  try {
    const rows = await getLabels();
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `goodbit-labels-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toastStore.success(`Exported ${rows.length} ${rows.length === 1 ? 'label' : 'labels'}`);
  } catch (error) {
    toastStore.error((error as Error).message || 'Could not export the labels');
  }
}

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

onMounted(refresh);
</script>

<template>
  <!--
    The analysis ships with a rule whose one real threshold was set by looking
    at ten clips. This is where that gets replaced by what you actually keep,
    on its own, as you trim, with nothing to run.
  -->
  <div class="setting-block space-y-4">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-md bg-accent/12 flex items-center justify-center shrink-0">
        <Icon icon="material-symbols:graphic-eq" class="text-xl text-accent-ink" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-medium text-foreground">Suggestions learn from your trims</h3>
        <p class="text-sm text-muted-600 mt-1">
          Every trim records where you cut and what GoodBit had suggested. Once there are enough,
          it fits a small model to those decisions and uses it instead of the built-in rule,
          then keeps refitting as you go. Nothing leaves this machine.
        </p>
      </div>
    </div>

    <template v-if="summary">
      <div class="flex items-center justify-between gap-3">
        <!--
          A label, so the words are part of the control.
          
          The switch and its text were siblings, so clicking the sentence did
          nothing while every other settings row in the app responds to it.
          `<label>` makes the whole thing one target without either half
          knowing about the other.
        -->
        <label class="flex items-center gap-3 select-none cursor-pointer">
          <BaseToggle
            :model-value="summary.automatic"
            label="Learn from my trims automatically"
            @update:model-value="setAutomatic($event)"
          />
          <span class="text-sm text-foreground">Learn from my trims automatically</span>
        </label>
      </div>

      <div v-if="summary.model" class="px-3 py-2.5 rounded-lg bg-success/10 border border-success/30 text-sm space-y-1">
        <div class="flex items-center gap-2 text-foreground">
          <Icon icon="material-symbols:model-training" class="text-lg text-success shrink-0" />
          <span>
            Using a model fitted to <strong>{{ summary.model.examples }}</strong> of your decisions
            <template v-if="summary.model.trainedAt">on {{ when(summary.model.trainedAt) }}</template>.
          </span>
        </div>
        <p v-if="summary.model.heldOutAccuracy !== null" class="text-xs text-muted-600 pl-7">
          It got {{ Math.round(summary.model.heldOutAccuracy * 100) }}% of the decisions it was not
          shown right. It refits itself after every 25 new ones.
        </p>
      </div>

      <div v-else class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-muted-600">
            <template v-if="ready">Enough decisions to fit a model.</template>
            <template v-else>{{ summary.usable }} of {{ summary.needed }} decisions so far.</template>
          </span>
          <span class="text-xs text-muted-500">{{ progress }}%</span>
        </div>
        <div class="h-1.5 rounded-full bg-muted-100 overflow-hidden">
          <div class="h-full bg-accent transition-all" :style="{ width: progress + '%' }" />
        </div>
        <p class="text-xs text-muted-500">
          A decision is a trim made while a suggestion was on screen, or the Wrong button. Until
          there are enough, the built-in rule decides.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div
          v-for="stat in [
            { label: 'Trims', value: summary.trims + summary.accepted },
            { label: 'Taken as offered', value: summary.accepted },
            { label: 'Marked wrong', value: summary.rejected },
          ]"
          :key="stat.label"
          class="px-3 py-2 rounded-lg bg-muted-50 border border-border"
        >
          <div class="text-lg font-semibold text-foreground">{{ stat.value }}</div>
          <div class="text-xs text-muted-500">{{ stat.label }}</div>
        </div>
      </div>

      <div v-if="lastFit" class="text-xs text-muted-600 space-y-1">
        <div class="font-medium text-foreground">What the last fit weighed most</div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="w in lastFit.weights.slice(0, 4)"
            :key="w.feature"
            class="px-2 py-0.5 rounded-full bg-muted-50 border border-border font-mono"
          >
            {{ w.feature }} {{ w.weight >= 0 ? '+' : '' }}{{ w.weight.toFixed(2) }}
          </span>
        </div>
      </div>
    </template>

    <div class="flex flex-wrap gap-2">
      <button
        class="px-4 py-2 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center gap-2"
        :disabled="working || !ready"
        :title="
          ready
            ? 'Work out what you keep, from every trim you have made so far'
            : 'Not enough decisions yet'
        "
        @click="fitNow"
      >
        <BaseSpinner v-if="working" class="text-lg" />
        <Icon v-else icon="material-symbols:model-training" class="text-lg" />
        {{ summary?.model ? 'Learn from them again' : 'Learn from them now' }}
      </button>

      <button
        v-if="summary?.model"
        class="px-4 py-2 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors flex items-center gap-2"
        :disabled="working"
        @click="revert"
      >
        <Icon icon="material-symbols:undo" class="text-lg" />
        Back to the built-in rule
      </button>

      <button
        class="ml-auto px-3 py-2 rounded-lg text-muted-500 text-sm hover:text-muted-800 hover:bg-muted-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
        :disabled="!summary?.total"
        title="Save your trim decisions as a file, for building something of your own offline"
        @click="exportLabels"
      >
        <Icon icon="material-symbols:download" class="text-base" />
        Export decisions
      </button>
    </div>
  </div>
</template>
