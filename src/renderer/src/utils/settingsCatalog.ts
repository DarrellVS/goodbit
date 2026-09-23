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
    description: 'Where your clips are recorded and kept.',
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
    label: 'Recording quality',
    description:
      'Applies to new recordings.',
    section: 'recording',
    keywords: [
      'quality',
      'compression',
      'bitrate',
      'file size',
      'obs',
      'recqual',
      'lossless',
      'size',
    ],
    shownWhen: 'OBS is installed',
  },
  {
    label: 'Start OBS with GoodBit',
    description:
      'Minimised, with the replay buffer on.',
    section: 'recording',
    keywords: ['launch', 'autostart', 'replay buffer', 'startup'],
  },
  {
    label: 'Start with Windows',
    description: 'Runs in the tray.',
    section: 'recording',
    keywords: ['startup', 'login', 'boot', 'autostart', 'launch', 'app'],
  },
  {
    label: 'Keep running when the window closes',
    description:
      'Off quits GoodBit when you close the window.',
    section: 'recording',
    keywords: ['tray', 'background', 'quit', 'exit', 'close', 'app'],
  },
  {
    label: 'Show the notch',
    description:
      'Off means nothing is drawn over other apps.',
    section: 'recording',
    keywords: ['overlay', 'notch', 'island', 'status', 'bar', 'popup', 'toast'],
  },
  {
    label: 'Keep it on the desktop',
    description:
      "A thin status line at the top. Hover it for today's clips. Hidden in games and fullscreen.",
    section: 'recording',
    keywords: ['always on', 'line', 'status', 'hover', 'minimised', 'widget'],
    shownWhen: 'Show the notch is on',
  },
  {
    label: 'Open after resting for',
    description: 'How long to hover before it opens.',
    section: 'recording',
    keywords: ['delay', 'hover', 'wait', 'dwell', 'speed', 'milliseconds', 'notch'],
    shownWhen: 'Show the notch and Keep it on the desktop are both on',
  },
  {
    label: 'Close after leaving for',
    description: 'How long it stays after the pointer leaves.',
    section: 'recording',
    keywords: ['delay', 'hover', 'close', 'hide', 'grace', 'milliseconds', 'notch'],
    shownWhen: 'Show the notch and Keep it on the desktop are both on',
  },
  {
    label: 'Panels beside it',
    description: 'Tiles either side of the open notch.',
    section: 'recording',
    keywords: ['wings', 'panels', 'tiles', 'widgets', 'side', 'notch', 'dashboard'],
    shownWhen: 'Show the notch is on',
  },
  {
    label: 'Arrange the panels',
    description: 'Drag tiles in, move them, or drag them out. Two-cell tiles turn either way.',
    section: 'recording',
    keywords: ['layout', 'tiles', 'drag', 'widgets', 'wings', 'customise', 'customize', 'rotate'],
    shownWhen: 'Show the notch is on and Panels beside it is not Off',
  },
  {
    label: 'Say when a clip is saved',
    description:
      'Saving, then saved. Also over games.',
    section: 'recording',
    keywords: ['overlay', 'toast', 'notification', 'popup', 'banner', 'confirmation'],
    shownWhen: 'Show the notch is on',
  },
  {
    label: 'Play a sound with it',
    description:
      'Two short notes.',
    section: 'recording',
    keywords: ['chime', 'sound', 'beep', 'audio', 'notification'],
    shownWhen: 'Show the notch and Say when a clip is saved are both on',
  },
  {
    label: 'How loud',
    description: 'Use Show me to hear it.',
    section: 'recording',
    keywords: ['volume', 'loudness', 'chime', 'quiet'],
    shownWhen: 'Show the notch, Say when a clip is saved and Play a sound with it are all on',
  },
  {
    label: 'Try it',
    description: 'Preview the notch and the sound.',
    section: 'recording',
    keywords: ['preview', 'test', 'demo', 'show me'],
  },
  {
    label: 'Look for GoodBits when a game closes',
    description:
      "Checks that session's clips once you close the game.",
    section: 'recording',
    keywords: [
      'analyse',
      'analyze',
      'suggestions',
      'automatic',
      'background',
      'session',
      'idle',
      'highlights',
    ],
  },
  {
    label: 'Say what it found',
    description:
      'Shows the result in the notch.',
    section: 'recording',
    keywords: ['overlay', 'toast', 'notification', 'silent', 'card', 'notch'],
    shownWhen: 'Show the notch and Look for GoodBits when a game closes are both on',
  },
  {
    label: 'Play a sound with that one',
    description:
      'A short sound when it finds something.',
    section: 'recording',
    keywords: ['chime', 'sound', 'beep', 'audio', 'notification'],
    shownWhen: 'Show the notch, Look for GoodBits when a game closes and Say what it found are all on',
  },
  {
    label: 'Try that one',
    description: 'Preview it.',
    section: 'recording',
    keywords: ['preview', 'test', 'demo', 'show me'],
    shownWhen: 'Show the notch, Look for GoodBits when a game closes and Say what it found are all on',
  },

  // Watching
  {
    label: 'Appearance',
    description: 'Light, dark or match your system.',
    section: 'watching',
    keywords: ['dark mode', 'light mode', 'theme', 'night', 'colour', 'color', 'general'],
  },
  {
    label: 'How clips are laid out',
    description:
      'Also switch with L.',
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
    description: 'Relative or exact dates.',
    section: 'watching',
    keywords: ['relative', 'absolute', 'today', 'yesterday', 'timestamp', 'general'],
  },
  {
    label: 'Items Per Page',
    description: 'Fewer loads faster.',
    section: 'watching',
    keywords: ['page size', 'pagination', 'how many', 'load', 'slow', 'general'],
  },
  {
    label: 'Show Clip Metadata',
    description: 'File size, resolution and more on each clip.',
    section: 'watching',
    keywords: ['resolution', 'file size', 'details', 'info', 'general'],
  },
  {
    label: 'Compact Mode',
    description: 'Less spacing, more clips.',
    section: 'watching',
    keywords: ['density', 'spacing', 'smaller', 'general'],
  },
  {
    label: 'Auto-play on Hover',
    description: 'Play a clip when you hover it.',
    section: 'watching',
    keywords: ['preview', 'hover', 'autoplay', 'playback'],
  },
  {
    label: 'Scrub on Hover',
    description: 'Hover the bottom of a clip to seek.',
    section: 'watching',
    keywords: ['seek', 'preview', 'scrub', 'hover', 'playback'],
  },
  {
    label: 'Mute Videos by Default',
    description: 'Start clips muted.',
    section: 'watching',
    keywords: ['sound', 'audio', 'volume', 'silent', 'playback'],
  },
  {
    label: 'Hidden games',
    description:
      "Hidden games don't show in your library. The files stay on disk.",
    section: 'watching',
    keywords: ['hide', 'show', 'exclude', 'folder', 'game list', 'games'],
  },

  // Editing
  {
    label: 'Compress clips when trimming',
    description:
      'Much smaller files, slightly lower quality.',
    section: 'editing',
    keywords: ['file size', 'quality', 'encode', 'trim', 'cut', 'smaller', 'app'],
  },
  {
    label: 'Music folder',
    description: 'Music for the editor.',
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
      'Names, tags, notes and collections. Taken on every update; the last five are kept.',
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
      'Only needed after adding clips outside GoodBit or reconnecting a drive.',
    section: 'data',
    keywords: ['scan', 'refresh', 'reindex', 'missing clips', 'not showing', 'app'],
  },
  {
    label: 'Call a clip forgotten after',
    description:
      'When untouched clips show up in Storage Saver.',
    section: 'data',
    keywords: ['storage', 'saver', 'space', 'disk', 'cleanup', 'unreviewed', 'old', 'forgotten'],
  },
  {
    label: 'Treat saves this close as one moment',
    description:
      'Saves closer together than this count as duplicates.',
    section: 'data',
    keywords: ['storage', 'saver', 'burst', 'duplicate', 'twice', 'space', 'disk'],
  },
  {
    label: 'Confirm Before Delete',
    description: 'Ask before deleting a clip.',
    section: 'data',
    keywords: ['are you sure', 'remove', 'recycle bin', 'warning', 'general'],
  },

  // Connections
  {
    label: 'Stream Deck',
    description:
      "Keys that save the replay, tag, publish or throw away the clip you just saved, and show today's count, without leaving the game. Install the plugin from here.",
    section: 'connections',
    keywords: ['stream deck', 'elgato', 'keys', 'buttons', 'hotkey', 'macro', 'plugin', 'replay', 'install'],
  },
  {
    label: 'Let the Stream Deck reach this library',
    description: 'Needed for the GoodBit plugin.',
    section: 'connections',
    keywords: ['stream deck', 'elgato', 'server', 'connection', 'pipe'],
    shownWhen: 'always, in the Stream Deck block',
  },
  {
    label: 'Let a key throw away the last clip',
    description:
      'Hold the key to delete. Clips you tagged, starred or wrote a note on are kept.',
    section: 'connections',
    keywords: ['stream deck', 'discard', 'delete', 'trash', 'recycle bin'],
    shownWhen: 'Let the Stream Deck reach this library is on',
  },
  {
    label: 'Claude',
    description:
      'GoodBit can answer questions about your library and act on it: find the clip you are thinking of, tag a batch of them, say where the interesting part of a recording is, and trim to it.',
    section: 'connections',
    keywords: ['mcp', 'claude code', 'cursor', 'ai', 'assistant'],
  },
  {
    label: 'Let Claude reach this library',
    description: 'Needed for the GoodBit plugin.',
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
      'Share clips with a link, from your own server.',
    section: 'connections',
    keywords: ['share', 'public link', 'url', 'token', 'server', 'host', 'embed', 'app'],
  },
  {
    label: 'Compress clips when publishing',
    description:
      'Faster to watch. Your own file is untouched.',
    section: 'connections',
    keywords: ['file size', 'quality', 'share', 'upload', 'link', 'app'],
  },

  // Advanced
  {
    label: 'Keyboard shortcuts',
    description: 'Use the app without the mouse.',
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
];
