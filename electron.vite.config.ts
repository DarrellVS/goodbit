import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

const shared = resolve('src/shared');

export default defineConfig({
  main: {
    // The legacy importer exists for the one machine that ran the self-hosted
    // version. False in a release build, so the bundler drops the branch
    // entirely rather than merely hiding it.
    define: {
      __LEGACY_IMPORT__: JSON.stringify(process.env.GOODBIT_RELEASE !== '1'),
    },
    // Native modules (sqlite3) and anything spawning a binary (ffmpeg-static)
    // must stay external — bundling them breaks the .node load and the path to
    // the packaged executable.
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': shared, '@main': resolve('src/main') },
    },
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: { '@shared': shared, '@renderer': resolve('src/renderer/src') },
    },
    plugins: [vue()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
      },
    },
  },
});
