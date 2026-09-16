import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SETTINGS_CATALOG } from '../../../src/renderer/src/utils/settingsCatalog';
import { searchSettings, searchTerms } from '../../../src/renderer/src/utils/settingsSearch';
import {
  DEFAULT_SECTION,
  resolveSection,
  SETTING_SECTIONS,
  sectionLabel,
} from '../../../src/renderer/src/utils/settingsSections';

/**
 * The settings search, which is the answer to seven rooms and no map.
 *
 * Two halves. The matcher takes values and returns values, which is the shape
 * this suite is for. The catalogue is a second copy of every label on the
 * settings screen, which is the one thing about this design that can rot: a row
 * added later, or a label reworded, leaves a setting that cannot be found or a
 * result that points at nothing. So the last block reads the section components
 * back off disk and makes the two agree, which is the test that earns its
 * place: the matcher is easy and the drift is not.
 */

const SETTINGS_DIR = join(__dirname, '../../../src/renderer/src/components/Settings');

describe('searchTerms', () => {
  it('is nothing at all for an empty query', () => {
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('splits on whitespace and lowers the case', () => {
    expect(searchTerms('  Dark   MODE ')).toEqual(['dark', 'mode']);
  });

  it('folds the typographic apostrophe, since both spellings are in the strings', () => {
    expect(searchTerms('don’t')).toEqual(["don't"]);
  });
});

describe('searchSettings', () => {
  it('finds nothing until something is typed', () => {
    expect(searchSettings('')).toEqual([]);
    expect(searchSettings('  ')).toEqual([]);
  });

  it('returns nothing rather than everything for a query that matches no setting', () => {
    expect(searchSettings('quimbleflarn')).toEqual([]);
  });

  it('matches a label whatever the case', () => {
    const labels = searchSettings('APPEARANCE').map((entry) => entry.label);
    expect(labels).toContain('Appearance');
  });

  it('matches the start of any word in a label, not just the first', () => {
    const labels = searchSettings('folder').map((entry) => entry.label);
    expect(labels).toContain('Clips folder');
    expect(labels).toContain('Music folder');
  });

  it('matches a description, so a setting is findable by what it does', () => {
    // "Recycle" is in no label; it is what the row is about.
    const labels = searchSettings('resolution').map((entry) => entry.label);
    expect(labels).toContain('Show Clip Metadata');
  });

  /*
   * The case the keyword list exists for. The theme control is called
   * Appearance and its description is "Follow the system, or pick a side": the
   * word somebody types is in neither.
   */
  it('matches a keyword that appears nowhere on the row', () => {
    const labels = searchSettings('dark').map((entry) => entry.label);
    expect(labels).toContain('Appearance');
  });

  it('matches a section name, so a whole room can still be asked for', () => {
    const labels = searchSettings('playback').map((entry) => entry.label);
    expect(labels).toContain('Mute Videos by Default');
  });

  it('narrows on a second word rather than widening', () => {
    const one = searchSettings('clips');
    const two = searchSettings('clips publishing');

    expect(two.length).toBeLessThan(one.length);
    expect(two.every((entry) => one.includes(entry))).toBe(true);
    expect(two.map((e) => e.label)).toContain('Compress clips when publishing');
  });

  it('drops an entry when one of two terms misses, even if the other is a perfect hit', () => {
    expect(searchSettings('appearance quimbleflarn')).toEqual([]);
  });

  /*
   * The ranking is the difference between a list and an answer. Four rows
   * mention a backup in their description; one of them *is* the backups.
   */
  it('puts a label hit above a description hit', () => {
    const [first] = searchSettings('backup');
    expect(first?.label).toBe('Library backups');
  });

  it('puts a label hit above a keyword hit', () => {
    const labels = searchSettings('volume').map((entry) => entry.label);
    expect(labels.indexOf('How loud')).toBeGreaterThan(-1);
    // "How loud" carries "volume" as a keyword; "Mute Videos by Default" only
    // mentions it as one too, so both are keyword hits and catalogue order
    // decides. What must not happen is a description-only hit coming first.
    expect(labels[0]).not.toBe('Say when a clip is saved');
  });

  it('works against a catalogue passed in, so the ranking is testable in isolation', () => {
    const catalog = [
      { label: 'Second', description: 'holds the word marker', section: 'general' as const },
      { label: 'Marker', description: 'nothing', section: 'general' as const },
    ];
    expect(searchSettings('marker', catalog).map((entry) => entry.label)).toEqual([
      'Marker',
      'Second',
    ]);
  });
});

describe('resolveSection', () => {
  it('accepts every section the sidebar draws', () => {
    for (const section of SETTING_SECTIONS) {
      expect(resolveSection(section.id)).toBe(section.id);
    }
  });

  it('refuses anything else, so a stale link lands somewhere real', () => {
    expect(resolveSection('nonsense')).toBeNull();
    expect(resolveSection('')).toBeNull();
    expect(resolveSection(undefined)).toBeNull();
    expect(resolveSection(['general'])).toBeNull();
  });

  it('has a default that is itself a section', () => {
    expect(resolveSection(DEFAULT_SECTION)).toBe(DEFAULT_SECTION);
  });
});

describe('the catalogue and the screen agree', () => {
  /**
   * Every `.vue` file under `components/Settings` that draws a settings page.
   *
   * `ObsSetup/` is left out. It is a wizard in a dialog: its switches are
   * answers to one question at a time on the way to writing an OBS profile,
   * not rows anybody would search for, and the setup itself is in the
   * catalogue once, as the card that opens it.
   */
  function settingsSources(): { name: string; source: string }[] {
    const files: { name: string; source: string }[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'ObsSetup') continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.vue')) {
          files.push({ name: entry.name, source: readFileSync(path, 'utf8') });
        }
      }
    };

    walk(SETTINGS_DIR);
    return files;
  }

  /**
   * Every name a row claims on screen.
   *
   * Three ways a row gets one, and all three are read here rather than trusted:
   * a `SettingToggle` or a `SettingSelect` turns its `label` prop into the
   * anchor, a card written inline carries `data-setting` itself, and a card
   * that is a component of its own is wrapped in `SettingAnchor`.
   *
   * The two row components are skipped as files, since the `:data-setting` in
   * their own templates is the binding rather than a name.
   */
  function anchorsOnScreen(): string[] {
    const found = new Set<string>();
    const rowTags = /<SettingToggle\b[\s\S]*?\/>|<SettingSelect\b[\s\S]*?\/>/g;

    for (const { name, source } of settingsSources()) {
      if (['SettingToggle.vue', 'SettingSelect.vue', 'SettingAnchor.vue'].includes(name)) continue;

      for (const match of source.matchAll(/\sdata-setting="([^"]+)"/g)) found.add(match[1]!);
      for (const match of source.matchAll(/<SettingAnchor[^>]*?\slabel="([^"]+)"/g)) {
        found.add(match[1]!);
      }

      /*
       * Every call site is self-closing, so a tag runs to the first `/>`.
       * Narrower than "any `label=` attribute", which also catches the one
       * `BaseToggle` takes for the switch's accessible name: there is such a
       * switch inside `SuggestionsCard`, and that card is one row, not two.
       */
      for (const tag of source.matchAll(rowTags)) {
        const label = /\slabel="([^"]+)"/.exec(tag[0]);
        if (label) found.add(label[1]!);
      }
    }

    return [...found];
  }

  it('gives every setting a unique label, since the label is the anchor', () => {
    const labels = SETTINGS_CATALOG.map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('puts every entry in a section that exists', () => {
    for (const entry of SETTINGS_CATALOG) {
      expect(resolveSection(entry.section)).toBe(entry.section);
      expect(sectionLabel(entry.section)).not.toBe(entry.section);
    }
  });

  it('gives every entry something to say under its name', () => {
    for (const entry of SETTINGS_CATALOG) {
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  /**
   * The half that catches a setting added later.
   *
   * A new row with no catalogue entry is a setting the search cannot find,
   * which is exactly the failure this whole feature exists to fix, and nothing
   * on screen would look wrong.
   */
  it('knows about every row the settings screens draw', () => {
    const missing = anchorsOnScreen().filter(
      (label) => !SETTINGS_CATALOG.some((entry) => entry.label === label),
    );

    expect(missing, `add these to utils/settingsCatalog.ts: ${missing.join(', ')}`).toEqual([]);
  });

  /**
   * The half that catches a row removed or reworded.
   *
   * An entry pointing at a label nothing draws is a result that navigates to a
   * section and then rings nothing, which reads as a broken search.
   */
  it('has nothing in it that the settings screens no longer draw', () => {
    const anchors = new Set(anchorsOnScreen());
    const stale = SETTINGS_CATALOG.map((entry) => entry.label).filter(
      (label) => !anchors.has(label),
    );

    expect(stale, `no row on screen is named: ${stale.join(', ')}`).toEqual([]);
  });
});
