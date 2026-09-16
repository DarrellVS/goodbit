import { describe, expect, it } from 'vitest';
import {
  audioSelectionSummary,
  continueDisabled,
  currentPageId,
  invitedStepEnabled,
  isObsOpenBlocker,
  isPlanBlocked,
  OBS_HOTKEYS,
  quickSummaryTiles,
  readableHotkey,
  visibleObsSetupPages,
  type ObsSetupPageId,
} from '../../../src/renderer/src/utils/obsSetupWizard';
import type {
  AudioDevice,
  CaptureDisplay,
  ObsSetupPlan,
} from '../../../src/renderer/src/services/obs';

/**
 * The OBS wizard's decisions.
 *
 * All of this lived inside a 1,096 line component, where the only way to check
 * it was to launch the app on a machine with the right OBS on it and walk eight
 * pages. None of it opens a file or writes another program's configuration, so
 * it belongs here.
 *
 * Two of these are worth more than the rest. A page filtered out of the list is
 * a question that never gets asked, and the setup then writes a default over
 * somebody's answer. And `continueDisabled` is what stops a write while OBS is
 * running, which is not a hint: OBS rewrites `basic.ini` from memory when it
 * closes, so anything written underneath it is thrown away.
 */

/** The sentence `PlanObsSetupAction` puts in the plan, verbatim. */
const OBS_OPEN =
  'OBS is open. It rewrites its settings file from memory when it closes, so anything written now would be thrown away. Close it and try again.';

function planWith(overrides: Partial<ObsSetupPlan> = {}): ObsSetupPlan {
  return {
    changes: [{ kind: 'create', title: 'A profile', file: 'basic.ini', summary: ['One'], details: [] }],
    blockers: [],
    notes: [],
    obsRunning: false,
    ...overrides,
  };
}

function screen(overrides: Partial<CaptureDisplay> = {}): CaptureDisplay {
  return {
    id: 1,
    label: 'Display 1',
    primary: true,
    width: 3440,
    height: 1440,
    frequency: 144,
    monitorId: null,
    hdrSupported: true,
    hdrEnabled: true,
    ...overrides,
  };
}

function device(overrides: Partial<AudioDevice> = {}): AudioDevice {
  return {
    id: 'default',
    name: 'Speakers',
    description: 'Realtek',
    flow: 'output',
    isDefault: true,
    ...overrides,
  };
}

describe('which pages get asked', () => {
  it('asks everything but the install page when OBS is here', () => {
    const ids = visibleObsSetupPages({ installed: true, directToFull: false, route: 'full' }).map(
      (page) => page.id,
    );

    expect(ids).toEqual(['route', 'screen', 'recording', 'audio', 'sorting', 'review', 'done']);
  });

  it('adds the install page, in front of the questions, when OBS is not here', () => {
    const ids = visibleObsSetupPages({ installed: false, directToFull: false, route: 'full' }).map(
      (page) => page.id,
    );

    expect(ids[1]).toBe('install');
    expect(ids).toContain('screen');
  });

  it('keeps only the preview and the proof on the quick route', () => {
    /*
     * Quick answers every question itself. The preview stays, because nothing
     * is written until it has been seen, and so does the last page, which is
     * the only thing that proves the whole chain works.
     */
    const ids = visibleObsSetupPages({ installed: true, directToFull: false, route: 'quick' }).map(
      (page) => page.id,
    );

    expect(ids).toEqual(['route', 'review', 'done']);
  });

  it('still installs OBS on the quick route', () => {
    const ids = visibleObsSetupPages({ installed: false, directToFull: false, route: 'quick' }).map(
      (page) => page.id,
    );

    expect(ids).toEqual(['route', 'install', 'review', 'done']);
  });

  it('drops the route question when the wizard was opened to change a setting', () => {
    /*
     * Offering the quick route to somebody who came here to change one answer
     * is offering to overwrite the rest with the defaults.
     */
    const ids = visibleObsSetupPages({ installed: true, directToFull: true, route: 'full' }).map(
      (page) => page.id,
    );

    expect(ids).not.toContain('route');
    expect(ids[0]).toBe('screen');
  });
});

describe('where the wizard is', () => {
  const pages = visibleObsSetupPages({ installed: true, directToFull: false, route: 'full' });

  it('reads the page at the index', () => {
    expect(currentPageId(pages, 0)).toBe('route');
    expect(currentPageId(pages, 2)).toBe('recording');
  });

  it('clamps an index past the end onto the last page', () => {
    /*
     * The list shrinks underneath the index: choosing quick takes seven pages
     * down to three while the index is already at one, and OBS appearing takes
     * one out from in front of it.
     */
    expect(currentPageId(pages, 99)).toBe('done');
  });

  it('falls back to the route page when there are no pages at all', () => {
    expect(currentPageId([], 0)).toBe('route');
  });
});

describe('whether the forward button refuses', () => {
  const base = { page: 'review' as ObsSetupPageId, working: false, installed: true };

  it('refuses the preview while OBS is open', () => {
    /*
     * The one that matters. `src/main/services/obs/` writes nothing while OBS
     * runs, so a button that could be pressed anyway would send somebody into
     * an error rather than telling them what to do about it.
     */
    expect(continueDisabled({ ...base, plan: planWith({ blockers: [OBS_OPEN] }) })).toBe(true);
  });

  it('allows the preview once there is something to write and nothing in the way', () => {
    expect(continueDisabled({ ...base, plan: planWith() })).toBe(false);
  });

  it('refuses a preview that has not arrived', () => {
    expect(continueDisabled({ ...base, plan: null })).toBe(true);
  });

  it('refuses a preview with nothing in it', () => {
    // Apply would be offering to write a list of nothing.
    expect(continueDisabled({ ...base, plan: planWith({ changes: [] }) })).toBe(true);
  });

  it('refuses the install page until OBS is actually there', () => {
    const install = { page: 'install' as ObsSetupPageId, working: false, plan: null };

    expect(continueDisabled({ ...install, installed: false })).toBe(true);
    expect(continueDisabled({ ...install, installed: true })).toBe(false);
  });

  it('refuses every page while something is being written', () => {
    expect(
      continueDisabled({ page: 'screen', working: true, plan: planWith(), installed: true }),
    ).toBe(true);
  });

  it('lets a question page through', () => {
    expect(
      continueDisabled({ page: 'audio', working: false, plan: null, installed: true }),
    ).toBe(false);
  });
});

describe('the blockers', () => {
  it('offers to close OBS for the blocker that says OBS is open', () => {
    expect(isObsOpenBlocker(OBS_OPEN)).toBe(true);
  });

  it('matches whatever case the sentence arrives in', () => {
    expect(isObsOpenBlocker('Obs Is Open. Close it.')).toBe(true);
  });

  it('offers nothing for a blocker the app cannot do anything about', () => {
    expect(isObsOpenBlocker('OBS is not installed on this machine yet.')).toBe(false);
    expect(isObsOpenBlocker('GoodBit does not have a clips folder yet.')).toBe(false);
  });

  it('knows a plan with no blockers from one with any', () => {
    expect(isPlanBlocked(null)).toBe(false);
    expect(isPlanBlocked(planWith())).toBe(false);
    expect(isPlanBlocked(planWith({ blockers: [OBS_OPEN] }))).toBe(true);
  });
});

describe('the key picker', () => {
  it('shows the key that is written on the key, and stores what OBS calls it', () => {
    /*
     * `OBS_KEY_F8` is what goes into `[Hotkeys] ReplayBuffer`; F8 is what the
     * person presses, and so is what the wizard says on both pages that
     * mention it.
     */
    expect(readableHotkey('OBS_KEY_F8')).toBe('F8');
    expect(OBS_HOTKEYS.map(readableHotkey)).toEqual(['F8', 'F9', 'F10', 'F12']);
  });

  it('leaves anything that is not an OBS key name alone', () => {
    expect(readableHotkey('F8')).toBe('F8');
  });
});

describe('the quick route summary', () => {
  it('says the clips will be silent when nothing is chosen', () => {
    expect(audioSelectionSummary([device()], [])).toBe('None, clips will be silent');
  });

  it('names the one device that was chosen', () => {
    expect(audioSelectionSummary([device({ id: 'a', name: 'Headset' })], ['a'])).toBe('Headset');
  });

  it('falls back to a count for a device this machine no longer has', () => {
    expect(audioSelectionSummary([], ['unplugged'])).toBe('One device');
  });

  it('counts anything more than one, since each is its own fader', () => {
    expect(audioSelectionSummary([device()], ['a', 'b', 'c'])).toBe(
      '3 devices, each on its own fader',
    );
  });

  it('describes the screen, the key and the sound in four tiles', () => {
    const tiles = quickSummaryTiles({
      display: screen(),
      bufferSeconds: 30,
      hotkey: 'OBS_KEY_F8',
      audio: [device({ id: 'a', name: 'Headset' })],
      audioIds: ['a'],
    });

    expect(tiles.map((tile) => tile.label)).toEqual(['Recording', 'Saving', 'Sound', 'Clips']);
    expect(tiles[1].value).toBe('The last 30 seconds, on F8');
    expect(tiles[2].value).toBe('Headset');
  });

  it('caps the frame rate it promises at 60, because that is what gets written', () => {
    const [recording] = quickSummaryTiles({
      display: screen({ frequency: 144 }),
      bufferSeconds: 30,
      hotkey: 'OBS_KEY_F8',
      audio: [],
      audioIds: [],
    });

    expect(recording.value).toBe('3440 by 1440, 60 fps');
    expect(recording.badge).toBe('HDR');
  });

  it('says nothing about HDR for a screen that is not in it', () => {
    const [recording] = quickSummaryTiles({
      display: screen({ hdrEnabled: false, frequency: 30 }),
      bufferSeconds: 30,
      hotkey: 'OBS_KEY_F8',
      audio: [],
      audioIds: [],
    });

    expect(recording.value).toBe('3440 by 1440, 30 fps');
    expect(recording.badge).toBeNull();
  });

  it('promises the main screen before the displays have been read', () => {
    const [recording] = quickSummaryTiles({
      display: null,
      bufferSeconds: 30,
      hotkey: 'OBS_KEY_F8',
      audio: [],
      audioIds: [],
    });

    expect(recording.value).toBe('Your main screen');
    expect(recording.badge).toBeNull();
  });
});

describe('what a link is allowed to tick', () => {
  it('turns the guide words into steps', () => {
    const invited = ['buffer', 'hotkey'];

    expect(invitedStepEnabled('enableReplayBuffer', invited)).toBe(true);
    expect(invitedStepEnabled('bindHotkey', invited)).toBe(true);
    expect(invitedStepEnabled('createScene', invited)).toBe(false);
    expect(invitedStepEnabled('captureDesktop', invited)).toBe(false);
  });

  it('ticks nothing for a step the guide has no word for', () => {
    expect(invitedStepEnabled('somethingNew', ['buffer', 'hotkey'])).toBe(false);
  });

  it('ticks nothing at all for a link that asked for nothing', () => {
    // A link that names no steps is a link that turns every optional one off.
    expect(invitedStepEnabled('createScene', [])).toBe(false);
  });
});
