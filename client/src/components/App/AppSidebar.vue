<script lang="ts" setup>
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import SidebarGames from './SidebarGames.vue';
import SidebarCollections from './SidebarCollections.vue';
import SidebarSectionHeader from './SidebarSectionHeader.vue';

interface Props {
  activeGame?: string;
}

interface Emits {
  (e: 'logout'): void;
  (e: 'select-game', game: string): void;
}

defineProps<Props>();
const emit = defineEmits<Emits>();
</script>

<template>
  <aside class="w-64 bg-white/5 backdrop-blur-sm border-r border-gray-200 flex flex-col h-full">
    <div class="p-6">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Icon icon="material-symbols:video-library" class="text-white text-lg" />
        </div>
        <h1 class="text-xl font-bold">Filmpje</h1>
      </div>
    </div>

    <nav class="flex-1 px-3 space-y-6">
      <div class="space-y-1">
        <SidebarSectionHeader title="MAIN MENU" />
      
        <RouterLink
          to="/"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
          exact-active-class="bg-white/10 text-orange-500"
        >
          <Icon icon="material-symbols:video-library" class="text-lg" />
          <span class="font-medium">Library</span>
        </RouterLink>

        <RouterLink
          to="/today"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
          exact-active-class="bg-white/10 text-orange-500"
        >
          <Icon icon="material-symbols:schedule" class="text-lg" />
          <span class="font-medium">Today</span>
        </RouterLink>
      </div>

      <SidebarGames :active-game="activeGame" @select-game="emit('select-game', $event)" />

      <SidebarCollections />
    </nav>

    <div class="p-3 space-y-1 border-t border-gray-200">
      <RouterLink
        to="/tag-patterns"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="font-medium">Smart Tags</span>
      </RouterLink>

      <RouterLink
        to="/stats"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:bar-chart" class="text-lg" />
        <span class="font-medium">Stats</span>
      </RouterLink>

      <RouterLink
        to="/settings"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group"
        exact-active-class="bg-white/10 text-orange-500"
      >
        <Icon icon="material-symbols:settings" class="text-lg" />
        <span class="font-medium">Settings</span>
      </RouterLink>

      <button
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/10 transition-colors group text-left"
        @click="emit('logout')"
      >
        <Icon icon="material-symbols:logout" class="text-lg" />
        <span class="font-medium">Logout</span>
      </button>
    </div>
  </aside>
</template>
