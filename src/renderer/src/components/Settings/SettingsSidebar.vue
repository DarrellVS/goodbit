<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface SettingSection {
  id: string;
  label: string;
  icon: string;
  description: string;
}

interface Props {
  sections: SettingSection[];
  activeSection: string;
}

interface Emits {
  (e: 'update:activeSection', section: string): void;
  (e: 'export'): void;
  (e: 'import'): void;
  (e: 'reset'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function selectSection(sectionId: string): void {
  emit('update:activeSection', sectionId);
}
</script>

<template>
  <aside class="w-64 border-r border-border bg-muted-50/50 flex flex-col">
    <nav class="flex-1 p-3 space-y-1 overflow-y-auto pt-6">
      <button
        v-for="section in sections"
        :key="section.id"
        class="w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-colors text-left"
        :class="activeSection === section.id 
          ? 'bg-orange-500/10 text-orange-600' 
          : 'hover:bg-card/50 text-muted-700'"
        @click="selectSection(section.id)"
      >
        <Icon :icon="section.icon" class="text-xl mt-0.5 flex-shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="font-medium">{{ section.label }}</div>
          <div class="text-xs text-muted-500 mt-0.5">{{ section.description }}</div>
        </div>
      </button>
    </nav>

    <div class="p-3 border-t border-border space-y-2">
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-card/50 transition-colors text-sm text-muted-700"
        @click="emit('export')"
      >
        <Icon icon="material-symbols:download" />
        Export Settings
      </button>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-card/50 transition-colors text-sm text-muted-700"
        @click="emit('import')"
      >
        <Icon icon="material-symbols:upload" />
        Import Settings
      </button>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/8 transition-colors text-sm text-red-600"
        @click="emit('reset')"
      >
        <Icon icon="material-symbols:restart-alt" />
        Reset to Defaults
      </button>
    </div>
  </aside>
</template>

