import axios from '@renderer/axios';
import type { Clip } from '@renderer/types/clip';

/**
 * One long-running job, watched.
 *
 * `services/jobs.ts` in main tracks every render in a map and hands out an id;
 * this is the client half. It is a module of its own rather than four more
 * functions in `clips.ts` because a job is not a clip: an export, a trim and a
 * GoodBit render are all one shape here, and only the route they were started
 * from differs.
 *
 * **Why polling at all.** The work outlives the request that starts it. That
 * was originally about Cloudflare's 100 second ceiling, and over IPC there is no
 * proxy to time out, but the reason it stays is the same reason it was built:
 * the answer worth showing is progress, and a request that only answers at the
 * end cannot report any.
 */

/** The shape `jobView()` answers with, for any job whatever started it. */
export interface JobView {
  id: string;
  kind: 'export' | 'trim' | 'import' | 'analyze';
  /** What to call this job in the UI, e.g. the GoodBit's own name. */
  label: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  /** 0 to 100. */
  progress: number;
  /** What the job is doing right now, in the words the UI uses. */
  message: string;
  /** Seconds left, or null until there is enough progress for it to mean anything. */
  etaSeconds: number | null;
  /** The clip a render produced, once it has. */
  clip: Clip | null;
  error: string | null;
}

export async function getJob(jobId: string): Promise<JobView> {
  const { data } = await axios.get<JobView>(`/api/clips/jobs/${jobId}`);
  return data;
}

/** Stop a running job. The poll loop sees the cancelled status and unwinds. */
export async function cancelJob(jobId: string): Promise<void> {
  await axios.delete(`/api/clips/export/${jobId}`);
}

const POLL_INTERVAL_MS = 1000;

/**
 * How many failed polls in a row before a job is given up on.
 *
 * A dropped request is not a dead render. The tolerance is inherited from
 * `useClipExport`, which learned it the same way: a job that is probably still
 * fine should not be reported as failed because one status call did not come
 * back.
 */
const MAX_CONSECUTIVE_POLL_FAILURES = 8;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Watch a job until it stops, reporting progress on the way.
 *
 * Resolves with the finished view whatever the verdict, including `cancelled`
 * and `error`: the caller decides what to say about each, and a rejection would
 * make the user's own cancel arrive as a thrown exception. It only rejects when
 * the job cannot be read at all, which means the answer is genuinely unknown.
 *
 * `signal` is for the caller going away, a panel closing or a clip being
 * closed, not for stopping the work: aborting here stops *watching*. Stopping
 * the render is `cancelJob`, because ffmpeg is on the other side of the pipe.
 */
export async function pollJob(
  jobId: string,
  options: { onProgress?: (view: JobView) => void; signal?: AbortSignal } = {},
): Promise<JobView> {
  let failures = 0;

  for (;;) {
    await wait(POLL_INTERVAL_MS);
    if (options.signal?.aborted) throw new DOMException('Stopped watching', 'AbortError');

    let view: JobView;
    try {
      view = await getJob(jobId);
      failures = 0;
    } catch (error) {
      // A job the server has never heard of is gone for good, and a finished
      // one is kept readable for fifteen minutes, so a 404 is not a slow poll.
      // Anything else is worth another try.
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 404) throw new Error('The app lost track of this render');

      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw error;
      continue;
    }

    options.onProgress?.(view);
    if (view.status !== 'running') return view;
  }
}

/**
 * `90` as `1m 30s`, for a progress readout.
 *
 * Rounded to five seconds above a minute. The estimate is elapsed time divided
 * by progress, so its own error is larger than a second by then, and a number
 * that counts down one at a time claims a precision it does not have.
 */
export function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;

  const total = Math.round(seconds / 5) * 5;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}
