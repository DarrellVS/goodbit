import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // src/utils/serviceWorker.ts registers the worker and owns the update flow,
      // so don't also inject a bare registerSW.js into index.html.
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      includeAssets: ['favicon.ico'],
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
    }),
  ],
  resolve: {
    alias: {
      '@filmpje/shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://192.168.178.28:4000',
        changeOrigin: true,
      },
    },
  },
});


