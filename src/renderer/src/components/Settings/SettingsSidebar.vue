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

    <nav class="flex-1 min-h-0 p-2 space-y-0.5 overflow-y-auto">
      <!--
        The same active marker as the sidebar beside it: weight and a hairline
        accent rule, absolutely positioned so the row does not move.

        This column and the app's own sidebar sit side by side on this screen
        and were two different materials, and this one carried three markers
        for one state at once: a filled tint, accent ink and a glyph that also
        turned accent. One is enough, and it is the one the other column uses.

        A grid rather than a flex row of guesses, so the glyphs form a column
        and both lines of every row share one left edge. The description used
        to be indented by the glyph and the label was not.
      -->
      <button
        v-for="section in sections"
        :key="section.id"
        type="button"
        :aria-current="activeSection === section.id ? 'true' : undefined"
        class="relative w-full grid grid-cols-[1.25rem_1fr] items-start gap-3 pl-4 pr-3 py-2.5 rounded-md text-left outline-none focus-visible:focus-ring transition-colors duration-150"
        :class="activeSection === section.id
          ? 'text-foreground'
          : 'text-muted-600 hover:bg-muted-100 hover:text-foreground'"
        @click="selectSection(section.id)"
      >
        <span
          v-if="activeSection === section.id"
          aria-hidden="true"
          class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent"
        />
        <Icon :icon="section.icon" class="size-5 shrink-0 block mt-px" />
        <div class="min-w-0">
          <div class="text-sm" :class="activeSection === section.id ? 'font-medium' : ''">
            {{ section.label }}
          </div>
          <div class="text-xs text-muted-500 mt-0.5">{{ section.description }}</div>
        </div>
      </button>
    </nav>

    <div class="p-2 pb-3 border-t border-border space-y-0.5">
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

