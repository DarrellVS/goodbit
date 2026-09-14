<script lang="ts" setup>
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import SidebarGames from './SidebarGames.vue';
import SidebarCollections from './SidebarCollections.vue';
import SidebarSectionHeader from './SidebarSectionHeader.vue';

interface Props {
  activeGame?: string;
  disableGamesFilter?: boolean;
}

interface Emits {
  (e: 'select-game', game: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  disableGamesFilter: false,
});
const emit = defineEmits<Emits>();
</script>

<template>
  <aside class="w-64 bg-card/5 backdrop-blur-sm border-r border-border flex flex-col h-full">
    <!--
      No name or mark here. The title bar already carries both, a hand's width
      above, and saying it twice is one of them wasted.
    -->
    <div class="h-4"></div>

    <!--
      min-h-0 and its own scroll: a flex child defaults to min-height:auto, so a
      long games or collections list grew the sidebar past the window instead of
      scrolling, and the whole page picked up a second scrollbar.
    -->
    <nav class="flex-1 min-h-0 overflow-y-auto px-3 space-y-6">
      <div class="space-y-1">
        <SidebarSectionHeader title="MAIN MENU" />
      
        <RouterLink
          to="/"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
          exact-active-class="bg-card/10 text-orange-500"
        >
          <Icon icon="material-symbols:video-library" class="text-lg" />
          <span class="font-medium">Library</span>
        </RouterLink>

        <RouterLink
          to="/today"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
          exact-active-class="bg-card/10 text-orange-500"
        >
          <Icon icon="material-symbols:schedule" class="text-lg" />
          <span class="font-medium">Today</span>
        </RouterLink>

        <RouterLink
          to="/editor"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
          exact-active-class="bg-card/10 text-orange-500"
        >
          <Icon icon="material-symbols:movie-edit" class="text-lg" />
          <span class="font-medium">Editor</span>
        </RouterLink>
      </div>

      <SidebarGames 
        :active-game="activeGame"
        :disabled="props.disableGamesFilter"
        @select-game="emit('select-game', $event)" 
      />

      <SidebarCollections />
    </nav>

    <div class="p-3 space-y-1 border-t border-border">
      <RouterLink
        to="/tag-patterns"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
        exact-active-class="bg-card/10 text-orange-500"
      >
        <Icon icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="font-medium">Smart Tags</span>
      </RouterLink>

      <RouterLink
        to="/stats"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
        exact-active-class="bg-card/10 text-orange-500"
      >
        <Icon icon="material-symbols:bar-chart" class="text-lg" />
        <span class="font-medium">Stats</span>
      </RouterLink>

      <RouterLink
        to="/settings"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-card/10 transition-colors group"
        exact-active-class="bg-card/10 text-orange-500"
      >
        <Icon icon="material-symbols:settings" class="text-lg" />
        <span class="font-medium">Settings</span>
      </RouterLink>

    </div>
  </aside>
</template>
