import { createRouter, createWebHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TrimPage from './views/TrimPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'clips', component: ClipsPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/trim/:id', name: 'trim', component: TrimPage, props: true },
  ],
});


