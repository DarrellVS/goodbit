<script lang="ts" setup>
import { useRoute } from 'vue-router';
import SidebarGames from './SidebarGames.vue';
import SidebarRow from './SidebarRow.vue';
import { useSidebarResize } from '@renderer/composables/ui/useSidebarResize';

interface Props {
  /** Every game the library is filtered to. Several of them light up at once. */
  activeGames?: string[];
  disableGamesFilter?: boolean;
}

interface Emits {
  (e: 'select-game', game: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  activeGames: () => [],
  disableGamesFilter: false,
});
const emit = defineEmits<Emits>();

const route = useRoute();
const {
  sidebarWidth,
  isDragging,
  startResize,
  resetWidth,
  onKeyDown,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
} = useSidebarResize();

/**
 * The top three and the bottom three, as data rather than as six copies of
 * the same markup. They were six, and the two groups had drifted: the bottom
 * three carried `w-full` and the top three did not.
 */
const MAIN = [
  { to: '/', icon: 'material-symbols:video-library', label: 'Library' },
  { to: '/today', icon: 'material-symbols:schedule', label: 'Today' },
  { to: '/editor', icon: 'material-symbols:movie-edit', label: 'Editor' },
];

const UTILITY = [
  { to: '/tag-patterns', icon: 'material-symbols:auto-awesome', label: 'Smart Tags' },
  { to: '/storage', icon: 'material-symbols:hard-drive', label: 'Storage Saver' },
  { to: '/stats', icon: 'material-symbols:bar-chart', label: 'Stats' },
  { to: '/settings', icon: 'material-symbols:settings', label: 'Settings' },
];

/**
 * Settings has sections, so its path carries a query and sometimes a child
 * route. `path.startsWith` rather than an exact match, or the row stops
 * looking active the moment you pick a section.
 */
function isActive(to: string): boolean {
  if (to === '/') return route.path === '/';
  return route.path === to || route.path.startsWith(to + '/');
}
</script>

<template>
  <!--
    Type-led, and quiet. The column is navigation for a screen whose subject is
    somewhere else, so nothing in here is the loudest thing on the page.

    No ground of its own. The column is the page, and a hairline is what says
    where it ends. It was `--muted-50`, which put two surfaces side by side
    before any content was drawn.

    A row under the pointer is `--muted-100`, and the row you are on is marked
    by weight and a hairline accent rule. That used to be a filled accent tint,
    which is a lot of colour for "you are here", and before that it was
    `bg-card/10` for both hover and active at once: in dark that lands about a
    third of a percent above the sidebar, and in light both were pure white, so
    the active row did not exist at all.

    232px by default, which is the measurement the design fixes rather than a
    number that happened to look right. It is a default rather than the width
    now: the hairline on the right is draggable, and a library whose game names
    run long is the reason.
  -->
  <aside
    class="relative border-r flex flex-col h-full shrink-0"
    :class="isDragging ? 'border-line-strong select-none' : 'border-border'"
    :style="{ width: `${sidebarWidth}px` }"
  >
    <!--
      No name or mark here. The title bar already carries both, a hand's width
      above, and saying it twice is one of them wasted.
    -->
    <div class="h-3"></div>

    <!--
      min-h-0 and its own scroll: a flex child defaults to min-height:auto, so a
      long games list grew the sidebar past the window instead of scrolling, and
      the whole page picked up a second scrollbar.

      Collections used to sit under the games here. They are a row of cards
      above the clips now: a collection is a view of the library, the same kind
      of thing as Starred, and this column is navigation.
    -->
    <nav class="flex-1 min-h-0 overflow-y-auto scroll-p-1.5 px-2 py-1 space-y-6">
      <!--
        No heading over the first group.

        `MAIN MENU` labelled the only thing it could have been: the three rows
        directly under the title bar, at the top of the navigation column, in
        an app with one navigation column. `Games` below it earns its heading
        because the list under it is a different kind of thing and can be long
        enough to need finding.
      -->
      <div class="space-y-0.5">
        <SidebarRow
          v-for="item in MAIN"
          :key="item.to"
          :to="item.to"
          :icon="item.icon"
          :label="item.label"
          :active="isActive(item.to)"
        />
      </div>

      <SidebarGames
        :active-games="props.activeGames"
        :disabled="props.disableGamesFilter"
        @select-game="emit('select-game', $event)"
      />
    </nav>

    <!--
      Separated by space rather than by a rule. A divider here says the three
      below it are a different kind of thing, and they are not: they are the
      same navigation, further down the list of things anybody opens.
    -->
    <div class="p-2 pb-4 space-y-0.5">
      <SidebarRow
        v-for="item in UTILITY"
        :key="item.to"
        :to="item.to"
        :icon="item.icon"
        :label="item.label"
        :active="isActive(item.to)"
      />
    </div>

    <!--
      Hairline border resize handle.
      Centered over the 1px right border with an 8px hit area so it is
      comfortable to grab, with keyboard support and visual feedback using the
      line-strong token on hover and drag.

      `inset-y-1` rather than `top-0 h-full`: the focus ring is a box shadow
      reaching 4px past the control, the shell's grid is `overflow-hidden`, and
      a handle flush with the top and bottom of the window had that ring sliced
      off at both ends on every route. The visual line takes the 8px back with
      `-inset-y-1`, so what is drawn still runs the full height and only the
      box the ring hangs off is inset.
    -->
    <div
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      :aria-valuenow="sidebarWidth"
      :aria-valuemin="MIN_SIDEBAR_WIDTH"
      :aria-valuemax="MAX_SIDEBAR_WIDTH"
      class="absolute inset-y-1 -right-1 w-2 cursor-col-resize z-20 group outline-none focus-visible:focus-ring"
      @pointerdown="startResize"
      @dblclick="resetWidth"
      @keydown="onKeyDown"
    >
      <div
        class="absolute -inset-y-1 left-1/2 -translate-x-1/2 w-px pointer-events-none transition-colors duration-150"
        :class="isDragging ? 'bg-line-strong' : 'group-hover:bg-line-strong group-focus-visible:bg-accent'"
      />
    </div>
  </aside>
</template>
