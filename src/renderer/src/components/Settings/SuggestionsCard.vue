<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { useToastStore } from '../../stores/toast';
import { getLabelSummary, getLabels, type LabelSummary } from '../../services/clips';

const toastStore = useToastStore();

const summary = ref<LabelSummary | null>(null);
const working = ref(false);

/** The floor `scripts/train-highlights.mjs` refuses to go below. */
const ENOUGH = 60;

const usable = computed(() => {
  const s = summary.value;
  if (!s) return 0;
  // A trim with no suggestion on screen says nothing about the decision.
  return s.accepted + s.rejected + s.trims;
});

const ready = computed(() => usable.value >= ENOUGH);

async function refresh(): Promise<void> {
  try {
    summary.value = await getLabelSummary();
  } catch {
    summary.value = null;
  }
}

/**
 * The labels leave as a file rather than being trained on in place: fitting a
 * model is a thing you do deliberately, look at, and decide to keep.
 */
async function exportLabels(): Promise<void> {
  if (working.value) return;
  working.value = true;

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
  } finally {
    working.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <!--
    The analysis ships with a rule whose one real threshold was set by looking
    at ten clips. This is where that gets replaced by what you actually keep.
  -->
  <div class="p-4 bg-card border border-border rounded-lg space-y-4">
    <div class="flex items-start gap-3">
      <div class="w-10 h-10 rounded-xl bg-orange-500/12 flex items-center justify-center flex-shrink-0">
        <Icon icon="material-symbols:graphic-eq" class="text-xl text-orange-500" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-medium text-foreground">Suggestions</h3>
        <p class="text-sm text-muted-600 mt-1">
          Every time you trim a clip, GoodBit keeps a note of where you cut and what it had
          suggested. Nothing leaves this machine; the notes are rows in your own library.
        </p>
      </div>
    </div>

    <div v-if="summary" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <div
        v-for="stat in [
          { label: 'Trims', value: summary.trims },
          { label: 'Taken as-is', value: summary.accepted },
          { label: 'Marked wrong', value: summary.rejected },
          { label: 'Total', value: summary.total },
        ]"
        :key="stat.label"
        class="px-3 py-2 rounded-lg bg-muted-50 border border-border"
      >
        <div class="text-lg font-semibold text-foreground">{{ stat.value }}</div>
        <div class="text-xs text-muted-500">{{ stat.label }}</div>
      </div>
    </div>

    <div
      v-if="summary?.model"
      class="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm"
    >
      <Icon icon="material-symbols:model-training" class="text-lg text-emerald-500 flex-shrink-0" />
      <span class="text-foreground">
        Using your own model{{ summary.model.examples ? `, fitted to ${summary.model.examples} examples` : '' }}.
      </span>
    </div>

    <p v-else class="text-sm text-muted-600">
      <template v-if="ready">
        There is enough here to fit a model. Export the labels and run
        <code class="text-xs">node scripts/train-highlights.mjs --labels &lt;file&gt;</code>, then drop
        the result into <code class="text-xs">%APPDATA%\GoodBit</code>.
      </template>
      <template v-else>
        {{ usable }} of about {{ ENOUGH }} needed before a model can be fitted to your taste. Until
        then the built-in rule decides, which it does by asking how far a moment stands out from the
        rest of its own clip.
      </template>
    </p>

    <div class="flex flex-wrap gap-2">
      <button
        class="px-4 py-2 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors flex items-center gap-2 disabled:opacity-50"
        :disabled="working || !summary?.total"
        @click="exportLabels"
      >
        <Icon icon="material-symbols:download" class="text-lg" />
        Export labels
      </button>

      <button
        class="px-4 py-2 rounded-lg border border-border text-muted-700 text-sm font-medium hover:bg-muted-50 transition-colors flex items-center gap-2"
        @click="refresh"
      >
        <Icon icon="material-symbols:refresh" class="text-lg" />
        Refresh
      </button>
    </div>
  </div>
</template>
