import { Baseline1789563600000 } from './1789563600000-Baseline.js';
import { GoodBits1789563600001 } from './1789563600001-GoodBits.js';
import { ClipLastOpenedAt1789563600002 } from './1789563600002-ClipLastOpenedAt.js';
import { ClipSearch1789563600003 } from './1789563600003-ClipSearch.js';
import { ClipSuggestedCount1789563600004 } from './1789563600004-ClipSuggestedCount.js';
import { ClipIsExport1789563600005 } from './1789563600005-ClipIsExport.js';

/**
 * Every migration, listed by hand and in order.
 *
 * TypeORM's usual answer is a glob over a migrations folder, which cannot work
 * here: electron-vite bundles main into a single file, so at runtime there is
 * no folder to glob and the array would come back empty. An empty migrations
 * array with `synchronize: false` is the worst of both worlds, a database that
 * is never created and never updated and reports no error, so these are
 * imported.
 *
 * **Order is by the timestamp in the class name**, which TypeORM parses off the
 * last 13 digits, not by the order of this array. Keeping the array in the same
 * order anyway, because a list that reads differently from how it runs is a
 * trap for whoever adds the next one.
 *
 * Adding one: a new file named `<epoch ms>-<Name>.ts` exporting
 * `class Name<epoch ms>`, imported here. `node -e "console.log(Date.now())"`
 * for the number.
 */
export const migrations = [
  Baseline1789563600000,
  GoodBits1789563600001,
  ClipLastOpenedAt1789563600002,
  ClipSearch1789563600003,
  ClipSuggestedCount1789563600004,
  ClipIsExport1789563600005,
];
