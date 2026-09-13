import express from 'express';
import { AppDataSource } from '../data-source.js';
import { Clip } from '../entity/Clip.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getHiddenGameNames } from '../utils/hiddenGames.js';

export const statsRouter = express.Router();

statsRouter.get('/', asyncHandler(async (_req, res) => {
  const repo = AppDataSource.getRepository(Clip);

  // Stats describe the library the user actually browses, so hidden games are
  // left out of every figure here.
  const hiddenGames = await getHiddenGameNames();
  const visible = () => {
    const qb = repo.createQueryBuilder('clip');
    return hiddenGames.length > 0
      ? qb.where('clip.game NOT IN (:...hiddenGames)', { hiddenGames })
      : qb;
  };

  const totalClips = await visible().getCount();

  const sizeResult = await visible()
    .select('SUM(clip.sizeBytes)', 'total')
    .addSelect('AVG(clip.sizeBytes)', 'avg')
    .getRawOne();

  const publishedClips = await visible().andWhere('clip.published = :p', { p: true }).getCount();
  const starredClips = await visible().andWhere('clip.starred = :s', { s: true }).getCount();

  const taggedClipsResult = await visible()
    .leftJoin('clip.tags', 'tag')
    .andWhere('tag.id IS NOT NULL')
    .groupBy('clip.id')
    .getMany();
  
  const taggedClips = taggedClipsResult.length;

  const gameStats = await visible()
    .select('clip.game', 'game')
    .addSelect('COUNT(*)', 'count')
    .addSelect('SUM(clip.sizeBytes)', 'totalSize')
    .addSelect('AVG(clip.sizeBytes)', 'avgSize')
    .addSelect('SUM(CASE WHEN clip.published = 1 THEN 1 ELSE 0 END)', 'publishedCount')
    .addSelect('SUM(CASE WHEN clip.starred = 1 THEN 1 ELSE 0 END)', 'starredCount')
    .groupBy('clip.game')
    .orderBy('count', 'DESC')
    .getRawMany();

  const gamesCount = gameStats.length;

  const oldestClip = await visible()
    .orderBy('clip.fileModifiedAt', 'ASC')
    .limit(1)
    .getOne();

  const newestClip = await visible()
    .orderBy('clip.fileModifiedAt', 'DESC')
    .limit(1)
    .getOne();

  const mostUsedTags = await visible()
    .leftJoin('clip.tags', 'tag')
    .select('tag.name', 'tag')
    .addSelect('COUNT(DISTINCT clip.id)', 'count')
    .andWhere('tag.name IS NOT NULL')
    .groupBy('tag.name')
    .orderBy('count', 'DESC')
    .limit(20)
    .getRawMany();

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const recentClips = await visible()
    .select("DATE(clip.fileModifiedAt)", 'date')
    .addSelect('COUNT(*)', 'count')
    .andWhere('clip.fileModifiedAt >= :startDate', { startDate: fourteenDaysAgo.toISOString() })
    .groupBy('date')
    .orderBy('date', 'ASC')
    .getRawMany();

  const clipsByDay: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    const existing = recentClips.find(c => c.date === dateStr);
    clipsByDay.push({
      date: dateStr,
      count: existing ? parseInt(existing.count) : 0
    });
  }

  res.json({
    totalClips,
    totalSize: parseInt(sizeResult?.total || '0'),
    avgClipSize: parseFloat(sizeResult?.avg || '0'),
    publishedClips,
    starredClips,
    taggedClips,
    gamesCount,
    gameStats: gameStats.map(g => ({
      game: g.game,
      count: parseInt(g.count),
      totalSize: parseInt(g.totalSize || '0'),
      avgSize: parseFloat(g.avgSize || '0'),
      publishedCount: parseInt(g.publishedCount || '0'),
      starredCount: parseInt(g.starredCount || '0'),
    })),
    oldestClip: oldestClip?.fileModifiedAt || null,
    newestClip: newestClip?.fileModifiedAt || null,
    mostUsedTags: mostUsedTags.map(t => ({
      tag: t.tag,
      count: parseInt(t.count)
    })),
    clipsByDay,
  });
}));

