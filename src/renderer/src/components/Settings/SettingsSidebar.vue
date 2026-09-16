<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { SettingSection } from '../../utils/settingsSections';

interface Props {
  sections: readonly SettingSection[];
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
  <aside class="w-64 shrink-0 border-r border-border bg-muted-50/50 flex flex-col min-h-0">
    <!--
      The search, above the list it makes optional. The page owns the field
      rather than this component, so the keystroke that opens a result does not
      have to be passed up through a sidebar that has no opinion about it.
    -->
    <slot name="search" />

    <nav class="flex-1 min-h-0 p-3 space-y-1 overflow-y-auto pt-3">
      <button
        v-for="section in sections"
        :key="section.id"
        class="w-full flex items-start gap-3 px-3 py-3 rounded-lg transition-colors text-left"
        :class="activeSection === section.id 
          ? 'bg-orange-500/10 text-orange-600' 
          : 'hover:bg-card/50 text-muted-700'"
        @click="selectSection(section.id)"
      >
        <Icon :icon="section.icon" class="text-xl mt-0.5 shrink-0" />
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
        title="Puts every setting on this screen back the way it came. Your clips, tags, stars and collections are not touched."
        @click="emit('reset')"
      >
        <Icon icon="material-symbols:restart-alt" />
        Reset to Defaults
      </button>
      <!--
        Somebody who cannot tell whether this wipes their tags will not press
        it, and somebody who presses it expecting a wipe is worse off. Say
        which it is.
      -->
      <p class="px-3 pt-1 text-xs text-muted-500">
        Settings only. Your clips, tags, stars and collections stay as they are.
      </p>
    </div>
  </aside>
</template>

