import { createRouter, createWebHashHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import { useClipDetail } from '@renderer/composables/clips/useClipDetail';
import { useCollectionDetail } from '@renderer/composables/library/useCollectionDetail';
import TodaysClipsPage from './views/TodaysClipsPage.vue';
import StatsPage from './views/StatsPage.vue';
import TagPatternsPage from './views/TagPatternsPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import EditorPage from './views/EditorPage.vue';
import ShellLayout from './layouts/ShellLayout.vue';
import WelcomePage from './views/WelcomePage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    subtitle?: string;
  }
}

export const router = createRouter({
  // Hash history, not web history: a packaged renderer is loaded from file://,
  // where a path-based route has no server to fall back to and a reload lands
  // on a missing file.
  history: createWebHashHistory(),
  routes: [
    // Outside the shell: with no clips folder chosen there is nothing for a
    // sidebar to list.
    { path: '/welcome', name: 'welcome', component: WelcomePage },
    {
      path: '/',
      component: ShellLayout,
      children: [
        {
          path: '',
          name: 'clips',
          component: ClipsPage,
          meta: {
            title: 'My Library',
            // The one line the app gets to explain itself on launch. It used
            // to describe the grid people were already looking at, and never
            // mentioned the thing the product is named after.
            subtitle: 'Everything OBS recorded. Open one and GoodBit points at the good bit.'
          }
        },
        {
          path: 'today',
          name: 'today',
          component: TodaysClipsPage,
          meta: {
            title: "Today's Clips",
            subtitle: 'Review what you recorded today, one at a time'
          }
        },
        {
          path: 'tag-patterns',
          name: 'tag-patterns',
          component: TagPatternsPage,
          meta: {
            title: 'Smart Tag Patterns',
            // Says what is matched and when, because the old subtitle,
            // "Manage automatic tag suggestions", implied tags were being
            // applied on their own. They are not: these only ever offer a tag
            // in the tag popover, and only for words you have written.
            subtitle: 'Words that offer a tag when you open the tag box on a clip'
          }
        },
        {
          path: 'stats',
          name: 'stats',
          component: StatsPage,
          meta: {
            title: 'Statistics',
            subtitle: 'View your clip statistics'
          }
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsPage,
          /*
           * No `title`, and that is what stops the shell drawing a header.
           *
           * Settings is two columns under the title bar: the sections on the
           * left and the section you picked on the right, which carries its
           * own name as its heading. A header over both of them repeated that
           * name one line higher and pushed the list a third of the way down
           * the window.
           */
          meta: {},
        },
        /*
         * A collection is a layer over the library now, for the same reasons a
         * clip is: it is a closer look at part of a list you are still
         * browsing, and as a page it drew three stacked headers before showing
         * a single clip.
         *
         * The route stays, because the command palette and any saved link use
         * it, but it renders nothing of its own: it opens the layer and steps
         * back to the library, so the collection appears over the grid exactly
         * as it would have from a card.
         */
        {
          path: 'collections/:id',
          name: 'collection',
          redirect: (to) => {
            const id = Number(to.params.id);
            if (Number.isFinite(id) && id > 0) useCollectionDetail().open(id);
            return { name: 'clips' };
          },
        },
        /*
         * A clip's details are a layer over the library now, not a page.
         *
         * The route stays, because links to it exist and a deep link should
         * still work, but it no longer renders anything of its own: it opens
         * the layer and redirects to the library, so the clip appears on top of
         * the grid exactly as it would have if you had clicked the tile.
         */
        {
          path: 'clips/:id',
          name: 'clip-detail',
          redirect: (to) => {
            const id = Number(to.params.id);
            if (Number.isFinite(id) && id > 0) useClipDetail().open(id);
            return { name: 'clips' };
          },
        },
      ],
    },
    /*
     * Trimming is a face of the clip layer now, not a page. The route stays so
     * a link to it still works, and opens the layer straight onto the trimmer.
     */
    {
      path: '/trim/:id',
      name: 'trim',
      redirect: (to) => {
        const id = Number(to.params.id);
        if (Number.isFinite(id) && id > 0) useClipDetail().open(id, 'trim');
        return { name: 'clips' };
      },
    },
    { path: '/editor', name: 'editor', component: EditorPage },
  ],
});

/**
 * With nowhere to look for clips, every screen is empty and none of them say
 * why. The first run goes to the folder picker instead.
 */
router.beforeEach(async (to) => {
  if (to.name === 'welcome') return true;

  const settings = await window.goodbit?.getSettings();
  if (settings && !settings.videosRoot) return { name: 'welcome' };

  return true;
});



