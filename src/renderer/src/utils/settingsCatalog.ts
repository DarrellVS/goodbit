import type { SettingSectionId } from './settingsSections';

/**
 * Every setting in the app, in one list, so the search field can find one on a
 * page it is not showing.
 *
 * This is the part of the search that had a real choice in it. The obvious
 * design is to let each row register itself as it mounts, since
 * `SettingToggle` and `SettingSelect` already hold the label and the
 * description as props. It does not work: a section is only mounted while it is
 * the one on screen, and every one of them fetches something on mount (the OBS
 * diagnostic, the encoder probe, the MCP state, the games list, the backups,
 * the label summary). So a registry filled by mounting would either know only
 * about the page you are already looking at, which is the one page you do not
 * need help finding, or it would mean mounting all six and firing all of that
 * to answer a keystroke.
 *
 * So the list is declared, and `tests/unit/renderer/settingsSearch.spec.ts`
 * reads the section components back and fails when a row on screen is missing
 * from here or an entry here points at a row that no longer exists. The cost of
 * a second copy is drift, and that test is what stops it.
 *
 * **`label` is the anchor, not just a title.** Each row carries
 * `data-setting="<label>"`, which is how a result scrolls to the thing it named
 * and rings it. Labels are unique across the whole app, and the test asserts
 * that too.
 *
 * In section order, and then in the order the rows appear on their page, so
 * that results which score the same come out grouped rather than shuffled.
 */
export interface SettingEntry {
  /** Exactly the label on screen, and the row's `data-setting` value. */
  label: string;
  /**
   * What has to be switched on before this row is drawn at all.
   *
   * Most rows are always there. Two are not: the chime toggle only exists
   * while the clip card is on, and its volume only exists while the chime is.
   * The catalogue is a declared list and the test that keeps it honest reads
   * the section components statically, so it can see that a row exists and
   * cannot see that the row is behind a `v-if`.
   *
   * Without this, searching `volume` with the card off offered a result that
   * navigated to Recording, looked for an anchor that was not in the document,
   * and gave up silently: you land on a page you did not ask for with nothing
   * highlighted, which reads as the search being broken rather than as the
   * setting being unavailable.
   *
   * A sentence rather than a predicate, because it is shown to a person.
   */
  shownWhen?: string;
  /**
   * What the row says under its label.
   *
   * A card with no description of its own gets one written here: a result with
   * nothing under it is a result nobody can judge without going to look.
   */
  description: string;
  section: SettingSectionId;
  /**
   * Words somebody would type that appear in neither the label nor the
   * description. "Appearance" is the theme control and the word "dark" is
   * nowhere on that row, which is the single most likely thing anybody types
   * into this field.
   *
   * They carry more weight now that the sections have been renamed. Somebody
   * who had learned "it is under Advanced" is exactly the person who types the
   * old name into this field, so every name a section used to have is a keyword
   * on the settings that were under it.
   *
   * Never displayed. This is a way in, not a second description.
   */
  keywords?: string[];
}

export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  // Recording
  {
    label: 'OBS setup',
    description:
      'Whether OBS is installed, set up, and recording into your library, and the wizard that fixes it when it is not.',
    section: 'recording',
    keywords: ['obs', 'replay buffer', 'hotkey', 'wizard', 'install', 'encoder', 'scene', 'profile'],
  },
  {
    label: 'Run the setup again',
    description:
      'The first run, from the start: your clips folder, OBS if it is missing, and the recording setup. Nothing is reset, and every step shows what is already set.',
    section: 'recording',
    keywords: ['onboarding', 'welcome', 'wizard', 'first run', 'tour', 'advanced'],
  },
  {
    label: 'Clips folder',
    description: 'Your library, and where OBS records into. They are always the same folder.',
    section: 'recording',
    keywords: [
      'videos root',
      'move clips',
      'change folder',
      'location',
      'path',
      'drive',
      'where',
      'app',
    ],
  },
  {
    label: 'Start OBS with GoodBit',
    description:
      'Minimised, with the replay buffer running, so your key works after a restart without opening anything.',
    section: 'recording',
    keywords: ['launch', 'autostart', 'replay buffer', 'startup'],
  },
  {
    label: 'Start with Windows',
    description: 'Runs in the tray and indexes clips as they are recorded',
    section: 'recording',
    keywords: ['startup', 'login', 'boot', 'autostart', 'launch', 'app'],
  },
  {
    label: 'Keep running when the window closes',
    description:
      'Off means closing the window quits, and nothing is indexed until you open it again',
    section: 'recording',
    keywords: ['tray', 'background', 'quit', 'exit', 'close', 'app'],
  },
  {
    label: 'Say when a clip is saved',
    description:
      'A small card over the game for a few seconds, once the clip is filed and in your library. It never takes focus and clicks pass straight through it.',
    section: 'recording',
    keywords: ['overlay', 'toast', 'notification', 'popup', 'banner', 'confirmation'],
  },
  {
    label: 'Play a sound with it',
    description:
      'Two short notes. Separate from the card, since a noise and a picture are different amounts of interruption.',
    section: 'recording',
    keywords: ['chime', 'sound', 'beep', 'audio', 'notification'],
    shownWhen: 'Say when a clip is saved is on',
  },
  {
    label: 'How loud',
    description: 'Press Show me after changing it, to hear where it lands',
    section: 'recording',
    keywords: ['volume', 'loudness', 'chime', 'quiet'],
    shownWhen: 'Say when a clip is saved and Play a sound with it are both on',
  },
  {
    label: 'Where it appears',
    description: 'On whichever screen your pointer is on, which is the one you are playing on.',
    section: 'recording',
    keywords: ['corner', 'position', 'top right', 'bottom left', 'overlay', 'monitor'],
  },
  {
    label: 'Try it',
    description: 'Shows the card and plays the chime, without recording anything',
    section: 'recording',
    keywords: ['preview', 'test', 'demo', 'show me'],
  },

  // Watching
  {
    label: 'Appearance',
    description: 'Follow the system, or pick a side',
    section: 'watching',
    keywords: ['dark mode', 'light mode', 'theme', 'night', 'colour', 'color', 'general'],
  },
  {
    label: 'How clips are laid out',
    description:
      'Takes effect straight away, on the library and in a collection. The L key switches it too.',
    section: 'watching',
    keywords: [
      'view mode',
      'layout',
      'grid',
      'columns',
      'by day',
      'grouped',
      'tiles',
      'size',
      'general',
    ],
  },
  {
    label: 'Date Format',
    description: 'How dates should be displayed',
    section: 'watching',
    keywords: ['relative', 'absolute', 'today', 'yesterday', 'timestamp', 'general'],
  },
  {
    label: 'Items Per Page',
    description: 'Number of clips to load at once (lower = faster)',
    section: 'watching',
    keywords: ['page size', 'pagination', 'how many', 'load', 'slow', 'general'],
  },
  {
    label: 'Show Clip Metadata',
    description: 'Display file size, resolution, and other details',
    section: 'watching',
    keywords: ['resolution', 'file size', 'details', 'info', 'general'],
  },
  {
    label: 'Compact Mode',
    description: 'Reduce spacing and show more content',
    section: 'watching',
    keywords: ['density', 'spacing', 'smaller', 'general'],
  },
  {
    label: 'Auto-play on Hover',
    description: 'Automatically play clips when hovering over them',
    section: 'watching',
    keywords: ['preview', 'hover', 'autoplay', 'playback'],
  },
  {
    label: 'Scrub on Hover',
    description: 'Move the pointer across the bottom third of a clip to seek through it',
    section: 'watching',
    keywords: ['seek', 'preview', 'scrub', 'hover', 'playback'],
  },
  {
    label: 'Mute Videos by Default',
    description: 'Start videos muted (can be unmuted manually)',
    section: 'watching',
    keywords: ['sound', 'audio', 'volume', 'silent', 'playback'],
  },
  {
    label: 'Hidden games',
    description:
      "Hide folders you don't want in your library. The files stay on disk, they just stop showing up in clips, stats and the editor.",
    section: 'watching',
    keywords: ['hide', 'show', 'exclude', 'folder', 'game list', 'games'],
  },

  // Editing
  {
    label: 'Compress clips when trimming',
    description:
      'A trim always lands on the exact frames you chose, and it replaces the only copy of that moment. Off keeps the picture close to the recording. On squeezes it to roughly a fifth of the size.',
    section: 'editing',
    keywords: ['file size', 'quality', 'encode', 'trim', 'cut', 'smaller', 'app'],
  },
  {
    label: 'Music folder',
    description: 'Where GoodBit looks for the audio you can lay under a clip in the editor.',
    section: 'editing',
    keywords: ['audio root', 'songs', 'soundtrack', 'path', 'location', 'app'],
  },
  {
    label: 'Suggestions learn from your trims',
    description:
      'Every trim records where you cut and what GoodBit had suggested. Once there are enough, it fits a small model to those decisions and uses it instead of the built-in rule, then keeps refitting as you go. Nothing leaves this machine.',
    section: 'editing',
    // The switch inside this card reads "Learn from my trims automatically".
    // It is part of the feature rather than a row of its own, so it is a way
    // in here instead of a second entry pointing at the same card.
    keywords: [
      'highlights',
      'model',
      'calibration',
      'analysis',
      'suggestions',
      'training',
      'learn automatically',
      'advanced',
    ],
  },

  // Your data
  {
    label: 'Library backups',
    description:
      'A copy of the library is taken and read back whenever a new version of GoodBit starts, in case an update changes how things are stored. The last five are kept, and any of them can be put back. Your clips themselves are never touched. This is only the names, tags, notes and collections.',
    section: 'data',
    keywords: [
      'backup',
      'restore',
      'copy',
      'database',
      'safety',
      'tags',
      'notes',
      'lost',
      'undo',
      'advanced',
    ],
  },
  {
    label: 'Rescan the clips folder',
    description:
      'GoodBit indexes a clip the moment it is recorded and sweeps the folder every few hours, so this is rarely needed. It is the way back after a drive was unplugged, or after clips were added by something other than GoodBit.',
    section: 'data',
    keywords: ['scan', 'refresh', 'reindex', 'missing clips', 'not showing', 'app'],
  },
  {
    label: 'Confirm Before Delete',
    description: 'Ask for confirmation when deleting clips',
    section: 'data',
    keywords: ['are you sure', 'remove', 'recycle bin', 'warning', 'general'],
  },

  // Connections
  {
    label: 'Claude',
    description:
      'GoodBit can answer questions about your library and act on it: find the clip you are thinking of, tag a batch of them, say where the interesting part of a recording is, and trim to it.',
    section: 'connections',
    keywords: ['mcp', 'claude code', 'cursor', 'ai', 'assistant'],
  },
  {
    label: 'Let Claude reach this library',
    description: 'Off by default. Nothing is listening until you turn this on.',
    section: 'connections',
    keywords: ['mcp', 'server', 'token', 'port', 'listening'],
  },
  {
    label: 'Set them up for me',
    description:
      'Writes GoodBit into the config of everything below, so there is nothing to paste. Your other servers are left alone and each file is backed up first.',
    section: 'connections',
    keywords: ['mcp', 'register', 'claude code', 'cursor', 'config', 'connect'],
  },
  {
    label: 'Publisher',
    description:
      'Optional. A server that hosts public links for the clips you publish. Leave empty and publishing is simply off.',
    section: 'connections',
    keywords: ['share', 'public link', 'url', 'token', 'server', 'host', 'embed', 'app'],
  },
  {
    label: 'Compress clips when publishing',
    description:
      'The file on disk is untouched; only the copy behind the public link is re-encoded, so it downloads in a fifth of the time. Off uploads the recording as it is.',
    section: 'connections',
    keywords: ['file size', 'quality', 'share', 'upload', 'link', 'app'],
  },

  // Advanced
  {
    label: 'Keyboard shortcuts',
    description: 'Move around and act on a clip without the mouse',
    section: 'advanced',
    keywords: ['hotkeys', 'keys', 'keybindings'],
  },
  {
    label: 'Change a shortcut',
    description: 'Change any of these to whatever your hands already do',
    section: 'advanced',
    keywords: ['hotkeys', 'rebind', 'keys', 'keybindings', 'change key'],
  },
  {
    label: 'Health',
    description:
      'The app version, the encoder your graphics card offers, and the ffmpeg that is in use.',
    section: 'advanced',
    keywords: [
      'version',
      'encoder',
      'gpu',
      'ffmpeg',
      'nvenc',
      'decoding',
      'diagnostics',
      'about',
      'app',
    ],
  },
  {
    label: 'Where settings are kept',
    description: 'These preferences live on this computer and stay put between sessions.',
    section: 'advanced',
    keywords: ['settings file', 'storage', 'export', 'import', 'reset'],
  },
];
