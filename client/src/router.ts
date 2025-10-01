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
import { useAuthStore } from './stores/auth';
import ShellLayout from './layouts/ShellLayout.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginPage },
    {
      path: '/',
      component: ShellLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', name: 'clips', component: ClipsPage },
        { path: 'today', name: 'today', component: TodaysClipsPage },
        { path: 'tag-patterns', name: 'tag-patterns', component: TagPatternsPage },
        { path: 'stats', name: 'stats', component: StatsPage },
        { path: 'settings', name: 'settings', component: SettingsPage },
        { path: 'collections/:id', name: 'collection', component: CollectionPage, props: true },
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


