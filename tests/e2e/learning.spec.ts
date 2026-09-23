import { expect, test } from '@playwright/test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp, seedClips, seedSpikyClip, type TestApp, waitForClips } from './app';

/**
 * The parts that let the analysis be taught: every decision is kept, and a
 * model file, when present, takes over the verdict.
 */
test.describe('learning from what you keep', () => {
  let ctx: TestApp;

  const call = (method: string, path: string, body?: unknown, query?: unknown) =>
    ctx.page.evaluate(
      ([m, p, b, q]) =>
        window.goodbit!.apiRequest({
          method: m as string,
          path: p as string,
          body: b,
          query: (q ?? {}) as Record<string, unknown>,
        }),
      [method, path, body, query] as const,
    );

  test.beforeAll(async () => {
    ctx = await launchApp();
    seedClips(ctx.videosRoot, 'LearnGame', 1, 26);
    seedSpikyClip(ctx.videosRoot, 'LearnGame', 'spike');
    await waitForClips(ctx.page, 2);
  });

  test.afterAll(async () => {
    await ctx?.close();
  });

  test('a trim records where the person cut, next to what was suggested', async () => {
    const before = (await call('GET', '/clips/suggestions/labels')).body as { trims: number; total: number };

    const clips = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'LearnGame' })).body as {
      items: Array<{ id: number; filename: string }>;
    };
    const spike = clips.items.find((c) => c.filename.startsWith('spike'))!;
    expect(spike, 'the spiky fixture was not indexed').toBeTruthy();

    // Ask first, so there is a suggestion on record to compare the cut against.
    const suggested = (await call('GET', `/clips/${spike.id}/suggestions`)).body as {
      confident: boolean;
      window: { start: number; end: number } | null;
    };
    expect(suggested.confident).toBe(true);

    // Cut somewhere the suggestion did not point: a correction, not an acceptance.
    await call('POST', `/clips/${spike.id}/trim`, { startSec: 0.5, endSec: 4.5, mode: 'lossless' });

    const after = (await call('GET', '/clips/suggestions/labels')).body as {
      trims: number;
      total: number;
      withRanges: number;
    };

    expect(after.total).toBe(before.total + 1);
    expect(after.trims).toBe(before.trims + 1);
    expect(after.withRanges).toBeGreaterThanOrEqual(1);

    const rows = (await call('GET', '/clips/suggestions/labels/export')).body as Array<{
      clipId: number;
      source: string;
      chosenStartSec: number;
      suggestedStartSec: number | null;
      peakZ: number | null;
    }>;
    const row = rows.find((r) => r.clipId === spike.id)!;
    expect(row.source).toBe('trim');
    // The cut and the suggestion both survived, which is the whole point.
    expect(row.chosenStartSec).toBeGreaterThanOrEqual(0);
    expect(row.suggestedStartSec).not.toBeNull();
    expect(row.peakZ).not.toBeNull();
  });

  test('saying a suggestion is wrong is kept too', async () => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'LearnGame' })).body as {
      items: Array<{ id: number }>;
    };
    const id = clips.items[0].id;

    const before = (await call('GET', '/clips/suggestions/labels')).body as { rejected: number };
    const res = await call('POST', `/clips/${id}/suggestions/rejected`);
    expect(res.status).toBe(200);

    const after = (await call('GET', '/clips/suggestions/labels')).body as { rejected: number };
    expect(after.rejected).toBe(before.rejected + 1);
  });

  test('the Wrong button on the banner is what records a rejection', async () => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'LearnGame' })).body as {
      items: Array<{ id: number; filename: string }>;
    };
    // The spiky clip was trimmed in the first test, so it may not be confident
    // any more; re-seed one that is.
    seedSpikyClip(ctx.videosRoot, 'LearnGame', 'spike2');
    await waitForClips(ctx.page, 3, { reload: false });
    const fresh = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'LearnGame' })).body as {
      items: Array<{ id: number; filename: string }>;
    };
    const spike = fresh.items.find((c) => c.filename.startsWith('spike2')) ?? clips.items[0];

    const before = (await call('GET', '/clips/suggestions/labels')).body as { rejected: number };

    await ctx.page.evaluate((id) => {
      window.location.hash = `#/trim/${id}`;
    }, spike.id);

    const wrong = ctx.page.getByRole('button', { name: /^wrong$/i });
    await expect(wrong, 'no suggestion banner appeared for the spiky clip').toBeVisible({ timeout: 15_000 });
    await wrong.click();
    await expect(ctx.page.getByRole('button', { name: /^noted$/i })).toBeVisible();

    await ctx.page.waitForTimeout(500);
    const after = (await call('GET', '/clips/suggestions/labels')).body as { rejected: number };
    expect(after.rejected).toBe(before.rejected + 1);
  });

  test('fitting is refused honestly until there is enough, and a model can be put back', async () => {
    const summary = (await call('GET', '/clips/suggestions/labels')).body as {
      usable: number;
      needed: number;
      automatic: boolean;
      model: unknown;
    };
    expect(summary.needed).toBeGreaterThanOrEqual(60);
    expect(summary.usable).toBeLessThan(summary.needed);
    expect(summary.automatic).toBe(true);

    const attempt = (await call('POST', '/clips/suggestions/model/fit')).body as {
      fitted: boolean;
      reason?: string;
      examples?: number;
    };
    expect(attempt.fitted).toBe(false);
    expect(attempt.reason).toMatch(/of 60 examples|one-sided/);

    // A model placed by hand is removable from the app.
    const modelPath = join(ctx.dataDir, 'highlight-model.json');
    const features = ['peakZ', 'spreadLu', 'eventSec', 'position', 'durationSec', 'busyness', 'runnerUpZ'];
    writeFileSync(
      modelPath,
      JSON.stringify({ version: 1, features, weights: features.map(() => 0), bias: 5, threshold: 0.5 }),
    );
    await ctx.page.waitForTimeout(50);
    const withModel = (await call('GET', '/clips/suggestions/labels')).body as { model: unknown };
    expect(withModel.model).not.toBeNull();

    const removed = (await call('DELETE', '/clips/suggestions/model')).body as { removed: boolean };
    expect(removed.removed).toBe(true);
    const without = (await call('GET', '/clips/suggestions/labels')).body as { model: unknown };
    expect(without.model).toBeNull();
  });

  test('a model file takes over the verdict, and is ignored when it does not fit', async () => {
    const clips = (await call('GET', '/clips', undefined, { pageSize: 50, game: 'LearnGame' })).body as {
      items: Array<{ id: number; filename: string }>;
    };
    // The flat tone: the rule refuses it, so a model that accepts everything
    // is unambiguous evidence that the model decided.
    const flat = clips.items.find((c) => !c.filename.startsWith('spike'))!;

    const byRule = (await call('GET', `/clips/${flat.id}/suggestions`)).body as {
      confident: boolean;
      basis: string;
    };
    expect(byRule.basis).toBe('rule');
    expect(byRule.confident).toBe(false);

    const modelPath = join(ctx.dataDir, 'highlight-model.json');
    const features = ['peakZ', 'spreadLu', 'eventSec', 'position', 'durationSec', 'busyness', 'runnerUpZ'];

    // Weights of zero and a large positive bias: "yes" to everything.
    writeFileSync(
      modelPath,
      JSON.stringify({ version: 1, features, weights: features.map(() => 0), bias: 5, threshold: 0.5, examples: 999 }),
    );
    // The file is re-read on mtime change; give the clock a tick to move.
    await ctx.page.waitForTimeout(50);

    const byModel = (await call('GET', `/clips/${flat.id}/suggestions`)).body as {
      confident: boolean;
      basis: string;
      window: unknown;
    };
    expect(byModel.basis).toBe('model');
    expect(byModel.confident).toBe(true);
    expect(byModel.window).not.toBeNull();

    // A model trained on a different feature list must not be trusted.
    writeFileSync(
      modelPath,
      JSON.stringify({ version: 1, features: ['somethingElse'], weights: [1], bias: 5, threshold: 0.5 }),
    );
    await ctx.page.waitForTimeout(50);

    const mismatched = (await call('GET', `/clips/${flat.id}/suggestions`)).body as { basis: string };
    expect(mismatched.basis).toBe('rule');

    unlinkSync(modelPath);
  });
});
