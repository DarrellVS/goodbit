import { createRouter, createWebHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import SettingsPage from './views/SettingsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'clips', component: ClipsPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
  ],
});


