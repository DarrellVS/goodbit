import type { AudioDevice, CaptureDisplay, ObsSetupPlan } from '@renderer/services/obs';

/**
 * The OBS wizard's decisions, as values in and values out.
 *
 * Everything here used to be a `computed` or an inline expression inside
 * `Settings/ObsSetupDialog.vue`, which was 1,096 lines and could only be
 * checked by launching the app and walking the wizard on a machine with the
 * right OBS on it. None of these touch a window, a file or another program's
 * configuration, so `tests/unit/renderer/obsSetupWizard.spec.ts` can hold them
 * to their answers.
 *
 * The two that matter most are `visibleObsSetupPages`, because a page that is
 * filtered out is a question that never gets asked, and `continueDisabled`,
 * because it is what refuses to write to somebody else's OBS while OBS is
 * open.
 */

/**
 * The pages, in order.
 *
 * `install` only appears on a machine with no OBS, because the setup cannot do
 * anything without it and sending somebody away to a download page is where
 * most people stop.
 */
export const OBS_SETUP_PAGES = [
  { id: 'route', title: 'Set up OBS' },
  { id: 'install', title: 'Install OBS' },
  { id: 'screen', title: 'What to record' },
  { id: 'recording', title: 'When to save it' },
  { id: 'audio', title: 'What to hear' },
  { id: 'sorting', title: 'Where clips land' },
  { id: 'review', title: 'What changes' },
  { id: 'done', title: 'Try it' },
] as const;

export type ObsSetupPage = (typeof OBS_SETUP_PAGES)[number];
export type ObsSetupPageId = ObsSetupPage['id'];

/** Quick skips the questions; both routes keep the preview. */
export type ObsSetupRoute = 'quick' | 'full';

export function visibleObsSetupPages(options: {
  /** Whether OBS is on the machine. Unknown counts as installed, as it did. */
  installed: boolean;
  directToFull: boolean;
  route: ObsSetupRoute;
}): ObsSetupPage[] {
  // Annotated: without it TypeScript infers a type predicate from the branches
  // and narrows 'route' and 'install' out of ObsSetupPageId entirely.
  return OBS_SETUP_PAGES.filter((page): boolean => {
    // Removed rather than stepped over, so Back cannot land on a question
    // that was never asked and the step count reads honestly.
    if (page.id === 'route') return !options.directToFull;
    if (page.id === 'install') return !options.installed;
    // Route is decided above, so by here it is one of the question pages.
    if (options.route === 'quick') return page.id === 'review' || page.id === 'done';
    return true;
  });
}

/**
 * Where the wizard is, given how far it has been stepped.
 *
 * Clamped rather than bounds-checked: the list of pages shrinks underneath the
 * index when the route changes or OBS appears, and an index past the end has to
 * read as the last page rather than as nothing.
 */
export function currentPageId(pages: readonly ObsSetupPage[], at: number): ObsSetupPageId {
  return pages[Math.min(at, pages.length - 1)]?.id ?? 'route';
}

/** Keys people actually bind a replay to. */
export const OBS_HOTKEYS = ['OBS_KEY_F8', 'OBS_KEY_F9', 'OBS_KEY_F10', 'OBS_KEY_F12'];

/** `OBS_KEY_F8` is what OBS stores. `F8` is what is written on the key. */
export function readableHotkey(hotkey: string): string {
  return hotkey.replace('OBS_KEY_', '');
}

/** What the sound choice amounts to, in one line, for the quick route. */
export function audioSelectionSummary(
  audio: readonly AudioDevice[],
  audioIds: readonly string[],
): string {
  if (audioIds.length === 0) return 'None, clips will be silent';
  if (audioIds.length === 1) {
    return audio.find((device) => device.id === audioIds[0])?.name ?? 'One device';
  }
  return `${audioIds.length} devices, each on its own fader`;
}

export interface ObsSetupTile {
  icon: string;
  label: string;
  value: string;
  badge: string | null;
}

/**
 * The quick route's answer, at a glance.
 *
 * The full preview is a list of every file and key, which is the right thing
 * for somebody who chose to walk the steps and the wrong thing for somebody
 * who pressed the button that means "you decide". Same information, one line
 * each, with the whole list a click away underneath.
 */
export function quickSummaryTiles(state: {
  display: CaptureDisplay | null;
  bufferSeconds: number;
  hotkey: string;
  audio: readonly AudioDevice[];
  audioIds: readonly string[];
}): ObsSetupTile[] {
  const { display } = state;

  return [
    {
      icon: 'material-symbols:monitor',
      label: 'Recording',
      value: display
        ? `${display.width} by ${display.height}, ${
            display.frequency >= 60 ? 60 : display.frequency
          } fps`
        : 'Your main screen',
      badge: display?.hdrEnabled ? 'HDR' : null,
    },
    {
      icon: 'material-symbols:keyboard',
      label: 'Saving',
      value: `The last ${state.bufferSeconds} seconds, on ${readableHotkey(state.hotkey)}`,
      badge: null,
    },
    {
      icon: 'material-symbols:volume-up',
      label: 'Sound',
      value: audioSelectionSummary(state.audio, state.audioIds),
      badge: null,
    },
    {
      icon: 'material-symbols:folder',
      label: 'Clips',
      value: 'A folder per game',
      badge: null,
    },
  ];
}

/**
 * The one blocker with an answer the app can carry out.
 *
 * Matched on the sentence because the plan carries blockers as prose, which is
 * what the preview shows. Everything else in the list is something only the
 * user can deal with, and gets no button.
 */
export function isObsOpenBlocker(blocker: string): boolean {
  return blocker.toLowerCase().includes('obs is open');
}

/** Whether the plan carries a reason it cannot be applied. */
export function isPlanBlocked(plan: ObsSetupPlan | null): boolean {
  return (plan?.blockers.length ?? 0) > 0;
}

/**
 * Whether the forward button refuses.
 *
 * On the preview this is the guard, not a hint: `src/main/services/obs/` writes
 * nothing while OBS runs, and a button that could be pressed anyway would send
 * somebody into an error instead of telling them what to do about it. A plan
 * with no changes is refused too, because Apply would then be offering to write
 * a list of nothing.
 */
export function continueDisabled(state: {
  page: ObsSetupPageId;
  working: boolean;
  plan: ObsSetupPlan | null;
  installed: boolean;
}): boolean {
  if (state.working) return true;
  if (state.page === 'review') {
    return isPlanBlocked(state.plan) || !state.plan || state.plan.changes.length === 0;
  }
  if (state.page === 'install') return !state.installed;
  return false;
}

/**
 * What the website's guide calls each step, against what the setup calls it.
 *
 * A link ticks boxes and nothing else: it cannot name a folder, cannot carry a
 * secret and cannot apply anything. See `deeplink.ts`, which parses it, and
 * `PublisherInviteDialog.vue`, which is the same idea for the publisher.
 */
export const INVITED_STEP_NAMES: Record<string, string> = {
  createProfile: 'profile',
  enableReplayBuffer: 'buffer',
  bindHotkey: 'hotkey',
  createScene: 'scene',
  captureDesktop: 'desktop',
};

export function invitedStepEnabled(stepKey: string, invited: readonly string[]): boolean {
  return invited.includes(INVITED_STEP_NAMES[stepKey] ?? '');
}
