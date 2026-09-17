import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Tag } from '../entity/Tag.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { TagDTO } from '@shared/index.js';
import { Clip } from '../entity/Clip.js';
import { getHiddenGameNames } from '../utils/hiddenGames.js';

export const tagsRouter = express.Router();

/**
 * Every tag, with how many visible clips carry it.
 *
 * One grouped query rather than one per tag: a library with forty tags would
 * otherwise open its filter panel on forty round trips. Counted from the clip
 * side and through the same hidden-games rule the library list uses, so the
 * number beside a tag is the number of rows choosing it would leave.
 */
tagsRouter.get('/', asyncHandler(async (_req, res) => {
  const repo = AppDataSource.getRepository(Tag);
  const tags = await repo.createQueryBuilder('tag').orderBy('tag.name', 'ASC').getMany();

  const hidden = await getHiddenGameNames();
  let counter = AppDataSource.getRepository(Clip)
    .createQueryBuilder('clip')
    .innerJoin('clip.tags', 'tag')
    .select('tag.id', 'tagId')
    .addSelect('COUNT(clip.id)', 'count')
    .groupBy('tag.id');
  if (hidden.length > 0) {
    counter = counter.where('clip.game NOT IN (:...hiddenGames)', { hiddenGames: hidden });
  }

  const rows = await counter.getRawMany<{ tagId: number; count: number | string }>();
  const counts = new Map(rows.map((row) => [Number(row.tagId), Number(row.count)]));

  const dtos = tags.map((t) => TagDTO.fromEntity(t, counts.get(t.id) ?? 0));
  res.json({ items: dtos });
}));

tagsRouter.delete('/:name', asyncHandler(async (req, res) => {
  const tagName = req.params.name;
  const repo = AppDataSource.getRepository(Tag);
  
  // Find the tag
  const tag = await repo.findOne({ where: { name: tagName } });
  if (!tag) {
    return res.status(404).json({ error: 'Tag not found' });
  }
  
  // Delete the tag (this will automatically remove it from all clips due to the many-to-many relationship)
  await repo.remove(tag);
  
  res.json({ success: true });
}));


