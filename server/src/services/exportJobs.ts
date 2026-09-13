import type { ClipDTO } from '../../../shared/index.js';

/**
 * Export jobs.
 *
 * A render of any size outlives an HTTP request — Cloudflare gives up at 100
 * seconds and answers 504 — so `POST /clips/export` starts the work and returns
 * an id, and the client polls this registry instead of holding a connection
 * open. In-memory is enough: a restart loses nothing but the progress readout,
 * and the file either landed on disk or did not.
 */

export type ExportJobStatus = 'running' | 'done' | 'error';

export interface ExportJob {
  id: string;
  status: ExportJobStatus;
  progress: number;
  clip?: ClipDTO;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/** How long a finished job stays readable, so a slow poll still sees the result. */
const RETENTION_MS = 15 * 60 * 1000;

const jobs = new Map<string, ExportJob>();

function prune(): void {
  const cutoff = Date.now() - RETENTION_MS;

  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id);
  }
}

export function createJob(id: string): ExportJob {
  prune();

  const job: ExportJob = { id, status: 'running', progress: 0, startedAt: Date.now() };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): ExportJob | null {
  return jobs.get(id) ?? null;
}

export function setJobProgress(id: string, progress: number): void {
  const job = jobs.get(id);
  if (!job || job.status !== 'running') return;
  job.progress = Math.max(0, Math.min(100, Math.round(progress)));
}

export function completeJob(id: string, clip: ClipDTO): void {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'done';
  job.progress = 100;
  job.clip = clip;
  job.finishedAt = Date.now();
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;

  job.status = 'error';
  job.error = error;
  job.finishedAt = Date.now();
}
