import { describe, expect, it } from 'vitest';
import { applyIniEdits, parseIni } from '../../../src/main/services/obs/ini.js';
import { userConfigEdits } from '../../../src/main/services/obs/setup.js';

/**
 * The one OBS file GoodBit writes that it does not own.
 *
 * Everything else the setup writes lives inside a profile and a scene
 * collection of GoodBit's own, both named GoodBit, and could be deleted
 * without touching anything a person made. `user.ini` is not like that: it
 * holds every global OBS preference, and on a real install that is 77 lines
 * across five sections, most of them settings somebody chose.
 *
 * So the test that matters is not "did the three keys get written". It is
 * **"did anything else change"**. `applyIniEdits` exists precisely because a
 * parse-and-regenerate round trip drops every key the writer does not know
 * about, and a future OBS version will always have keys this code has never
 * heard of.
 *
 * `scripts/obs-apply-check.mjs` covers the same ground against a throw-away
 * OBS directory and is the better test, but it refuses to run while OBS is
 * open, which is most of the time on a machine anyone is using. This runs
 * always.
 *
 * The fixture's shape is taken from a real `user.ini`: the section names, their
 * order, and the fact that `[BasicWindow]` comes first and already contains
 * tray keys.
 */

/** A real OBS `user.ini`, in miniature. Sections and order as OBS writes them. */
const REAL_SHAPE = [
  '[BasicWindow]',
  'PreviewEnabled=false',
  'PreviewProgramMode=false',
  'SceneDuplicationMode=true',
  'SwapScenesMode=true',
  'SnappingEnabled=true',
  'ScreenSnapping=true',
  'SysTrayEnabled=false',
  'SysTrayWhenStarted=false',
  'SysTrayMinimizeToTray=false',
  'CenterSnapping=false',
  '',
  '[Appearance]',
  'Theme=com.obsproject.Yami.Dark',
  '',
  '[Basic]',
  'Profile=SomeoneElsesProfile',
  'SceneCollection=Streaming',
  '',
  '[Accessibility]',
  'ColorPreset=0',
  '',
].join('\n');

describe('which keys the setup writes outside its own profile', () => {
  it('writes exactly three, and says which', () => {
    // A fourth key appearing here without a reason in the docblock is the
    // thing this test is guarding. The file belongs to the user.
    expect(userConfigEdits()).toEqual([
      { section: 'General', key: 'FirstRun', value: 'true' },
      { section: 'BasicWindow', key: 'SysTrayEnabled', value: 'true' },
      { section: 'BasicWindow', key: 'SysTrayMinimizeToTray', value: 'true' },
    ]);
  });

  it('does not touch the key that starts OBS already hidden', () => {
    // A program that gives no sign of having launched is a different promise
    // from one that tidies itself away, and if OBS fails to start the replay
    // buffer, seeing the window is how anyone finds out.
    const keys = userConfigEdits().map((edit) => edit.key);
    expect(keys).not.toContain('SysTrayWhenStarted');
  });

  it('never touches which profile or scene collection OBS is on', () => {
    // The launch flags choose the profile (`--profile GoodBit`). Switching
    // somebody's active profile by writing `[Basic] Profile` is not ours to do.
    const keys = userConfigEdits().map((edit) => edit.key);
    expect(keys).not.toContain('Profile');
    expect(keys).not.toContain('SceneCollection');
  });
});

describe('writing them into a real file', () => {
  const updated = applyIniEdits(REAL_SHAPE, userConfigEdits());
  const after = parseIni(updated);
  const before = parseIni(REAL_SHAPE);

  it('turns the tray on', () => {
    expect(after.get('BasicWindow')?.get('SysTrayEnabled')).toBe('true');
    expect(after.get('BasicWindow')?.get('SysTrayMinimizeToTray')).toBe('true');
  });

  it('adds the section that OBS has not written yet', () => {
    // `[General]` is absent from this fixture, which is the case on an OBS
    // that has never finished its own wizard.
    expect(before.has('General')).toBe(false);
    expect(after.get('General')?.get('FirstRun')).toBe('true');
  });

  it('changes nothing else, in any section', () => {
    const intended = new Set(
      userConfigEdits().map((edit) => `${edit.section}.${edit.key}`),
    );

    for (const [section, keys] of before) {
      for (const [key, value] of keys) {
        if (intended.has(`${section}.${key}`)) continue;
        expect(after.get(section)?.get(key), `${section}.${key}`).toBe(value);
      }
    }
  });

  it('leaves the user on their own profile and scene collection', () => {
    expect(after.get('Basic')?.get('Profile')).toBe('SomeoneElsesProfile');
    expect(after.get('Basic')?.get('SceneCollection')).toBe('Streaming');
  });

  it('keeps their theme, which is in a section it does not write to at all', () => {
    expect(after.get('Appearance')?.get('Theme')).toBe('com.obsproject.Yami.Dark');
  });

  it('adds no keys beyond the ones it declared', () => {
    const beforeKeys = new Set(
      [...before].flatMap(([section, keys]) => [...keys.keys()].map((k) => `${section}.${k}`)),
    );
    const afterKeys = [...after].flatMap(([section, keys]) =>
      [...keys.keys()].map((k) => `${section}.${k}`),
    );

    const added = afterKeys.filter((key) => !beforeKeys.has(key));
    expect(added.sort()).toEqual(['General.FirstRun']);
  });

  it('is idempotent, so applying the setup twice is not a second change', () => {
    expect(applyIniEdits(updated, userConfigEdits())).toBe(updated);
  });

  it('works on an empty file, which is an OBS that has never been opened', () => {
    const fresh = parseIni(applyIniEdits('', userConfigEdits()));

    expect(fresh.get('General')?.get('FirstRun')).toBe('true');
    expect(fresh.get('BasicWindow')?.get('SysTrayMinimizeToTray')).toBe('true');
  });

  it('keeps CRLF if the file had CRLF, which OBS writes on Windows', () => {
    const crlf = REAL_SHAPE.split('\n').join('\r\n');
    const result = applyIniEdits(crlf, userConfigEdits());

    expect(result.includes('\r\n')).toBe(true);
    // No lone newlines left behind by the inserted lines.
    expect(/[^\r]\n/.test(result)).toBe(false);
  });
});
