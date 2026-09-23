/**
 * The rooms of the settings screen, as data rather than as markup.
 *
 * This array lived inside `SettingsPage.vue`, which was fine while the page was
 * the only thing that needed it. The search field needs it too: a result has to
 * say which section a setting is in, and it has to say it in words, so the id
 * in the URL is not enough on its own.
 *
 * **Named after what somebody came to do.** There were seven of these and three
 * of them (General, App, Advanced) were the same word: miscellaneous. They held
 * ten, five and four unrelated things, App and Advanced shared an icon, and the
 * one called Advanced was where the database backups lived, which are the only
 * thing standing between somebody and losing tags and notes they cannot
 * re-derive. Meanwhile Playback was four switches with a room of its own and
 * Games was a list with no settings in it at all, and the Advanced panel ended
 * with a box explaining where a different screen was, which is the maze
 * admitting it.
 */
export type SettingSectionId =
  | 'recording'
  | 'watching'
  | 'editing'
  | 'data'
  | 'connections'
  | 'advanced';

export interface SettingSection {
  id: SettingSectionId;
  label: string;
  icon: string;
  /** The second line in the sidebar, under the name. */
  description: string;
}

/**
 * In the order they are read, which is roughly the order a clip goes through:
 * it is recorded, it is watched, it is cut, and it is kept.
 *
 * No two share an icon any more. `material-symbols:tune` was on both App and
 * Advanced, which is what two sections meaning the same thing looks like from
 * across the room.
 */
export const SETTING_SECTIONS: readonly SettingSection[] = [
  {
    id: 'recording',
    label: 'Recording',
    icon: 'material-symbols:fiber-manual-record',
    description: 'OBS, your clips folder and the notch',
  },
  {
    id: 'watching',
    label: 'Watching',
    icon: 'material-symbols:visibility',
    description: 'How your library looks and plays',
  },
  {
    id: 'editing',
    label: 'Editing',
    icon: 'material-symbols:content-cut',
    description: 'Trimming, music and suggestions',
  },
  {
    id: 'data',
    label: 'Your data',
    icon: 'material-symbols:database',
    description: 'Backups and cleanup',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: 'material-symbols:cable',
    description: 'Publishing, Claude and Stream Deck',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'material-symbols:tune',
    description: 'Shortcuts and system info',
  },
];

/**
 * Where `/settings` with no section lands.
 *
 * Recording rather than the old General, because it is the section that answers
 * the one question somebody opens this screen in a hurry to answer: why is
 * nothing arriving in my library. The tray's Settings item goes here.
 */
export const DEFAULT_SECTION: SettingSectionId = 'recording';

/**
 * The names these sections used to have.
 *
 * A section id is a URL. `ObsNotReadyBanner`, `WelcomePage`, the tray,
 * `scripts/obs-wizard-shots.mjs`, `scripts/screenshots.mjs` and
 * `tests/e2e/screens.spec.ts` all navigate by one, and so does anybody who
 * bookmarked a settings page or learned the address. Renaming a section without
 * this would make every one of them land on a default that is not what they
 * asked for, silently, which is a worse maze than the one being fixed.
 *
 * `recording`, `connections` and `advanced` kept their names and need no entry.
 * The four that moved point at wherever the bulk of what was on that page went:
 * General was mostly about how the library looks, and App was mostly the clips
 * folder.
 */
const LEGACY_SECTIONS: Readonly<Record<string, SettingSectionId>> = {
  general: 'watching',
  playback: 'watching',
  app: 'recording',
  games: 'watching',
};

/**
 * A `?section=` value as a section that exists, or nothing.
 *
 * Separate from the page so it can be tested without a router, and so an old id
 * is resolved in exactly one place rather than at each of the call sites that
 * still uses one.
 */
export function resolveSection(raw: unknown): SettingSectionId | null {
  if (typeof raw !== 'string' || raw === '') return null;

  const current = SETTING_SECTIONS.find((section) => section.id === raw);
  if (current) return current.id;

  return LEGACY_SECTIONS[raw] ?? null;
}

export function sectionLabel(id: SettingSectionId): string {
  return SETTING_SECTIONS.find((section) => section.id === id)?.label ?? id;
}
