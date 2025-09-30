import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles.css';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { initApiBase } from './axios';

const app = createApp(App);
app.use(createPinia());
const auth = useAuthStore();
Promise.all([
  initApiBase(),
  auth.init(),
]).then(() => {
  app.use(router);
  app.mount('#app');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
});


