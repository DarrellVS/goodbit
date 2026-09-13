import { createRouter, createWebHashHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import TodaysClipsPage from './views/TodaysClipsPage.vue';
import StatsPage from './views/StatsPage.vue';
import TagPatternsPage from './views/TagPatternsPage.vue';
import CollectionPage from './views/CollectionPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TrimPage from './views/TrimPage.vue';
import EditorPage from './views/EditorPage.vue';
import ClipDetailPage from './views/ClipDetailPage.vue';
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
            subtitle: 'Browse and manage your video clips'
          }
        },
        { 
          path: 'today', 
          name: 'today', 
          component: TodaysClipsPage,
          meta: { 
            title: "Today's Clips",
            subtitle: 'Clips captured today'
          }
        },
        { 
          path: 'tag-patterns', 
          name: 'tag-patterns', 
          component: TagPatternsPage,
          meta: { 
            title: 'Smart Tag Patterns',
            subtitle: 'Manage automatic tag suggestions'
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
          meta: { 
            title: 'Settings',
            subtitle: 'Customize your experience',
          }
        },
        { 
          path: 'collections/:id', 
          name: 'collection', 
          component: CollectionPage, 
          props: true,
          meta: { 
            title: 'Collection',
            subtitle: 'View collection clips'
          }
        },
        { 
          path: 'clips/:id', 
          name: 'clip-detail', 
          component: ClipDetailPage, 
          props: true,
          meta: { 
            title: 'Clip Details',
            subtitle: 'View clip information'
          }
        },
      ],
    },
    { path: '/trim/:id', name: 'trim', component: TrimPage, props: true },
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



