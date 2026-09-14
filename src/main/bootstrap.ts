/**
 * Runs before every other module in the main process. Keep it dependency-free.
 *
 * TypeORM depends on `app-root-path`, which works out "the project root" the
 * moment it is imported — and in an Electron main process it does so from
 * `process.argv[1]`. That is a script path when the app is started as
 * `electron .`, and it is *something* when Playwright launches the packaged
 * exe with its own flags, so every test passed. Double-click the installed
 * GoodBit.exe and `argv[1]` is undefined, `path.dirname(undefined)` throws, and
 * 1.1.0 died on the first screen with "A JavaScript error occurred in the main
 * process".
 *
 * `app-root-path` honours this variable and skips the guesswork. Nothing in
 * GoodBit reads the value; it only has to be a string.
 *
 * ESM evaluates imports depth-first in source order, so `import './bootstrap.js'`
 * as the first line of `index.ts` runs this before TypeORM is touched.
 */
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

if (!process.env.APP_ROOT_PATH) {
  process.env.APP_ROOT_PATH = process.resourcesPath ?? dirname(fileURLToPath(import.meta.url));
}
