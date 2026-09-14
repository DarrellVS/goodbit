import { randomUUID } from 'node:crypto';
import type { ClipDTO } from '@shared/index.js';

/**
 * Long work, tracked.
 *
 * A render of any size outlives an HTTP request, Cloudflare gives up at 100
 * seconds and answers 504, so the work runs detached and the client polls.
 * In-memory is enough: a restart loses the progress readout, and the file
 * either landed on disk or did not.
 *
 * Every job carries an AbortController. Before this, changing your mind about
 * an export left ffmpeg running to completion with nobody waiting for it.
 */

export type JobStatus = 'running' | 'done' | 'error' | 'cancelled';
export type JobKind = 'export' | 'trim' | 'import' | 'analyze';

export interface Job {
  id: string;
  kind: JobKind;
  /** What to call this job in the UI, e.g. the output name. */
  label: string;
  status: JobStatus;
  /** 0..100. */
  progress: number;
  /** What the job is doing right now, in the words the UI uses. */
  message: string;
  clip?: ClipDTO;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/** How long a finished job stays readable, so a slow poll still sees the result. */
const RETENTION_MS = 15 * 60 * 1000;

const jobs = new Map<string, Job>();
const controllers = new Map<string, AbortController>();

function prune(): void {
  const cutoff = Date.now() - RETENTION_MS;
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) {
      jobs.delete(id);
      controllers.delete(id);
    }
  }
}

export function createJob(kind: JobKind, label = '', id = randomUUID()): Job {
  prune();
  const job: Job = {
    id,
    kind,
    label,
    status: 'running',
    progress: 0,
    message: '',
    startedAt: Date.now(),
  };
  jobs.set(id, job);
  controllers.set(id, new AbortController());
  return job;
}

export function getJob(id: string): Job | null {
  return jobs.get(id) ?? null;
}

export function listJobs(): Job[] {
  prune();
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/** The signal a worker should watch, so cancelling actually stops ffmpeg. */
export function jobSignal(id: string): AbortSignal | undefined {
  return controllers.get(id)?.signal;
}

export function setJobProgress(id: string, progress: number, message?: string): void {
  const job = jobs.get(id);
  if (!job || job.status !== 'running') return;
  job.progress = Math.max(0, Math.min(100, Math.round(progress)));
  if (message !== undefined) job.message = message;
}

export function completeJob(id: string, clip?: ClipDTO): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = 'done';
  job.progress = 100;
  if (clip) job.clip = clip;
  job.finishedAt = Date.now();
  controllers.delete(id);
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  // A cancel already settled this job, and the ffmpeg kill that follows arrives
  // here as an error. Reporting it would turn the user's own cancel into a
  // failure, so a job that is no longer running keeps the verdict it has.
  if (job.status !== 'running') return;
  job.status = 'error';
  job.error = error;
  job.finishedAt = Date.now();
  controllers.delete(id);
}

/** Ask a running job to stop. Returns false when there was nothing to stop. */
export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  const controller = controllers.get(id);
  if (!job || !controller || job.status !== 'running') return false;
  controller.abort();
  job.status = 'cancelled';
  job.message = 'Cancelled';
  job.finishedAt = Date.now();
  controllers.delete(id);
  return true;
}

/**
 * Seconds left, from how long the work has taken to get this far.
 *
 * Null until there is enough progress for the estimate to mean anything,
 * an ETA computed from 1% is noise, and a wrong number is worse than none.
 */
export function etaSeconds(job: Job): number | null {
  if (job.status !== 'running' || job.progress < 5) return null;
  const elapsed = (Date.now() - job.startedAt) / 1000;
  return Math.max(0, Math.round((elapsed / job.progress) * (100 - job.progress)));
}

/** The shape the client polls for. */
export function jobView(job: Job): {
  id: string;
  kind: JobKind;
  label: string;
  status: JobStatus;
  progress: number;
  message: string;
  etaSeconds: number | null;
  clip: ClipDTO | null;
  error: string | null;
} {
  return {
    id: job.id,
    kind: job.kind,
    label: job.label,
    status: job.status,
    progress: job.progress,
    message: job.message,
    etaSeconds: etaSeconds(job),
    clip: job.clip ?? null,
    error: job.error ?? null,
  };
}
