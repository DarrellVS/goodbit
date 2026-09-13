import express from 'express';
import { AppDataSource } from '../data-source.js';
import { TagPattern } from '../entity/TagPattern.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { TagPatternDTO } from '../../../shared/index.js';

export const tagPatternsRouter = express.Router();

/** Guards against a rule that cannot compile being saved and then thrown on every match. */
function invalidExpression(patterns: unknown): string | null {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return 'A pattern needs at least one expression';
  }
  for (const source of patterns) {
    if (typeof source !== 'string' || !source.trim()) return 'An expression cannot be empty';
    try {
      new RegExp(source, 'i');
    } catch {
      return `"${source}" is not a valid expression`;
    }
  }
  return null;
}

tagPatternsRouter.get('/', asyncHandler(async (_req, res) => {
  const repo = AppDataSource.getRepository(TagPattern);
  const patterns = await repo.find({ order: { category: 'ASC', tag: 'ASC' } });
  res.json(patterns.map((p) => TagPatternDTO.fromEntity(p)));
}));

/** Create or replace the rule for a tag; the tag is the key. */
tagPatternsRouter.put('/:tag', asyncHandler(async (req, res) => {
  const tag = req.params.tag.trim().toLowerCase();
  if (!tag) return res.status(400).json({ error: 'A pattern needs a tag' });

  const { patterns, category } = req.body as { patterns?: unknown; category?: string };

  const problem = invalidExpression(patterns);
  if (problem) return res.status(400).json({ error: problem });

  const repo = AppDataSource.getRepository(TagPattern);
  const entity = repo.create({
    tag,
    patterns: JSON.stringify(patterns),
    category: category ?? 'General',
  });

  await repo.save(entity);
  res.json(TagPatternDTO.fromEntity(entity));
}));

tagPatternsRouter.delete('/:tag', asyncHandler(async (req, res) => {
  const repo = AppDataSource.getRepository(TagPattern);
  const existing = await repo.findOneBy({ tag: req.params.tag.trim().toLowerCase() });
  if (!existing) return res.status(404).json({ error: 'Pattern not found' });

  await repo.remove(existing);
  res.json({ ok: true });
}));

/**
 * Bulk import, used once to lift the rules out of the browser.
 *
 * `overwrite: false` (the default) keeps whatever is already stored, so running
 * the import twice cannot clobber edits made in between.
 */
tagPatternsRouter.post('/import', asyncHandler(async (req, res) => {
  const { patterns, overwrite = false } = req.body as {
    patterns?: Array<{ tag?: string; patterns?: unknown; category?: string }>;
    overwrite?: boolean;
  };

  if (!Array.isArray(patterns)) {
    return res.status(400).json({ error: 'Expected a list of patterns' });
  }

  const repo = AppDataSource.getRepository(TagPattern);
  const existing = new Set((await repo.find()).map((p) => p.tag));

  let imported = 0;
  let skipped = 0;
  const rejected: string[] = [];

  for (const entry of patterns) {
    const tag = (entry.tag ?? '').trim().toLowerCase();
    if (!tag) continue;

    if (existing.has(tag) && !overwrite) {
      skipped++;
      continue;
    }

    const problem = invalidExpression(entry.patterns);
    if (problem) {
      rejected.push(`${tag}: ${problem}`);
      continue;
    }

    await repo.save(
      repo.create({
        tag,
        patterns: JSON.stringify(entry.patterns),
        category: entry.category ?? 'General',
      }),
    );
    existing.add(tag);
    imported++;
  }

  res.json({ imported, skipped, rejected });
}));
