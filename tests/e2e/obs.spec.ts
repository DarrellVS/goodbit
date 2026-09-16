import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { launchApp, type TestApp } from './app';

/**
 * Reading somebody else's OBS.
 *
 * The writing half cannot be tested here: it refuses to run while OBS is open,
 * and it would be writing into whatever OBS the machine running the tests
 * happens to have. The reading half is where
 * the judgements live, and every one of these was a bug first.
 *
 * `GOODBIT_OBS_DIR` points the whole subsystem at a directory of fixtures, so
 * none of this goes near a real installation.
 */
test.describe('reading OBS', () => {
  let ctx: TestApp;
  let obsDir: string;

  const call = (method: string, path: string, body?: unknown) =>
    ctx.page.evaluate(
      ([m, p, b]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: {},
        }),
      [method, path, body] as const,
    );

  /** An OBS that has run once and been left alone: a profile, an empty scene. */
  function writeFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'goodbit-obs-fixture-'));
    mkdirSync(join(dir, 'basic', 'profiles', 'Untitled'), { recursive: true });
    mkdirSync(join(dir, 'basic', 'scenes'), { recursive: true });

    writeFileSync(
      join(dir, 'basic', 'profiles', 'Untitled', 'basic.ini'),
      [
        '[General]',
        'Name=Untitled',
        '',
        '[Output]',
        'Mode=Simple',
        '',
        '[SimpleOutput]',
        'FilePath=D:\\\\Somewhere\\\\Else',
        'RecRB=false',
        '',
        '[Video]',
        'BaseCX=1920',
        'BaseCY=1080',
        'ColorSpace=709',
        '',
      ].join('\n'),
    );

    writeFileSync(
      join(dir, 'basic', 'scenes', 'Untitled.json'),
      JSON.stringify({
        name: 'Untitled',
        sources: [{ id: 'scene', name: 'Scene', settings: { items: [] } }],
        modules: {},
      }),
    );

    writeFileSync(
      join(dir, 'user.ini'),
      ['[Basic]', 'Profile=Untitled', 'ProfileDir=Untitled', 'SceneCollectionFile=Untitled', ''].join(
        '\n',
      ),
    );

    return dir;
  }

  test.beforeAll(async () => {
    obsDir = writeFixture();
    ctx = await launchApp({ env: { GOODBIT_OBS_DIR: obsDir } });
    await ctx.page.waitForTimeout(3000);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('names what is wrong, and does not call an empty collection scenes', async () => {
    const status = (await call('GET', '/obs/status')).body as {
      installed: boolean;
      ready: boolean;
      hasScenes: boolean;
      findings: Array<{ id: string; level: string }>;
    };

    // The fixture has a profile with the buffer off, pointed somewhere else.
    const ids = status.findings.map((finding) => finding.id);
    expect(ids).toContain('buffer-off');
    expect(ids).toContain('hotkey-missing');
    expect(ids).toContain('path-mismatch');
    expect(status.ready).toBe(false);

    /*
     * One empty scene is OBS's own starting point, not somebody's work. Read
     * as "they have scenes", the setup skipped making its own and OBS opened
     * on a blank one complaining it had no video sources.
     */
    expect(status.hasScenes).toBe(false);
  });

  test('the plan says which files it would write, and writes none of them', async () => {
    const plan = (await call('POST', '/obs/plan', {})).body as {
      changes: Array<{ file: string; summary: string[]; details: Array<{ key: string }> }>;
      blockers: string[];
    };

    const files = plan.changes.map((change) => change.file);
    expect(files.some((file) => file.includes('GoodBit') && file.endsWith('basic.ini'))).toBe(true);

    const profile = plan.changes.find((change) => change.file.endsWith('basic.ini'));
    const keys = profile?.details.map((detail) => detail.key) ?? [];

    // The buffer, and a canvas: OBS fills a new profile with 1080p30 otherwise.
    expect(keys).toContain('[SimpleOutput] RecRB');
    expect(keys).toContain('[Video] BaseCX');

    // The output's hotkey, not the frontend's, which binds nothing on OBS 31.
    expect(keys).toContain('[Hotkeys] ReplayBuffer');

    // Every change is a sentence before it is a key.
    for (const change of plan.changes) expect(change.summary.length).toBeGreaterThan(0);

    // And nothing was written: the fixture still has one profile.
    const after = (await call('GET', '/obs/status')).body as { goodbitProfileExists: boolean };
    expect(after.goodbitProfileExists).toBe(false);
  });
});
