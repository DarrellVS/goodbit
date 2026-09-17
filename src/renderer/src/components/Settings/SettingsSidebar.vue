<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { SettingSection } from '@renderer/utils/settingsSections';

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
  <aside class="w-64 shrink-0 border-r border-border bg-muted-50 flex flex-col min-h-0">
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
          ? 'bg-accent/10 text-accent-ink'
          : 'hover:bg-muted-100 text-muted-700'"
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
      <!--
        One grid, three rows, so the glyphs form a column and the labels share
        a left edge. They were flex rows with an inline icon sized by its own
        font, which is `04-settings-footer-actions`: three icons at three
        widths and three labels starting at three different x. The danger row
        has the same geometry as the two above it and differs only in colour.
      -->
      <button
        type="button"
        class="w-full h-9 grid grid-cols-[1rem_1fr] items-center gap-2.5 px-3 rounded-md text-left text-sm outline-none focus-visible:focus-ring transition-colors duration-150 text-muted-600 hover:bg-muted-100 hover:text-foreground"
        @click="emit('export')"
      >
        <Icon icon="material-symbols:download" class="size-4 shrink-0 block" />
        <span>Export Settings</span>
      </button>
      <button
        type="button"
        class="w-full h-9 grid grid-cols-[1rem_1fr] items-center gap-2.5 px-3 rounded-md text-left text-sm outline-none focus-visible:focus-ring transition-colors duration-150 text-muted-600 hover:bg-muted-100 hover:text-foreground"
        @click="emit('import')"
      >
        <Icon icon="material-symbols:upload" class="size-4 shrink-0 block" />
        <span>Import Settings</span>
      </button>
      <button
        type="button"
        class="w-full h-9 grid grid-cols-[1rem_1fr] items-center gap-2.5 px-3 rounded-md text-left text-sm outline-none focus-visible:focus-ring transition-colors duration-150 text-danger-ink hover:bg-danger/10"
        title="Puts every setting on this screen back the way it came. Your clips, tags, stars and collections are not touched."
        @click="emit('reset')"
      >
        <Icon icon="material-symbols:restart-alt" class="size-4 shrink-0 block" />
        <span>Reset to Defaults</span>
      </button>
      <!--
        Somebody who cannot tell whether this wipes their tags will not press
        it, and somebody who presses it expecting a wipe is worse off. Say
        which it is.
      -->
      <p class="px-3 pt-2 text-xs text-muted-500">
        Settings only. Your clips, tags, stars and collections stay as they are.
      </p>
    </div>
  </aside>
</template>

