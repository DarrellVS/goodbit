<script lang="ts" setup>
import { RouterLink } from 'vue-router';
import { Icon } from '@iconify/vue';
import SidebarGames from './SidebarGames.vue';
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
  <!--
    The row you are on is an orange tint, not a lighter card.

    Every item in here, and in the games list, used `bg-card/10` for both
    `hover:` and the active state, which made them identical to each other and
    very nearly identical to the sidebar. The tokens say how nearly: in dark
    `--card` is 8% lightness and `--background` is 5%, so a tenth of the card
    over the sidebar lands about a third of a percent above it. In light they
    are both pure white, so the active row was white on white and simply did
    not exist.

    An accent tint reads on both grounds and cannot collide with the surface
    it sits on, which is what the settings list beside this one already did.
    Hover is `--muted-50`, a real step on the ladder, so hover and active are
    now two different things rather than the same class twice.
  -->
  <aside class="w-64 bg-card/5 backdrop-blur-sm border-r border-border flex flex-col h-full">
    <!--
      No name or mark here. The title bar already carries both, a hand's width
      above, and saying it twice is one of them wasted.
    -->
    <div class="h-4"></div>

    <!--
      min-h-0 and its own scroll: a flex child defaults to min-height:auto, so a
      long games list grew the sidebar past the window instead of scrolling, and
      the whole page picked up a second scrollbar.

      Collections used to sit under the games here. They are a row of cards
      above the clips now: a collection is a view of the library, the same kind
      of thing as Starred, and this column is navigation.
    -->
    <nav class="flex-1 min-h-0 overflow-y-auto px-3 space-y-6">
      <div class="space-y-1">
        <SidebarSectionHeader title="MAIN MENU" />
      
        <RouterLink
          to="/"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
          exact-active-class="bg-orange-500/10 text-orange-500"
        >
          <Icon icon="material-symbols:video-library" class="text-lg" />
          <span class="font-medium">Library</span>
        </RouterLink>

        <RouterLink
          to="/today"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
          exact-active-class="bg-orange-500/10 text-orange-500"
        >
          <Icon icon="material-symbols:schedule" class="text-lg" />
          <span class="font-medium">Today</span>
        </RouterLink>

        <RouterLink
          to="/editor"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
          exact-active-class="bg-orange-500/10 text-orange-500"
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
    </nav>

    <div class="p-3 space-y-1 border-t border-border">
      <RouterLink
        to="/tag-patterns"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
        exact-active-class="bg-orange-500/10 text-orange-500"
      >
        <Icon icon="material-symbols:auto-awesome" class="text-lg" />
        <span class="font-medium">Smart Tags</span>
      </RouterLink>

      <RouterLink
        to="/stats"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
        exact-active-class="bg-orange-500/10 text-orange-500"
      >
        <Icon icon="material-symbols:bar-chart" class="text-lg" />
        <span class="font-medium">Stats</span>
      </RouterLink>

      <RouterLink
        to="/settings"
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted-50 transition-colors group"
        exact-active-class="bg-orange-500/10 text-orange-500"
      >
        <Icon icon="material-symbols:settings" class="text-lg" />
        <span class="font-medium">Settings</span>
      </RouterLink>

    </div>
  </aside>
</template>
