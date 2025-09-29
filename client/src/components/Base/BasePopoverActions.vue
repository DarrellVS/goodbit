<script lang="ts" setup>
import BaseButton from './BaseButton.vue';
import type { PopoverAction } from './types';

const props = defineProps<{ actions: PopoverAction[] }>();

async function onActionClick(act: PopoverAction) {
  if (act.disabled) return;
  await act.onClick();
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <BaseButton
      v-for="act in props.actions"
      :key="act.key"
      :variant="act.variant || 'default'"
      class="justify-start"
      :disabled="act.disabled"
      @click="onActionClick(act)"
    >
      {{ act.label }}
    </BaseButton>
  </div>
</template>


