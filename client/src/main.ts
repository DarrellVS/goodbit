import { createApp } from 'vue';
import { createPinia } from 'pinia';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import App from './App.vue';
import './styles.css';
import './animations.css';
import './tooltip.css';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { initLocalMode } from './composables/useLocalMode';

// Consume the local-mode handoff param before the router reads the URL.
initLocalMode();

const app = createApp(App);
app.use(createPinia());
app.use(FloatingVue, {
  themes: {
    tooltip: {
      distance: 8,
      triggers: ['hover', 'focus'],
      delay: { show: 200, hide: 0 },
    },
  },
});
const auth = useAuthStore();
auth.init().then(() => {
  app.use(router);
  app.mount('#app');
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
});


