import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Enough of `electron` for the pure logic to import.
 *
 * `decide.ts` is described, correctly, as costing nothing and touching
 * nothing. It still reaches `electron` transitively: `model.ts` asks
 * `settings.ts` for `userDataDir()` to look for a trained model, and
 * `settings.ts` opens with `import { app } from 'electron'`. Outside a running
 * Electron process that import has nothing to resolve.
 *
 * The directory handed back is a fresh empty temp one, so `loadModel()` finds
 * no file and `score()` returns null, which is the shipped behaviour: the
 * hand-made rule is what runs when no model has been trained. A test that
 * wants the model path exercised should write into this directory on purpose.
 *
 * **This stub is a symptom, not a fix.** The dependency is real and it means
 * the decision logic cannot be exercised without a filesystem. Worth inverting
 * (pass the model in, rather than having `decide` go and find one) when
 * `decide.ts` is next opened, which 2.1 will do.
 */
const userData = mkdtempSync(join(tmpdir(), 'goodbit-unit-'));

export const app = {
  getPath(name: string): string {
    if (name === 'userData') return userData;
    return userData;
  },
  getName: () => 'GoodBit',
  getVersion: () => '0.0.0-test',
};

export default { app };
