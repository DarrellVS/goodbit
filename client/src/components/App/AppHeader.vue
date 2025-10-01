<script lang="ts" setup>
import BaseButton from '../Base/BaseButton.vue';
import BaseInput from '../Base/BaseInput.vue';
import BasePopover from '../Base/BasePopover.vue';

defineProps<{ search: string; rescanLoading?: boolean; showLogout?: boolean }>();
defineEmits<{
  (e: 'update:search', value: string): void;
  (e: 'rescan'): void;
  (e: 'logout'): void;
  (e: 'open-tags-filter'): void;
}>();
</script>

<template>
  <header class="col-span-2 bg-white/10 backdrop-blur-md border border-border flex items-center justify-between px-6">
    <h1 class="text-2xl font-semibold bg-gradient-to-br from-foreground via-violet-500 to-cyan-500 bg-clip-text text-transparent">Clips</h1>
    <div class="flex items-center gap-3">
      <BaseInput class="w-96" :value="search" placeholder="Search name, filename, or tags" @input="$emit('update:search', ($event.target as HTMLInputElement).value)" />
      <BasePopover side="bottom" :side-offset="10">
        <template #trigger>
          <button class="rounded-xl inline-flex items-center justify-center border border-border bg-white/10 px-3 py-2 outline-none">Tags</button>
        </template>
        <slot name="tags-filter" />
      </BasePopover>
      <BaseButton :disabled="rescanLoading" @click="$emit('rescan')">Rescan</BaseButton>
      <BaseButton v-if="showLogout" @click="$emit('logout')">Logout</BaseButton>
    </div>
  </header>
</template>


