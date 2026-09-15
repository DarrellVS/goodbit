/**
 * What Claude can do with a clip library.
 *
 * Deliberately not a mapping of the internal API. That has seventy six
 * endpoints, thirty three of them on clips alone, and a model picks a tool by
 * reading its description: seventy six descriptions is noise, and the ones
 * that matter get lost among the ones that do not. So this is task shaped.
 * Each tool is something somebody would actually ask for.
 *
 * Two rules hold throughout.
 *
 * **Never return a video.** A clip is hundreds of megabytes and a model cannot
 * reason about it. Tools return metadata and paths, and the app opens the file
 * when a person asks it to.
 *
 * **Writes are narrow and reversible.** Tagging, starring and renaming touch
 * one column. Trimming goes through the same Action the app uses, which keeps
 * the recording's own date and is frame accurate. Nothing here deletes a clip:
 * that is the one thing the library cannot undo, and it stays in the app where
 * a person has to confirm it.
 */
import { z } from 'zod';
import { AppDataSource } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';
import { Tag } from '../../entity/Tag.js';
import { Game } from '../../entity/Game.js';
import { BatchAddTagsAction, BatchStarAction } from '../../actions/BatchOperationsAction.js';
import { TrimAndSwapClipAction } from '../../actions/TrimAndSwapClipAction.js';
import { EnsureClipSuggestionsAction } from '../../actions/EnsureClipSuggestionsAction.js';

/** What a clip looks like to a model: enough to choose one, nothing to decode. */
function view(clip: Clip): Record<string, unknown> {
  return {
    id: clip.id,
    name: clip.displayName || clip.filename,
    game: clip.game,
    recordedAt: (clip.recordedAt ?? clip.fileModifiedAt)?.toISOString?.() ?? null,
    durationSec: clip.durationSec ?? null,
    sizeMb: clip.sizeBytes ? Math.round(clip.sizeBytes / 1024 / 1024) : null,
    starred: clip.starred,
    published: clip.published,
    notes: clip.notes || null,
    tags: (clip.tags ?? []).map((tag) => tag.name),
    path: clip.filePath,
  };
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  run: (input: Record<string, never>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

export function tools(): ToolDefinition[] {
  const clips = () => AppDataSource.getRepository(Clip);

  return [
    {
      name: 'search_clips',
      title: 'Search the clip library',
      description:
        'Find clips by game, tag, text in the name, whether they are starred, or when they were recorded. Returns metadata, never the video. Start here: almost every other tool takes a clip id this returns.',
      inputSchema: {
        query: z.string().optional().describe('Text to match in the clip name'),
        game: z.string().optional().describe('Exact game name, as it appears in the library'),
        tag: z.string().optional().describe('Only clips carrying this tag'),
        starred: z.boolean().optional(),
        recordedAfter: z.string().optional().describe('ISO date, inclusive'),
        recordedBefore: z.string().optional().describe('ISO date, inclusive'),
        minDurationSec: z.number().optional(),
        limit: z.number().min(1).max(100).default(25).optional(),
      },
      async run(input) {
        const {
          query,
          game,
          tag,
          starred,
          recordedAfter,
          recordedBefore,
          minDurationSec,
          limit = 25,
        } = input as Record<string, never> & {
          query?: string;
          game?: string;
          tag?: string;
          starred?: boolean;
          recordedAfter?: string;
          recordedBefore?: string;
          minDurationSec?: number;
          limit?: number;
        };

        let qb = clips()
          .createQueryBuilder('clip')
          .leftJoinAndSelect('clip.tags', 'tag')
          .orderBy('clip.recordedAt', 'DESC')
          .take(limit);

        if (game) qb = qb.andWhere('clip.game = :game', { game });
        if (starred !== undefined) qb = qb.andWhere('clip.starred = :starred', { starred });
        if (minDurationSec !== undefined) {
          qb = qb.andWhere('clip.durationSec >= :min', { min: minDurationSec });
        }
        if (recordedAfter) {
          qb = qb.andWhere('clip.recordedAt >= :after', { after: new Date(recordedAfter) });
        }
        if (recordedBefore) {
          qb = qb.andWhere('clip.recordedAt <= :before', { before: new Date(recordedBefore) });
        }
        if (query) {
          qb = qb.andWhere('(clip.filename LIKE :q OR clip.displayName LIKE :q)', {
            q: `%${query}%`,
          });
        }
        if (tag) {
          // A second query rather than a join filter: filtering on the joined
          // tag would return the clip carrying only the tag that matched.
          const ids = await clips()
            .createQueryBuilder('clip')
            .leftJoin('clip.tags', 'tag')
            .where('tag.name = :tag', { tag })
            .select('clip.id', 'id')
            .getRawMany<{ id: number }>();

          if (ids.length === 0) return text({ clips: [], found: 0 });
          qb = qb.andWhere('clip.id IN (:...ids)', { ids: ids.map((row) => row.id) });
        }

        const found = await qb.getMany();
        return text({ clips: found.map(view), found: found.length });
      },
    },

    {
      name: 'get_clip',
      title: 'Everything about one clip',
      description:
        'Full detail for a single clip, including its tags, notes and where it sits on disk.',
      inputSchema: { clipId: z.number().describe('From search_clips') },
      async run(input) {
        const { clipId } = input as Record<string, never> & { clipId: number };
        const clip = await clips().findOne({ where: { id: clipId }, relations: ['tags'] });
        return clip ? text(view(clip)) : text({ error: `No clip with id ${clipId}` });
      },
    },

    {
      name: 'list_games',
      title: 'Games in the library',
      description:
        'Every game the library holds, with how many clips each has. The game name is the folder the clips live in.',
      inputSchema: {},
      async run() {
        const rows = await clips()
          .createQueryBuilder('clip')
          .select('clip.game', 'game')
          .addSelect('COUNT(*)', 'clips')
          .groupBy('clip.game')
          .orderBy('clips', 'DESC')
          .getRawMany<{ game: string; clips: number }>();

        return text({ games: rows });
      },
    },

    {
      name: 'list_tags',
      title: 'Tags in use',
      description: 'Every tag, and how many clips carry it.',
      inputSchema: {},
      async run() {
        const tags = await AppDataSource.getRepository(Tag).find({ relations: ['clips'] as never });
        return text({
          tags: tags.map((tag) => ({ name: tag.name, clips: (tag as { clips?: [] }).clips?.length ?? 0 })),
        });
      },
    },

    {
      name: 'tag_clips',
      title: 'Add tags to clips',
      description:
        'Put one or more tags on one or more clips. Tags that do not exist yet are created. Use search_clips first to get the ids.',
      inputSchema: {
        clipIds: z.array(z.number()).min(1),
        tags: z.array(z.string()).min(1),
      },
      async run(input) {
        const { clipIds, tags: names } = input as Record<string, never> & {
          clipIds: number[];
          tags: string[];
        };
        await new BatchAddTagsAction().execute({ clipIds, tags: names });
        return text({ tagged: clipIds.length, tags: names });
      },
    },

    {
      name: 'star_clips',
      title: 'Star or unstar clips',
      description: 'Mark clips as favourites, or take the star off.',
      inputSchema: { clipIds: z.array(z.number()).min(1), starred: z.boolean() },
      async run(input) {
        const { clipIds, starred } = input as Record<string, never> & {
          clipIds: number[];
          starred: boolean;
        };
        await new BatchStarAction().execute({ clipIds, starred });
        return text({ updated: clipIds.length, starred });
      },
    },

    {
      name: 'rename_clip',
      title: 'Give a clip a readable name',
      description:
        'Set the name shown in the library. The file on disk is never renamed: clips keep the name OBS gave them, and this is a label on top.',
      inputSchema: { clipId: z.number(), name: z.string().min(1) },
      async run(input) {
        const { clipId, name } = input as Record<string, never> & { clipId: number; name: string };
        await clips().update(clipId, { displayName: name });
        return text({ clipId, name });
      },
    },

    {
      name: 'add_note',
      title: 'Write a note on a clip',
      description: 'Replace the note attached to a clip. Notes are for the person, not the file.',
      inputSchema: { clipId: z.number(), note: z.string() },
      async run(input) {
        const { clipId, note } = input as Record<string, never> & { clipId: number; note: string };
        await clips().update(clipId, { notes: note });
        return text({ clipId, note });
      },
    },

    {
      name: 'suggest_highlights',
      title: 'Where the interesting parts of a clip are',
      description:
        'Moments worth trimming to, from the loudness analysis GoodBit already runs, and from the game HUD where a module exists for that game. Each suggestion carries a reason. Use this before trim_clip rather than guessing at timestamps.',
      inputSchema: { clipId: z.number() },
      async run(input) {
        const { clipId } = input as Record<string, never> & { clipId: number };
        const clip = await clips().findOneBy({ id: clipId });
        if (!clip) return text({ error: `No clip with id ${clipId}` });

        const result = await new EnsureClipSuggestionsAction().execute({ clipId });
        return text({ clipId, suggestions: result });
      },
    },

    {
      name: 'trim_clip',
      title: 'Cut a clip down to a moment',
      description:
        'Replace a clip with the section between two times, in seconds. This rewrites the file, and it is the one destructive tool here: the rest of the recording is gone afterwards. Frame accurate, and the recording keeps its original date. Ask the person before calling it.',
      inputSchema: {
        clipId: z.number(),
        startSec: z.number().min(0),
        endSec: z.number().min(0),
      },
      async run(input) {
        const { clipId, startSec, endSec } = input as Record<string, never> & {
          clipId: number;
          startSec: number;
          endSec: number;
        };
        if (endSec <= startSec) return text({ error: 'endSec has to be after startSec' });

        await new TrimAndSwapClipAction().execute({ clipId, startSec, endSec });
        const after = await clips().findOne({ where: { id: clipId }, relations: ['tags'] });
        return text({ trimmed: true, clip: after ? view(after) : null });
      },
    },

    {
      name: 'library_stats',
      title: 'The shape of the library',
      description:
        'How many clips, how much disk, the range of dates, and which games have the most. Useful for answering questions about the collection as a whole.',
      inputSchema: {},
      async run() {
        const total = await clips().count();
        const starred = await clips().countBy({ starred: true });
        const sizes = await clips()
          .createQueryBuilder('clip')
          .select('SUM(clip.sizeBytes)', 'bytes')
          .addSelect('SUM(clip.durationSec)', 'seconds')
          .addSelect('MIN(clip.recordedAt)', 'oldest')
          .addSelect('MAX(clip.recordedAt)', 'newest')
          .getRawOne<{ bytes: number; seconds: number; oldest: string; newest: string }>();

        const games = await AppDataSource.getRepository(Game).count();

        return text({
          clips: total,
          starred,
          games,
          totalGb: sizes?.bytes ? Math.round((sizes.bytes / 1024 ** 3) * 10) / 10 : 0,
          totalHours: sizes?.seconds ? Math.round((sizes.seconds / 3600) * 10) / 10 : 0,
          oldest: sizes?.oldest ?? null,
          newest: sizes?.newest ?? null,
        });
      },
    },
  ];
}
