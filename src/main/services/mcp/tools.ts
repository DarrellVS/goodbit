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

  /**
   * Which of these ids are real, and which are not.
   *
   * Every write tool checks this first, because the failure it prevents is the
   * worst kind: a tool that reports success for a clip that does not exist.
   * A model has no way to know it was lied to, so it tells the person their
   * clip was renamed and moves on.
   */
  async function partition(ids: number[]): Promise<{ found: number[]; missing: number[] }> {
    const rows = await clips()
      .createQueryBuilder('clip')
      .select('clip.id', 'id')
      .where('clip.id IN (:...ids)', { ids })
      .getRawMany<{ id: number }>();

    const found = rows.map((row) => row.id);
    return { found, missing: ids.filter((id) => !found.includes(id)) };
  }

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

        /*
         * A date that is not a date is refused, not ignored.
         *
         * `new Date('yesterday')` is Invalid Date, and comparing against it
         * matches nothing in a way SQLite does not complain about, so the
         * filter silently did not apply and the newest clips came back looking
         * like the answer. A model asking for "clips after yesterday" was told
         * something confidently wrong.
         */
        for (const [field, value] of [
          ['recordedAfter', recordedAfter],
          ['recordedBefore', recordedBefore],
        ] as const) {
          if (value !== undefined && Number.isNaN(new Date(value).getTime())) {
            return text({
              error: `${field} is not a date I can read: ${value}. Use an ISO date like 2026-09-01.`,
            });
          }
        }

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
          /*
           * `%` and `_` are wildcards to LIKE and letters to everybody else.
           * Searching for "100%" matched the whole library without them being
           * escaped, which reads as a broken search rather than a clever one.
           */
          const ESCAPE = '!';
          const literal = query.replace(/[!%_]/g, (char) => ESCAPE + char);
          qb = qb.andWhere(
            `(clip.filename LIKE :q ESCAPE '${ESCAPE}' OR clip.displayName LIKE :q ESCAPE '${ESCAPE}')`,
            { q: `%${literal}%` },
          );
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

        /*
         * How many there are, as well as how many came back.
         *
         * One number for both meant a page of 25 out of 300 looked exactly
         * like a library with 25 clips in it, and the caller had no way to
         * tell the difference or to know that asking for more would help.
         */
        const matching = await qb.getCount();
        const page = await qb.getMany();

        return text({
          clips: page.map(view),
          returned: page.length,
          matching,
          ...(matching > page.length
            ? { more: `${matching - page.length} more match this; raise limit to see them.` }
            : {}),
        });
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
        const clip = await clips().findOne({ where: { id: clipId }, relations: { tags: true } });
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
        /*
         * Counted from the clip side, because the relation only exists there.
         *
         * `Tag` deliberately omits the inverse side: the join is owned by
         * `Clip`. Asking TypeORM to load `relations: ['clips']` threw on every
         * call, so this tool never once worked, and an `as never` cast is what
         * let it past the typechecker.
         *
         * A left join rather than an inner one, so a tag nobody uses still
         * appears, with zero, which is the answer somebody tidying up wants.
         */
        const rows = await clips()
          .createQueryBuilder('clip')
          .leftJoin('clip.tags', 'tag')
          .select('tag.name', 'name')
          .addSelect('COUNT(clip.id)', 'clips')
          .where('tag.name IS NOT NULL')
          .groupBy('tag.name')
          .orderBy('clips', 'DESC')
          .getRawMany<{ name: string; clips: number }>();

        const used = new Set(rows.map((row) => row.name));
        const unused = (await AppDataSource.getRepository(Tag).find())
          .map((tag) => tag.name)
          .filter((name) => !used.has(name))
          .map((name) => ({ name, clips: 0 }));

        return text({ tags: [...rows, ...unused] });
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

        /*
         * Checked before the write, not counted after it.
         *
         * Tagging a clip that does not exist used to report success and, worse,
         * still created the tag itself: the library gained a tag attached to
         * nothing, and the caller was told it worked.
         */
        const { found, missing } = await partition(clipIds);
        if (found.length === 0) {
          return text({ tagged: 0, missing, error: 'None of those clip ids exist.' });
        }

        await new BatchAddTagsAction().execute({ clipIds: found, tags: names });
        return text({ tagged: found.length, tags: names, ...(missing.length ? { missing } : {}) });
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

        const { found, missing } = await partition(clipIds);
        if (found.length === 0) {
          return text({ updated: 0, missing, error: 'None of those clip ids exist.' });
        }

        await new BatchStarAction().execute({ clipIds: found, starred });
        return text({ updated: found.length, starred, ...(missing.length ? { missing } : {}) });
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

        // `update` on a missing row changes nothing and throws nothing, so the
        // number of rows it touched is the only honest answer.
        const result = await clips().update(clipId, { displayName: name });
        if (!result.affected) return text({ error: `No clip with id ${clipId}` });

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

        const result = await clips().update(clipId, { notes: note });
        if (!result.affected) return text({ error: `No clip with id ${clipId}` });

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

        /*
         * The moments and why, not the machinery.
         *
         * The raw result carries the analysis internals: `spreadLu`, `peakZ`,
         * `bar`, `basis`, a feature vector. They are the right thing to keep in
         * the cache and the wrong thing to put in a model's context, where they
         * read as numbers worth reasoning about.
         */
        const events = (result.events ?? []).map((event) => ({
          atSec: Math.round(event.atSec * 10) / 10,
          untilSec: Math.round((event.untilSec ?? event.atSec) * 10) / 10,
          reason: event.reason,
          confidence: Math.round(event.confidence * 100) / 100,
        }));

        return text({
          clipId,
          durationSec: result.durationSec,
          from: result.watchesScreen ? 'the game HUD and the sound' : 'the sound',
          confident: result.confident,
          suggestions: events.length
            ? events
            : (result.goodBits ?? []).map((candidate) => ({
                atSec: Math.round(candidate.t * 10) / 10,
                reason: 'the loudest moment in the clip',
                confidence: Math.round(candidate.score * 100) / 100,
              })),
        });
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

        /*
         * Everything checked before the file is touched.
         *
         * This is the one tool that cannot be undone, so a mistake has to be
         * caught while it is still only a mistake. An id that does not exist
         * used to surface as a raw TypeORM "Could not find any entity of type
         * Clip", which is not something to hand a person.
         */
        const clip = await clips().findOneBy({ id: clipId });
        if (!clip) return text({ error: `No clip with id ${clipId}` });

        const length = clip.durationSec ?? null;
        if (length !== null && startSec >= length) {
          return text({
            error: `That clip is ${length.toFixed(1)}s long, so a cut starting at ${startSec}s would keep nothing.`,
          });
        }
        if (length !== null && endSec > length + 0.5) {
          return text({
            error: `That clip is ${length.toFixed(1)}s long; ${endSec}s is past the end.`,
          });
        }

        await new TrimAndSwapClipAction().execute({ clipId, startSec, endSec });
        const after = await clips().findOne({ where: { id: clipId }, relations: { tags: true } });
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

        /*
         * Games with clips, which is what `list_games` returns.
         *
         * This used to count rows in the `game` table, which also holds games
         * whose clips have since been moved or deleted. The two tools then
         * disagreed by sixteen on this machine, and nothing said why.
         */
        const withClips = await clips()
          .createQueryBuilder('clip')
          .select('COUNT(DISTINCT clip.game)', 'n')
          .getRawOne<{ n: number }>();

        const known = await AppDataSource.getRepository(Game).count();

        return text({
          clips: total,
          starred,
          games: Number(withClips?.n ?? 0),
          gamesKnownWithNoClips: known - Number(withClips?.n ?? 0),
          totalGb: sizes?.bytes ? Math.round((sizes.bytes / 1024 ** 3) * 10) / 10 : 0,
          totalHours: sizes?.seconds ? Math.round((sizes.seconds / 3600) * 10) / 10 : 0,
          oldest: sizes?.oldest ?? null,
          newest: sizes?.newest ?? null,
        });
      },
    },
  ];
}
