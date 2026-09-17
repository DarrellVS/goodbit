<script setup lang="ts">
import StatsColumnHead from './StatsColumnHead.vue';

interface InfoItem {
  label: string;
  value: string;
}

defineProps<{ items: InfoItem[] }>();
</script>

<template>
  <section>
    <StatsColumnHead title="Info" />

    <!--
      A description list, which is what this is: a label and the fact it names.
      `.b-dl` is a two column grid where every cell carries a hairline above
      it, so the rules run the full width rather than stopping at each row's
      own padding.
    -->
    <dl class="grid grid-cols-[auto_1fr]">
      <template v-for="item in items" :key="item.label">
        <dt class="py-2.5 pr-4 border-t border-border text-sm text-muted-500">
          {{ item.label }}
        </dt>
        <dd class="py-2.5 border-t border-border text-sm text-foreground text-right font-mono tabular-nums">
          {{ item.value }}
        </dd>
      </template>
    </dl>
  </section>
</template>
