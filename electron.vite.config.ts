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
        /*
         * Two bridges, deliberately.
         *
         * `index` is the whole `window.goodbit` API, for the app's own window.
         * `toast` is two functions for the overlay card that sits over
         * somebody's game, which had no preload at all until it grew a button.
         * Handing that sandboxed page the app's API to use two of its calls
         * would be the opposite of what that window is for.
         */
        input: {
          index: resolve('src/preload/index.ts'),
          toast: resolve('src/preload/toast.ts'),
        },
        /*
         * CommonJS, and that is not a preference.
         *
         * The toast overlay runs with `sandbox: true`, and Electron loads a
         * sandboxed preload as CommonJS only: an ESM one throws on its first
         * `import` and is dropped **silently**, which is exactly how it
         * presented — the card rendered its button and `window.goodbitToast`
         * was undefined.
         *
         * Both entries rather than one, because two formats out of one rollup
         * build is not a thing, and CJS is the form that works in a sandboxed
         * preload and an unsandboxed one alike. `src/main/index.ts` points at
         * `.js` accordingly.
         */
        output: {
          format: 'cjs',
          /*
           * `.cjs`, not `.js`.
           *
           * The root `package.json` says `type: module`, and `out/` sits under
           * it, so a `.js` file there is read as ESM whatever is inside it and
           * a CommonJS preload dies on its first `require`. The extension is
           * the only thing that overrides that.
           */
          entryFileNames: '[name].cjs',
        },
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
