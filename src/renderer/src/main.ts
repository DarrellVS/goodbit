import { createApp } from 'vue';
import { createPinia } from 'pinia';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import App from './App.vue';
import './styles.css';
import './animations.css';
import './tooltip.css';
import { router } from './router';
import { initTheme } from '@renderer/composables/ui/useTheme';
import { TITLEBAR_HEIGHT } from '@shared/index';

// Before the first paint, or the wrong palette shows for a frame.
initTheme();

// The drawn bar and the strip main reserves for the caption buttons have to be
// the same height, so both read it from one place.
document.documentElement.style.setProperty('--titlebar-height', `${TITLEBAR_HEIGHT}px`);

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
app.use(router);
app.mount('#app');


