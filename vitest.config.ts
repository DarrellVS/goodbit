import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests, over the logic that does not need a screen or a GPU.
 *
 * The e2e suite drives the built app and is the only automated gate this repo
 * has had. It is also minutes long, which is the wrong shape for checking that
 * a threshold comparison uses the right operator, so most of the pure logic
 * here has only ever been checked by launching the app and looking at it.
 *
 * What belongs here: anything that takes values and returns values.
 * `decide.ts` turns a measurement into a verdict, `geometry.ts` turns an
 * anchor and a frame height into a pixel box, attribution turns a list of
 * foreground samples into a game name. None of it opens a file, and all of it
 * is load-bearing.
 *
 * What does not: anything that runs ffmpeg, touches a database, writes another
 * program's configuration or needs a window. Those have `scripts/*-check.mjs`
 * benches against real inputs, which is the honest way to test them, and the
 * e2e suite for the rest.
 */
export default defineConfig({
  plugins: [resolveNodeNextSpecifiers()],
  /**
   * Beside the checkout, not inside `node_modules`.
   *
   * A git worktree gets its `node_modules` as a junction to the main
   * checkout's, so that a second copy of the tree does not cost another 1.2 GB
   * and an install. Vite's default cache lives in there, which would make every
   * worktree write to one directory: harmless when they take turns and an
   * EBUSY when two agents run the suite at the same moment.
   */
  cacheDir: resolve(__dirname, '.vitest-cache'),
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      // See the stub: pure logic in main still reaches electron transitively.
      electron: resolve(__dirname, 'tests/unit/stubs/electron.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
    /**
     * The e2e directory holds Playwright specs, which define their own `test`
     * and would be collected and then fail on a missing browser.
     */
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});

/**
 * Main is ESM at runtime, so its relative imports carry `.js` extensions that
 * point at files which only exist as `.ts` before a build. `tsc` understands
 * that and Vite does not, so importing anything from `src/main` resolves to
 * nothing without this.
 *
 * Narrow on purpose: it only rewrites a relative specifier whose `.ts` sibling
 * is actually on disk, so a genuine `.js` file still resolves to itself.
 */
function resolveNodeNextSpecifiers() {
  return {
    name: 'goodbit:resolve-nodenext-specifiers',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || !source.startsWith('.') || !source.endsWith('.js')) return null;

      const candidate = resolve(importer, '..', source.replace(/\.js$/, '.ts'));
      return existsSync(candidate) ? candidate : null;
    },
  };
}
