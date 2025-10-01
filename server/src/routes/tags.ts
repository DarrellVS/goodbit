import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Tag } from '../entity/Tag.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const tagsRouter = express.Router();

tagsRouter.get('/', asyncHandler(async (_req, res) => {
  const repo = AppDataSource.getRepository(Tag);
  const tags = await repo.createQueryBuilder('tag').orderBy('tag.name', 'ASC').getMany();
  res.json({ items: tags.map(t => t.name) });
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


