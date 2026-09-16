/**
 * The rooms of the settings screen, as data rather than as markup.
 *
 * This array lived inside `SettingsPage.vue`, which was fine while the page was
 * the only thing that needed it. The search field needs it too: a result has to
 * say which section a setting is in, and it has to say it in words, so the id
 * in the URL is not enough on its own.
 */
export type SettingSectionId =
  | 'general'
  | 'app'
  | 'recording'
  | 'games'
  | 'playback'
  | 'connections'
  | 'advanced';

export interface SettingSection {
  id: SettingSectionId;
  label: string;
  icon: string;
  /** The second line in the sidebar, under the name. */
  description: string;
}

export const SETTING_SECTIONS: readonly SettingSection[] = [
  {
    id: 'general',
    label: 'General',
    icon: 'material-symbols:settings',
    description: 'General application settings',
  },
  {
    id: 'app',
    label: 'App',
    icon: 'material-symbols:tune',
    description: 'Folders, startup and publishing',
  },
  {
    id: 'recording',
    label: 'Recording',
    icon: 'material-symbols:fiber-manual-record',
    description: 'OBS, the replay buffer, and a folder per game',
  },
  {
    id: 'games',
    label: 'Games',
    icon: 'material-symbols:videogame-asset',
    description: 'Hide games from your library',
  },
  {
    id: 'playback',
    label: 'Playback',
    icon: 'material-symbols:play-circle',
    description: 'Video playback preferences',
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: 'material-symbols:robot-2-outline',
    description: 'Let Claude Code work on your clips',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: 'material-symbols:tune',
    description: 'Advanced configuration',
  },
];

/** Where `/settings` with no section lands. */
export const DEFAULT_SECTION: SettingSectionId = 'general';

/**
 * A `?section=` value, or nothing.
 *
 * Separate from the page so it can be tested without a router: the tray, the
 * welcome screen, a bench script and somebody's bookmark all put a string in
 * that query, and none of them are obliged to have kept up.
 */
export function resolveSection(raw: unknown): SettingSectionId | null {
  if (typeof raw !== 'string' || raw === '') return null;
  return SETTING_SECTIONS.find((section) => section.id === raw)?.id ?? null;
}

export function sectionLabel(id: SettingSectionId): string {
  return SETTING_SECTIONS.find((section) => section.id === id)?.label ?? id;
}
