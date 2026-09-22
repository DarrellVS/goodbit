import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';

const shared = resolve('src/shared');

/**
 * What cannot be bundled, and therefore has to exist on disk at runtime.
 *
 * Everything else is bundled into the main chunk. Shipping `node_modules`
 * instead was tried and broke the packaged app: electron-builder rebuilds the
 * dependency tree while packing, and with npm's hoisting it placed
 * `call-bind-apply-helpers` only under `call-bind/node_modules/`, where the
 * top-level `dunder-proto` that needs it could not resolve it. Bundling removes
 * the whole class of problem and makes the app considerably smaller.
 */
const NATIVE_OR_BINARY = [
  // A .node addon cannot be bundled or loaded from inside an asar.
  'better-sqlite3',
  // These export the path to an executable, which must be a real file to spawn.
  'ffmpeg-static',
  'ffprobe-static',
];

export default defineConfig({
  main: {
    // The legacy importer exists for the one machine that ran the self-hosted
    // version, and must never reach anyone else. Opt-in rather than opt-out:
    // a plain build excludes it, so forgetting an environment variable cannot
    // ship it. Set GOODBIT_LEGACY_IMPORT=1 to test the migration.
    define: {
      __LEGACY_IMPORT__: JSON.stringify(process.env.GOODBIT_LEGACY_IMPORT === '1'),
    },
    resolve: {
      alias: { '@shared': shared, '@main': resolve('src/main') },
    },
    build: {
      rollupOptions: {
        external: ['electron', ...NATIVE_OR_BINARY],
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['electron'],
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
