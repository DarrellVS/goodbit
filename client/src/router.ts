import { createRouter, createWebHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import TodaysClipsPage from './views/TodaysClipsPage.vue';
import StatsPage from './views/StatsPage.vue';
import TagPatternsPage from './views/TagPatternsPage.vue';
import CollectionPage from './views/CollectionPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TrimPage from './views/TrimPage.vue';
import EditorPage from './views/EditorPage.vue';
import LoginPage from './views/LoginPage.vue';
import ClipDetailPage from './views/ClipDetailPage.vue';
import { useAuthStore } from './stores/auth';
import ShellLayout from './layouts/ShellLayout.vue';

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean;
    title?: string;
    subtitle?: string;
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage },
    {
      path: '/',
      component: ShellLayout,
      meta: { requiresAuth: true },
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
      ],
    },
    { path: '/trim/:id', name: 'trim', component: TrimPage, props: true, meta: { requiresAuth: true } },
    { path: '/editor', name: 'editor', component: EditorPage, meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (auth.loading) return true;
  if (to.meta?.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.name === 'login' && auth.user) {
    return { name: 'clips' };
  }
  return true;
});


