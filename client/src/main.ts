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
import { registerServiceWorker } from './utils/serviceWorker';
import { initTheme } from './composables/useTheme';

// Before the first paint, or the wrong palette shows for a frame.
initTheme();

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
  window.addEventListener('load', registerServiceWorker);
});


