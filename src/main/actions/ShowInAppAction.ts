import { BaseAction } from './BaseAction.js';
import { showInAppPath, type ShowInAppView } from '@shared/localApi';

export interface ShowInAppInput {
  view: ShowInAppView;
  clipId?: number;
  clipIds?: number[];
}

export type ShowInAppOutput = { shown: true; path: string } | { shown: false; reason: 'bad-view' | 'no-window' };

let opener: ((path: string) => void) | null = null;

/**
 * How this action reaches the app window. Registered once by `index.ts`, which
 * owns `openIn` (it shows the window and sends `app:navigate`), the same way
 * the notch is handed it with `setNotchOpener`.
 */
export function setShowInAppOpener(open: ((path: string) => void) | null): void {
  opener = open;
}

/**
 * Bring the app window up on a screen.
 *
 * **The path is built here, from a view name and checked ids, and never taken
 * from the caller.** A client that could send a path could send anything the
 * router understands. The ids are checked by the caller against what the
 * session was sent; this action only turns them into a route.
 */
export class ShowInAppAction extends BaseAction<ShowInAppInput, ShowInAppOutput> {
  async execute(input: ShowInAppInput): Promise<ShowInAppOutput> {
    const path = showInAppPath(input.view, input.clipId, input.clipIds);
    if (path === null) return { shown: false, reason: 'bad-view' };
    if (!opener) return { shown: false, reason: 'no-window' };
    opener(path);
    return { shown: true, path };
  }
}
