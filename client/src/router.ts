import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import ClipsPage from './views/ClipsPage.vue';
import SettingsPage from './views/SettingsPage.vue';
import TrimPage from './views/TrimPage.vue';

const isElectron = typeof window !== 'undefined' && !!(window as any).api;

export const router = createRouter({
  history: isElectron ? createWebHashHistory() : createWebHistory(),
  routes: [
    { path: '/', name: 'clips', component: ClipsPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
    { path: '/trim/:id', name: 'trim', component: TrimPage, props: true },
  ],
});


