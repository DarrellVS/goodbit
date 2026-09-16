import { BaseAction } from './BaseAction.js';
import { AppDataSource } from '../data-source.js';
import { Project } from '../entity/Project.js';
import {
  planDraftImport,
  toSqliteUtc,
  type DraftSkipReason,
  type IncomingDraft,
} from '../services/editorDrafts.js';

export interface ImportEditorDraftsInput {
  drafts: IncomingDraft[];
}

export type ImportedDraftOutcome = 'created' | 'updated' | 'kept' | 'skipped';

export interface ImportedDraftResult {
  /** The IndexedDB key the renderer sent, so it knows which record this is. */
  localId: string;
  outcome: ImportedDraftOutcome;
  /** The row this record now lives in. Absent only when it was skipped. */
  projectId?: number;
  reason?: DraftSkipReason;
}

export interface ImportEditorDraftsOutput {
  results: ImportedDraftResult[];
  created: number;
  updated: number;
  kept: number;
  skipped: number;
}

/**
 * Carry the renderer's leftover IndexedDB drafts into `project`, once.
 *
 * The 2.0 first-run migration behind 3.2. `project` is now the only store for
 * a named draft, so the records the old mirror left in the browser have to get
 * there before the drafts list can honestly claim to be showing everything.
 * `services/editorDrafts.ts` decides what happens to each and says why; this
 * performs it.
 *
 * **One transaction.** The renderer deletes a local record only once this has
 * said where it landed, so a half-applied import would either strand records
 * it thinks are safe or duplicate them on the retry. Nothing else in this
 * codebase needs a transaction, because nothing else writes a set of rows that
 * has to be all or nothing; a one-shot migration over somebody's unsaved work
 * is exactly that.
 *
 * **A migrated draft keeps its own date.** See `toSqliteUtc` for why that
 * takes a second statement rather than just being passed to `save`.
 *
 * Idempotent by construction as well as by the renderer's marker: a record
 * whose row exists and is no older is a `keep`, which writes nothing. Running
 * this twice with the same input creates nothing the second time.
 */
export class ImportEditorDraftsAction extends BaseAction<
  ImportEditorDraftsInput,
  ImportEditorDraftsOutput
> {
  async execute(input: ImportEditorDraftsInput): Promise<ImportEditorDraftsOutput> {
    const drafts = input.drafts ?? [];
    const empty: ImportEditorDraftsOutput = {
      results: [],
      created: 0,
      updated: 0,
      kept: 0,
      skipped: 0,
    };
    if (drafts.length === 0) return empty;

    return AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Project);

      // Every row, archived included. An archived draft is out of the way
      // rather than gone, so a local record mirroring one must not be taken
      // for a record whose row has disappeared and copied in beside it.
      const rows = await repo.find({ select: { id: true, updatedAt: true } });
      const plan = planDraftImport(
        drafts,
        // Read the same guarded way `ProjectDTO.fromEntity` reads it: a row
        // written before the migrations landed can come back with a string
        // where the driver would normally have hydrated a Date, and `isNewer`
        // parses either.
        rows.map((row) => ({
          id: row.id,
          updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
        })),
      );

      const results: ImportedDraftResult[] = [];

      for (const step of plan) {
        if (step.step === 'skip') {
          results.push({ localId: step.localId, outcome: 'skipped', reason: step.reason });
          continue;
        }

        if (step.step === 'keep') {
          results.push({ localId: step.localId, outcome: 'kept', projectId: step.projectId });
          continue;
        }

        if (step.step === 'create') {
          const saved = await repo.save(
            repo.create({
              name: step.name.slice(0, 200),
              timeline: JSON.stringify(step.timeline),
              format: 'original',
              framePos: 0.5,
              normalizeLoudness: false,
              archived: false,
            }),
          );

          // A draft that was made in August is a draft from August, on both
          // columns: `createdAt` is never shown today, and leaving it at the
          // moment of the upgrade would make a later "oldest first" lie.
          await manager.query(
            'UPDATE "project" SET "createdAt" = ?, "updatedAt" = ? WHERE "id" = ?',
            [toSqliteUtc(step.updatedAt), toSqliteUtc(step.updatedAt), saved.id],
          );

          results.push({ localId: step.localId, outcome: 'created', projectId: saved.id });
          continue;
        }

        await repo.update(step.projectId, {
          name: step.name.slice(0, 200),
          timeline: JSON.stringify(step.timeline),
        });
        await manager.query('UPDATE "project" SET "updatedAt" = ? WHERE "id" = ?', [
          toSqliteUtc(step.updatedAt),
          step.projectId,
        ]);

        results.push({ localId: step.localId, outcome: 'updated', projectId: step.projectId });
      }

      return {
        results,
        created: results.filter((result) => result.outcome === 'created').length,
        updated: results.filter((result) => result.outcome === 'updated').length,
        kept: results.filter((result) => result.outcome === 'kept').length,
        skipped: results.filter((result) => result.outcome === 'skipped').length,
      };
    });
  }
}
