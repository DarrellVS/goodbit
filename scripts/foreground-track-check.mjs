/**
 * Prove the foreground helper can tell a running process from a closed one.
 *
 * The sweep that fires when a game closes rests entirely on this: the samples
 * cannot tell an alt-tab from an exit, so the helper holds an open handle to
 * one pid and reports `alive` or `exited` beside every sample. A held handle
 * is also what stops Windows reusing the pid under the question.
 *
 * None of that is checkable by a typecheck and none of it is checkable without
 * Windows, so it is checked here, against a real process this script starts and
 * ends itself:
 *
 *   node scripts/foreground-track-check.mjs
 *
 * Read-only as far as the library is concerned. It compiles the helper into a
 * throw-away `GOODBIT_USER_DATA`, so the installed app's copy is untouched.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sandbox = mkdtempSync(join(tmpdir(), 'goodbit-track-'));
process.env.GOODBIT_USER_DATA = sandbox;

const entry = join(process.cwd(), 'tmp', 'track-entry.ts');
const bundle = join(process.cwd(), 'tmp', 'track-bundle.mjs');
writeFileSync(
  entry,
  [
    "export {",
    "  onForegroundSample,",
    "  startForegroundHistory,",
    "  stopForegroundHistory,",
    "  trackProcess,",
    "  trackedProcessState,",
    "} from '../src/main/services/capture/foregroundHistory.js';",
    '',
  ].join('\n'),
  'utf-8',
);

const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: bundle,
  logLevel: 'warning',
  // `settings.ts` opens with `import { app } from 'electron'` on its way to
  // `userDataDir()`, and there is no Electron here. The same stand-in the unit
  // suite uses, for the same reason.
  alias: { electron: join(process.cwd(), 'tests', 'unit', 'stubs', 'electron.ts') },
});

const { startForegroundHistory, stopForegroundHistory, trackProcess, trackedProcessState } =
  await import(pathToFileURL(bundle).href);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** What the helper says, once it has said anything about this pid. */
async function stateWithin(pid, ms) {
  const until = Date.now() + ms;
  for (;;) {
    const answer = trackedProcessState();
    if (answer && answer.pid === pid) return answer.state;
    if (Date.now() > until) return null;
    await wait(200);
  }
}

console.log(`sandbox ${sandbox}`);
console.log('compiling the helper and starting to sample...');
await startForegroundHistory();
await wait(2500);

/*
 * Something harmless that stays up until it is told not to.
 *
 * Not `cmd /c timeout`, which was the first try: `timeout` refuses to run with
 * redirected input and exits immediately, so the pid was already gone by the
 * time it was handed over and the helper honestly reported `unknown`. A node
 * that sits on a timer is a process that is definitely alive.
 */
const victim = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
  windowsHide: true,
  stdio: 'ignore',
});
console.log(`watching pid ${victim.pid}`);
victim.on('exit', (code, signal) => console.log(`victim exited: code=${code} signal=${signal}`));
trackProcess(victim.pid);
// Asked of Node as well, so a failure below is about the helper rather than
// about a victim that had already died. The first run of this check reported
// `unknown` for exactly that reason: `cmd /c timeout` refuses redirected input
// and exits immediately.
try {
  process.kill(victim.pid, 0);
  console.log('node agrees it is running');
} catch (error) {
  console.log(`node says it is gone: ${error.code}`);
}

const alive = await stateWithin(victim.pid, 6000);
console.log(`while it is running: ${alive}`);

victim.kill();
await wait(2500);
const after = trackedProcessState();
console.log(`after it is killed:  ${after ? after.state : 'no answer'}`);

// An untracked helper says nothing at all, which is what the watcher relies on
// between sessions.
trackProcess(0);
await wait(1500);
console.log(`once untracked:      ${trackedProcessState() ? 'still reporting' : 'silent'}`);

stopForegroundHistory();

const ok = alive === 'alive' && after?.state === 'exited' && trackedProcessState() === null;
console.log(ok ? '\nPASS' : '\nFAIL');
process.exit(ok ? 0 : 1);
