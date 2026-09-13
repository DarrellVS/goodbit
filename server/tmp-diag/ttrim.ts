import { TrimVideoAction } from '../src/actions/TrimVideoAction.js';
const SP = process.env.SP!;
async function main() {
  const a = new TrimVideoAction();
  console.log('nearestKeyframeAtOrBefore(1.0) =', await a.nearestKeyframeAtOrBefore(`${SP}/clip_b.orig.mp4`, 1.0));
  console.log('keyframesUpTo(5) =', await a.keyframesUpTo(`${SP}/clip_b.orig.mp4`, 5));
  console.log('result =', await a.execute({ inputPath: `${SP}/clip_b.orig.mp4`, startSec: 1.0, endSec: 4.0, outputPath: `${SP}/t2.mp4`, mode: 'lossless' }));
}
main().catch((e) => { console.error(e); process.exit(1); });
