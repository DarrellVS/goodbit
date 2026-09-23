import { createApp } from 'vue';
import NotchApp from './components/Notch/NotchApp.vue';
import './styles.css';

/*
 * The notch window. No router, no store, no tooltips: one component that draws
 * whatever main sends it. The app's stylesheet comes along so the notch speaks
 * in the same tokens, and its body is transparent because only the black shape
 * is meant to be seen.
 */
document.documentElement.style.colorScheme = 'dark';
createApp(NotchApp).mount('#notch');
