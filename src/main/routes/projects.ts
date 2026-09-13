import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Project } from '../entity/Project.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ProjectDTO } from '@shared/index.js';

export const projectsRouter = express.Router();

/** Keep one timeline from growing without limit; a draft is small by nature. */
const MAX_TIMELINE_BYTES = 2 * 1024 * 1024;

function serialiseTimeline(timeline: unknown): string {
  const value = JSON.stringify(timeline ?? { clips: [], audio: [] });
  if (value.length > MAX_TIMELINE_BYTES) throw new Error('That timeline is too large to save');
  return value;
}

projectsRouter.get('/', asyncHandler(async (req, res) => {
  const includeArchived = req.query.includeArchived === 'true';
  const repo = AppDataSource.getRepository(Project);
  const projects = await repo.find({
    where: includeArchived ? {} : { archived: false },
    order: { updatedAt: 'DESC' },
  });
  res.json(projects.map((p) => ProjectDTO.fromEntity(p)));
}));

projectsRouter.get('/:id', asyncHandler(async (req, res) => {
  const repo = AppDataSource.getRepository(Project);
  const project = await repo.findOneBy({ id: Number(req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(ProjectDTO.fromEntity(project));
}));

projectsRouter.post('/', asyncHandler(async (req, res) => {
  const { name, timeline, format, framePos, normalizeLoudness } = req.body as {
    name?: string;
    timeline?: unknown;
    format?: string;
    framePos?: number;
    normalizeLoudness?: boolean;
  };

  const trimmed = (name ?? '').trim();
  if (!trimmed) return res.status(400).json({ error: 'A project needs a name' });

  const repo = AppDataSource.getRepository(Project);
  const project = repo.create({
    name: trimmed.slice(0, 200),
    timeline: serialiseTimeline(timeline),
    format: format ?? 'original',
    framePos: typeof framePos === 'number' ? framePos : 0.5,
    normalizeLoudness: !!normalizeLoudness,
    archived: false,
  });

  res.status(201).json(ProjectDTO.fromEntity(await repo.save(project)));
}));

projectsRouter.put('/:id', asyncHandler(async (req, res) => {
  const repo = AppDataSource.getRepository(Project);
  const project = await repo.findOneBy({ id: Number(req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, timeline, format, framePos, normalizeLoudness, archived } = req.body as {
    name?: string;
    timeline?: unknown;
    format?: string;
    framePos?: number;
    normalizeLoudness?: boolean;
    archived?: boolean;
  };

  if (typeof name === 'string' && name.trim()) project.name = name.trim().slice(0, 200);
  // An absent timeline means "leave it alone": the autosave sends the whole
  // thing, but a rename should not have to.
  if (timeline !== undefined) project.timeline = serialiseTimeline(timeline);
  if (typeof format === 'string') project.format = format;
  if (typeof framePos === 'number') project.framePos = Math.min(1, Math.max(0, framePos));
  if (typeof normalizeLoudness === 'boolean') project.normalizeLoudness = normalizeLoudness;
  if (typeof archived === 'boolean') project.archived = archived;

  res.json(ProjectDTO.fromEntity(await repo.save(project)));
}));

projectsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const repo = AppDataSource.getRepository(Project);
  const project = await repo.findOneBy({ id: Number(req.params.id) });
  if (!project) return res.status(404).json({ error: 'Project not found' });
  await repo.remove(project);
  res.json({ ok: true });
}));
