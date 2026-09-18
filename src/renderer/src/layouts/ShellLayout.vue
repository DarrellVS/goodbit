<template>
  <!--
    Resizable sidebar column, then everything else. Defaults to 232px.

    The design also fixes a 1240px cap on the content column, and that one is
    deliberately not taken. A reading measure is a typographic decision about
    lines of text; this column is a grid of 21:9 thumbnails, and on the 3440
    wide screen these recordings come off, a 1240px cap would leave two thirds
    of the monitor empty and shrink every card to a third of the width it could
    have. The 48px gutters that go with it are taken.
  -->
  <div
    class="h-full min-h-0 overflow-hidden grid grid-rows-1"
    :style="{ gridTemplateColumns: `${sidebarWidth}px 1fr` }"
    @dragenter="fileImport.handleDragEnter"
    @dragleave="fileImport.handleDragLeave"
    @dragover="fileImport.handleDragOver"
    @drop="fileImport.handleDrop"
  >
    <Sidebar
      :active-games="clipsStore.selectedGames"
      :disable-games-filter="disableGamesFilter"
      @select-game="selectGame"
    />

    <div class="flex flex-col h-full overflow-hidden">
      <!--
        Why the library is empty, said above whatever screen you are on.

        It used to sit inside the library, under the filter row, which put a
        notice about the app's recording setup in the middle of a list of
        clips. Settings has the whole diagnostic and is the one screen that
        does not need it, since its Recording section is the diagnostic.
      -->
      <ObsNotReadyBanner v-if="router.currentRoute.value.name !== 'settings'" />

      <!--
        A screen gets a header when it asks for one, by carrying a `title` in
        its route meta. Settings does not: it is two columns and the right one
        already says which section it is showing. The editor does not either,
        and was drawing its own underneath this one.
      -->
      <PageHeader
        v-if="router.currentRoute.value.meta.title"
        v-model:search="searchText"
        :compact="scrolled"
        :title="(router.currentRoute.value.meta.title as string)"
        :subtitle="(router.currentRoute.value.meta.subtitle as string)"
      />

      <!--
        Where a screen puts the row that describes its list.

        The library's filter row and its collections belong at the top of the
        window whatever the list underneath is doing, and the obvious way to
        get that is `position: sticky` inside the scrollport. It works and it
        costs the scroll position: measured frame by frame, the instant a clip
        panel mounts, Chromium resets a scroller that holds a sticky child to
        zero, before any resize and with nothing in the app touching it. The
        library silently went back to the top behind every panel that opened
        over it.

        Above the scrollport instead. A sticky element at `top-0` sits exactly
        where this does at every scroll position, so nothing looks different,
        and the scroller no longer holds anything sticky.
      -->
      <div id="library-band"></div>

      <!--
        The one thing that scrolls, which is why the header above it can shrink
        as it does: `useScrolledPage` follows this element and every screen
        inside it reads the same flag.

        **`overflow-anchor: none` is load-bearing.** Chromium keeps what you
        are looking at still when content above it changes size, by moving the
        scroll position to match. The sticky band at the top of the library
        changes size *because of* the scroll position, so the compensation fed
        straight back into the thing that caused it and the header bounced
        between its two sizes for as long as you left the wheel near the top.
        Switching anchoring off is what breaks the circuit; the thresholds in
        `useScrolledPage` are the second line of defence.
      -->
      <main ref="scroller" class="flex-1 overflow-y-auto scroll-p-1.5 [overflow-anchor:none]">
        <RouterView />
      </main>
    </div>

    <!--
      One instance for the whole app, so a clip can be opened from the library,
      a collection or today's clips and land in the same layer over whichever
      of them you were looking at.
    -->
    <ClipDetailModal />
    <CollectionDetailModal />

    <CommandPalette v-model:open="showCommandPalette" />

    <FileDropZone
      :is-dragging="fileImport.isDragging.value"
      :is-uploading="fileImport.isUploading.value"
      :upload-progress="fileImport.uploadProgress.value"
    />
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch, computed } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import ClipDetailModal from '@renderer/components/ClipDetail/ClipDetailModal.vue';
import CollectionDetailModal from '@renderer/components/Collection/CollectionDetailModal.vue';
import { useClipsStore } from '@renderer/stores/clips';
import { useGamesStore } from '@renderer/stores/games';
import { useTagsStore } from '@renderer/stores/tags';
import { useKeyboardShortcuts } from '@renderer/composables/ui/useKeyboardShortcuts';
import { useFileImport } from '@renderer/composables/clips/useFileImport';
import PageHeader from '@renderer/components/Shell/PageHeader.vue';
import Sidebar from '@renderer/components/Shell/Sidebar.vue';
import ObsNotReadyBanner from '@renderer/components/Obs/ObsNotReadyBanner.vue';
import FileDropZone from '@renderer/components/Library/FileDropZone.vue';
import CommandPalette from '@renderer/components/Shell/CommandPalette.vue';
import { useServiceEvents } from '@renderer/composables/app/useServiceEvents';
import { usePublishProgress } from '@renderer/composables/clips/usePublishProgress';
import { useCollectionsStore } from '@renderer/stores/collections';
import { rememberScrollFor, restoreScrollFor } from '@renderer/utils/scroll';
import { useScrolledPage } from '@renderer/composables/ui/useScrolledPage';
import { useSidebarResize } from '@renderer/composables/ui/useSidebarResize';

const { sidebarWidth } = useSidebarResize();

const gamesStore = useGamesStore();
const tagsStore = useTagsStore();
const clipsStore = useClipsStore();
const fileImport = useFileImport();
const searchText = ref('');
const router = useRouter();

const scroller = ref<HTMLElement | null>(null);
const { scrolled, watchScroller } = useScrolledPage();
let unwatchScroll: (() => void) | null = null;

/*
 * The games list filters the library, so it is live on the screens that are
 * the library.
 *
 * A collection used to be one of them, first by route name and then by asking
 * the layer. It is neither now: a collection owns its own game filter, set
 * from the popover in its own header, because a list somebody made by hand
 * should not arrive narrowed by whatever the sidebar behind the scrim was on.
 */
const disableGamesFilter = computed(() => {
  const routeName = router.currentRoute.value.name;
  return !(routeName === 'clips' || routeName === 'today');
});

/**
 * One game, replacing whatever was there.
 *
 * The filter holds several and the popover is where more than one is chosen.
 * A row in this list is a place rather than a checkbox, so pressing one means
 * "show me this", including when it is already the only one lit.
 */
function selectGame(g: string): void {
  clipsStore.setGame(g);
}

const collectionsStore = useCollectionsStore();

// The watcher indexes clips while this window is open; without this the list
// shows whatever was there when it loaded.
useServiceEvents();

// Publishing narrates itself in a toast that stays put; mounted here so a
// publish started in the library is still reported after navigating away.
usePublishProgress();
const showCommandPalette = ref(false);

/**
 * Ctrl+K gets its own listener.
 *
 * The shortcut registry matches on `event.code` alone with no notion of
 * modifiers, so registering this there would fire on a bare K as well.
 */
function handlePaletteKey(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  if (event.code !== 'KeyK') return;
  event.preventDefault();
  showCommandPalette.value = !showCommandPalette.value;
}

/*
 * Every screen remembers where it was scrolled to.
 *
 * Leaving the library for Settings and coming back used to land at the top,
 * which after scrolling through several weeks of recordings means doing the
 * whole journey again.
 */
router.beforeEach((_to, from) => {
  rememberScrollFor(from.fullPath);
  return true;
});

router.afterEach((to) => {
  restoreScrollFor(to.fullPath);
});

onMounted(() => {
  document.addEventListener('keydown', handlePaletteKey);
  unwatchScroll = watchScroller(scroller.value);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', handlePaletteKey);
  unwatchScroll?.();
  unwatchScroll = null;
});

onMounted(async () => {
  // The palette offers collections as well as games and tags, so they have to
  // be loaded for it to find them.
  await Promise.all([gamesStore.fetchGames(), tagsStore.fetchTags(), collectionsStore.fetchCollections()]);
});

watch(searchText, (q) => {
  clipsStore.setSearch(q);
});

watch(disableGamesFilter, (isDisabled) => {
  if (isDisabled && clipsStore.selectedGames.length) {
    clipsStore.setGames([]);
  }
});

useKeyboardShortcuts({
  actions: {
    'nav-library': () => {
      if (router.currentRoute.value.name !== 'clips') {
        router.push('/');
      }
    },
    'nav-settings': () => {
      if (router.currentRoute.value.name !== 'settings') {
        router.push('/settings');
      }
    },
    'focus-search': (event) => {
      event.preventDefault();
      const searchInput = document.getElementById('global-search-input') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
  },
});
</script>
