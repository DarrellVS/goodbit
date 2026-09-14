/**
 * Start the packaged exe the way a person does — by itself, no arguments — and
 * see whether it lives.
 *
 * The end-to-end suite launches the packaged build through Playwright, which
 * passes its own flags, and that hid the one failure mode a user hits first:
 * `process.argv[1]` is undefined on a double-click and a dependency of TypeORM
 * crashed on it before a window existed. This is the check that would have
 * caught 1.1.0.
 *
 *   node scripts/smoke-packaged.mjs                  # release/win-unpacked/GoodBit.exe
 *   node scripts/smoke-packaged.mjs "C:\path\to\GoodBit.exe"
 *
 * Passes when, started against a throw-away data folder, the process is still
 * alive after the boot sequence and has written `schemaVersion` to its
 * settings — which only happens after the database opened.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2] ?? join(process.cwd(), 'release', 'win-unpacked', 'GoodBit.exe');
if (!existsSync(exe)) {
  console.error(`no exe at ${exe}`);
  process.exit(2);
}

const base = mkdtempSync(join(tmpdir(), 'goodbit-smoke-'));
const dataDir = join(base, 'data');
const videosRoot = join(base, 'videos');
mkdirSync(dataDir, { recursive: true });
mkdirSync(videosRoot, { recursive: true });
mkdirSync(join(base, 'music'), { recursive: true });
writeFileSync(
  join(dataDir, 'settings.json'),
  JSON.stringify({
    videosRoot,
    audioRoot: join(base, 'music'),
    publisherBaseUrl: '',
    startAtLogin: false,
    keepRunningInTray: false,
    migratedFromWebApp: false,
  }),
);

const child = spawn(exe, [], {
  env: { ...process.env, GOODBIT_USER_DATA: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: false,
});

let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

let exited = null;
let killed = false;
child.on('exit', (code) => {
  if (!killed) exited = code ?? -1;
});

const deadline = Date.now() + 25_000;
let booted = false;

while (Date.now() < deadline && exited === null) {
  await new Promise((r) => setTimeout(r, 1000));
  // Either the service says it is up, or the database has been opened and the
  // version stamped — both only happen after the whole boot sequence.
  if (output.includes('[service] ready')) {
    booted = true;
    break;
  }
  try {
    const settings = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf-8'));
    if (settings.schemaVersion) {
      booted = true;
      break;
    }
  } catch {
    /* not yet */
  }
}

if (exited === null) {
  killed = true;
  child.kill();
}
await new Promise((r) => setTimeout(r, 1500));
rmSync(base, { recursive: true, force: true });

if (exited !== null) {
  console.error(`FAIL: the app exited with code ${exited} before it finished booting`);
  if (output.trim()) console.error(output.slice(-2000));
  process.exit(1);
}

if (!booted) {
  console.error('FAIL: the app stayed alive but never opened its database');
  if (output.trim()) console.error(output.slice(-2000));
  process.exit(1);
}

console.log(`ok: ${exe} boots on its own`);
