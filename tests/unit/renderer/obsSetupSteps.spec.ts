// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, type App, type Component } from 'vue';
import ObsSetupAudioStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupAudioStep.vue';
import ObsSetupBlocker from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupBlocker.vue';
import ObsSetupChange from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupChange.vue';
import ObsSetupDoneStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupDoneStep.vue';
import ObsSetupInstallStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupInstallStep.vue';
import ObsSetupRecordingStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupRecordingStep.vue';
import ObsSetupReviewStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupReviewStep.vue';
import ObsSetupRouteStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupRouteStep.vue';
import ObsSetupScreenStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupScreenStep.vue';
import ObsSetupSortingStep from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupSortingStep.vue';
import ObsSetupStepToggle from '../../../src/renderer/src/components/Settings/ObsSetup/ObsSetupStepToggle.vue';
import type { SetupStep } from '../../../src/renderer/src/composables/useObsSetup';
import type { ObsSetupPlan, PlannedChange } from '../../../src/renderer/src/services/obs';

/**
 * The wizard's pages, mounted.
 *
 * Here for one reason, and it is structural rather than visual. The dialog's
 * body is `space-y-3`, which spaces *its own* children, so every step component
 * has a fragment root: no wrapping element, the same sequence of cards the one
 * big template used to emit inline. A wrapper would be a single child, the gaps
 * between a step's cards would go, and nothing would fail. Counting the direct
 * children of the host is what catches that.
 *
 * It also proves each page renders at all, which for a refactor of the first
 * screen a new user meets is worth having before somebody has to walk it on a
 * machine with the right OBS on it.
 *
 * What this does not buy: anything about how it looks. Heights, alignment,
 * contrast and the two dropdowns that replaced native selects are the e2e
 * suite's, and `scripts/obs-wizard-shots.mjs` takes the pictures.
 */

/**
 * Iconify fetches an icon it has not seen from `api.iconify.design`, which a
 * unit test must not do.
 */
vi.mock('@iconify/vue', async () => {
  const { h: createElement } = await import('vue');
  return {
    Icon: {
      props: { icon: String },
      setup: (props: { icon?: string }) => () => createElement('i', { 'data-icon': props.icon }),
    },
  };
});

let mounted: App | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  host = null;
  document.body.innerHTML = '';
});

/** Mounts a step the way the dialog does: straight into the body of the card. */
function mount(component: Component, props: Record<string, unknown>): HTMLElement {
  host = document.createElement('div');
  host.className = 'px-5 pb-5 space-y-3 overflow-y-auto';
  document.body.appendChild(host);

  mounted = createApp({ render: () => h(component, props) });
  mounted.mount(host);
  return host;
}

/** The cards `space-y-3` would be spacing. Comments and text do not count. */
function cards(element: HTMLElement): Element[] {
  return [...element.children];
}

function step(overrides: Partial<SetupStep> = {}): SetupStep {
  return {
    key: 'createScene',
    label: 'Create a scene that captures the game',
    description: 'Anything running fullscreen, plus desktop audio.',
    enabled: true,
    ...overrides,
  };
}

function change(overrides: Partial<PlannedChange> = {}): PlannedChange {
  return {
    kind: 'modify',
    title: 'The GoodBit profile',
    file: 'C:\\Users\\someone\\AppData\\Roaming\\obs-studio\\basic\\profiles\\GoodBit\\basic.ini',
    summary: ['Turns the replay buffer on and keeps 30 seconds.'],
    details: [{ key: '[SimpleOutput] RecRB', value: 'true', was: 'false' }],
    ...overrides,
  };
}

function plan(overrides: Partial<ObsSetupPlan> = {}): ObsSetupPlan {
  return { changes: [change()], blockers: [], notes: [], obsRunning: false, ...overrides };
}

describe('each page puts its cards where the dialog can space them', () => {
  it('offers two routes, side by side', () => {
    const body = mount(ObsSetupRouteStep, {});

    expect(cards(body)).toHaveLength(2);
    expect(body.textContent).toContain('Quick setup');
    expect(body.textContent).toContain('Step by step');
  });

  it('draws the install page without a plan, and everything with one', () => {
    const bare = mount(ObsSetupInstallStep, {
      installPlan: null,
      installed: false,
      installing: false,
      progress: null,
      error: null,
    });

    // The intro, the row of buttons, and the line saying it is still watching.
    expect(cards(bare)).toHaveLength(3);
    expect(bare.textContent).toContain('Watching for OBS to appear');

    mounted?.unmount();
    document.body.innerHTML = '';

    const full = mount(ObsSetupInstallStep, {
      installPlan: {
        alreadyInstalled: false,
        options: [{ method: 'winget', label: 'Install OBS', detail: 'Through winget' }],
        installer: { version: '31.0.0', name: 'OBS.exe', bytes: 142_000_000 },
        downloadPage: 'https://obsproject.com/download',
      },
      installed: true,
      installing: false,
      progress: { percent: 40, message: 'Downloading OBS' },
      error: 'Something went wrong',
    });

    expect(cards(full)).toHaveLength(6);
    expect(full.textContent).toContain('OBS 31.0.0');
    expect(full.textContent).toContain('142 MB');
    expect(full.textContent).toContain('OBS is here.');
    expect(full.textContent).toContain('Something went wrong');
  });

  it('asks about the screen, then about the two things it decides', () => {
    const body = mount(ObsSetupScreenStep, {
      displays: [
        {
          id: 1,
          label: 'Display 1',
          primary: true,
          width: 3440,
          height: 1440,
          frequency: 144,
          monitorId: null,
          hdrSupported: true,
          hdrEnabled: true,
        },
      ],
      displayId: 1,
      display: {
        id: 1,
        label: 'Display 1',
        primary: true,
        width: 3440,
        height: 1440,
        frequency: 144,
        monitorId: null,
        hdrSupported: true,
        hdrEnabled: true,
      },
      desktopStep: step({ key: 'captureDesktop', label: 'Also capture the screen itself' }),
      sceneStep: step(),
    });

    // The dropdown, the summary, and one card per switch.
    expect(cards(body)).toHaveLength(4);
    // 144 Hz is recorded at 60, which is what gets written, so it is what is said.
    expect(body.textContent).toContain('3440x1440, 60 fps');
    expect(body.textContent).toContain('HDR');
  });

  it('says what the key will do rather than what OBS has now', () => {
    const body = mount(ObsSetupRecordingStep, {
      bufferSeconds: 30,
      hotkey: 'OBS_KEY_F8',
      currentHotkey: null,
      bufferStep: step({ key: 'enableReplayBuffer', label: 'Turn the replay buffer on' }),
      hotkeyStep: step({ key: 'bindHotkey', label: 'Bind a key to Save Replay' }),
    });

    expect(cards(body)).toHaveLength(4);
    expect(body.textContent).toContain('F8 will save a replay.');
    expect(body.textContent).toContain('OBS has nothing bound at the moment.');
  });

  it('keeps the microphones apart from what is playing', () => {
    const body = mount(ObsSetupAudioStep, {
      devices: [
        { id: 'default', name: 'Speakers', description: 'Realtek', flow: 'output', isDefault: true },
        { id: 'mic', name: 'Microphone', description: 'Yeti', flow: 'input', isDefault: false },
      ],
      chosenIds: [],
    });

    // The intro, the outputs, the microphones, and the warning about silence.
    expect(cards(body)).toHaveLength(4);
    expect(body.textContent).toContain('Nothing selected, so your clips will be silent.');
  });

  it('says there is nothing to decide about where clips land', () => {
    const body = mount(ObsSetupSortingStep, {});

    expect(cards(body)).toHaveLength(2);
    expect(body.textContent).toContain('A folder per game');
  });

  it('proves the loop worked, once a clip has landed', () => {
    const body = mount(ObsSetupDoneStep, {
      result: ['Wrote the GoodBit profile'],
      hotkey: 'OBS_KEY_F9',
      firstClip: { game: 'Battlefield 6' },
      waiting: false,
    });

    expect(cards(body)).toHaveLength(2);
    expect(body.textContent).toContain('press F9');
    expect(body.textContent).toContain('Battlefield 6 landed in your library');
    expect(body.querySelector('button')).toBeNull();
  });
});

describe('the preview', () => {
  it('leads with four lines on the quick route, and folds the rest away', () => {
    const body = mount(ObsSetupReviewStep, {
      plan: plan(),
      route: 'quick',
      tiles: [{ icon: 'material-symbols:monitor', label: 'Recording', value: 'Your main screen', badge: null }],
      showEverything: false,
      closingObs: false,
      working: false,
      progress: null,
      error: null,
    });

    // The tiles, the line about the profile, the disclosure, and the change.
    expect(cards(body)).toHaveLength(4);
    expect(body.textContent).toContain('Every file and key this changes');
    // Folded, not dropped: it is still there for the e2e suite to find.
    const card = cards(body)[3] as HTMLElement;
    expect(card.style.display).toBe('none');
  });

  it('shows every change outright on the step by step route', () => {
    const body = mount(ObsSetupReviewStep, {
      plan: plan({ notes: ['Your own profiles are untouched.'] }),
      route: 'full',
      tiles: [],
      showEverything: false,
      closingObs: false,
      working: false,
      progress: null,
      error: null,
    });

    // The change and the note. No tiles and no disclosure.
    expect(cards(body)).toHaveLength(2);
    expect(body.textContent).not.toContain('Every file and key this changes');
    expect((cards(body)[0] as HTMLElement).style.display).toBe('');
  });

  it('says it is still working out what would change', () => {
    const body = mount(ObsSetupReviewStep, {
      plan: null,
      route: 'full',
      tiles: [],
      showEverything: false,
      closingObs: false,
      working: false,
      progress: null,
      error: null,
    });

    expect(body.textContent).toContain('Working out what would change');
  });

  it('names which part of the write is happening', () => {
    const body = mount(ObsSetupReviewStep, {
      plan: plan(),
      route: 'full',
      tiles: [],
      showEverything: false,
      closingObs: false,
      working: true,
      progress: { percent: 10, message: 'Downloading OBS' },
      error: null,
    });

    // A button that says "Writing" for ninety seconds reads as a hang.
    expect(body.textContent).toContain('Downloading OBS');
  });

  it('writes out the section, the key, the new value and the old one', () => {
    /*
     * The whole reason the wizard has a page called What changes. This is
     * another program's configuration in that program's own vocabulary, and
     * `setup.ts` is the only thing that decides any of it.
     */
    const body = mount(ObsSetupChange, { change: change() });

    expect(body.textContent).toContain('The GoodBit profile');
    expect(body.textContent).toContain('Turns the replay buffer on and keeps 30 seconds.');
    expect(body.textContent).toContain('[SimpleOutput] RecRB');
    expect(body.textContent).toContain('true');
    expect(body.textContent).toContain('(was false)');
    expect(body.textContent).toContain('basic.ini');
  });
});

describe('the blockers', () => {
  const OBS_OPEN =
    'OBS is open. It rewrites its settings file from memory when it closes, so anything written now would be thrown away. Close it and try again.';

  it('offers to close OBS, and says so while it is asking', async () => {
    const closed: unknown[] = [];
    const body = mount(ObsSetupBlocker, {
      blocker: OBS_OPEN,
      closing: false,
      onCloseObs: () => closed.push(true),
    });

    const button = body.querySelector('button');
    expect(button?.textContent?.trim()).toBe('Close OBS for me');

    button?.click();
    await nextTick();
    expect(closed).toHaveLength(1);
  });

  it('offers no button for a blocker only the user can deal with', () => {
    const body = mount(ObsSetupBlocker, {
      blocker: 'GoodBit does not have a clips folder yet.',
      closing: false,
    });

    expect(body.textContent).toContain('clips folder');
    expect(body.querySelector('button')).toBeNull();
  });

  it('reaches the dialog from inside the preview', async () => {
    /*
     * Two hops, review then blocker, and the wizard owns the close itself: the
     * step components have no handle on the setup.
     */
    const closed: unknown[] = [];
    const body = mount(ObsSetupReviewStep, {
      plan: plan({ blockers: [OBS_OPEN] }),
      route: 'full',
      tiles: [],
      showEverything: false,
      closingObs: false,
      working: false,
      progress: null,
      error: null,
      onCloseObs: () => closed.push(true),
    });

    body.querySelector('button')?.click();
    await nextTick();
    expect(closed).toHaveLength(1);
  });
});

describe('a switch on a step page', () => {
  it('reports the flip rather than writing it', async () => {
    /*
     * `useObsSetupWizard.setStepEnabled` is the only writer of `step.enabled`,
     * so a page can stay a prop away from the array the request is built from.
     */
    const flips: boolean[] = [];
    const body = mount(ObsSetupStepToggle, {
      step: step({ enabled: true }),
      'onUpdate:enabled': (value: boolean) => flips.push(value),
    });

    body.querySelector<HTMLButtonElement>('button[role="switch"]')?.click();
    await nextTick();

    expect(flips).toEqual([false]);
  });

  it('draws the reason a step is off, when there is one', () => {
    const body = mount(ObsSetupStepToggle, {
      step: step({
        enabled: false,
        advisedOff: 'You already have scenes. GoodBit leaves them alone unless you ask.',
      }),
    });

    expect(body.textContent).toContain('You already have scenes');
    expect(body.querySelector('button[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
  });
});
