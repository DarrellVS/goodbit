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
 * need help finding, or it would mean mounting all seven and firing all of that
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
 */
export interface SettingEntry {
  /** Exactly the label on screen, and the row's `data-setting` value. */
  label: string;
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
   * Never displayed. This is a way in, not a second description.
   */
  keywords?: string[];
}

export const SETTINGS_CATALOG: readonly SettingEntry[] = [
  // General
  {
    label: 'Appearance',
    description: 'Follow the system, or pick a side',
    section: 'general',
    keywords: ['dark mode', 'light mode', 'theme', 'night', 'colour', 'color'],
  },
  {
    label: 'How clips are laid out',
    description:
      'Takes effect straight away, on the library and in a collection. The L key switches it too.',
    section: 'general',
    keywords: ['view mode', 'layout', 'grid', 'columns', 'by day', 'grouped', 'tiles', 'size'],
  },
  {
    label: 'Date Format',
    description: 'How dates should be displayed',
    section: 'general',
    keywords: ['relative', 'absolute', 'today', 'yesterday', 'timestamp'],
  },
  {
    label: 'Show Clip Metadata',
    description: 'Display file size, resolution, and other details',
    section: 'general',
    keywords: ['resolution', 'file size', 'details', 'info'],
  },
  {
    label: 'Compact Mode',
    description: 'Reduce spacing and show more content',
    section: 'general',
    keywords: ['density', 'spacing', 'smaller'],
  },
  {
    label: 'Items Per Page',
    description: 'Number of clips to load at once (lower = faster)',
    section: 'general',
    keywords: ['page size', 'pagination', 'how many', 'load', 'slow'],
  },
  {
    label: 'Confirm Before Delete',
    description: 'Ask for confirmation when deleting clips',
    section: 'general',
    keywords: ['are you sure', 'remove', 'recycle bin', 'warning'],
  },

  // App
  {
    label: 'Clips folder',
    description: 'Your library, and where OBS records into. They are always the same folder.',
    section: 'app',
    keywords: ['videos root', 'move clips', 'change folder', 'location', 'path', 'drive', 'where'],
  },
  {
    label: 'Rescan the clips folder',
    description:
      'GoodBit indexes a clip the moment it is recorded and sweeps the folder every few hours, so this is rarely needed. It is the way back after a drive was unplugged, or after clips were added by something other than GoodBit.',
    section: 'app',
    keywords: ['scan', 'refresh', 'reindex', 'missing clips', 'not showing'],
  },
  {
    label: 'Music folder',
    description: 'Where GoodBit looks for the audio you can lay under a clip in the editor.',
    section: 'app',
    keywords: ['audio root', 'songs', 'soundtrack', 'path', 'location'],
  },
  {
    label: 'Start with Windows',
    description: 'Runs in the tray and indexes clips as they are recorded',
    section: 'app',
    keywords: ['startup', 'login', 'boot', 'autostart', 'launch'],
  },
  {
    label: 'Keep running when the window closes',
    description:
      'Off means closing the window quits, and nothing is indexed until you open it again',
    section: 'app',
    keywords: ['tray', 'background', 'quit', 'exit', 'close'],
  },
  {
    label: 'Compress clips when trimming',
    description:
      'A trim always lands on the exact frames you chose, and it replaces the only copy of that moment. Off keeps the picture close to the recording. On squeezes it to roughly a fifth of the size.',
    section: 'app',
    keywords: ['file size', 'quality', 'encode', 'trim', 'cut', 'smaller'],
  },
  {
    label: 'Compress clips when publishing',
    description:
      'The file on disk is untouched; only the copy behind the public link is re-encoded, so it downloads in a fifth of the time. Off uploads the recording as it is.',
    section: 'app',
    keywords: ['file size', 'quality', 'share', 'upload', 'link'],
  },
  {
    label: 'Publisher',
    description:
      'Optional. A server that hosts public links for the clips you publish. Leave empty and publishing is simply off.',
    section: 'app',
    keywords: ['share', 'public link', 'url', 'token', 'server', 'host', 'embed'],
  },
  {
    label: 'Health',
    description:
      'The app version, the encoder your graphics card offers, and the ffmpeg that is in use.',
    section: 'app',
    keywords: ['version', 'encoder', 'gpu', 'ffmpeg', 'nvenc', 'decoding', 'diagnostics', 'about'],
  },

  // Recording
  {
    label: 'OBS setup',
    description:
      'Whether OBS is installed, set up, and recording into your library, and the wizard that fixes it when it is not.',
    section: 'recording',
    keywords: ['obs', 'replay buffer', 'hotkey', 'wizard', 'install', 'encoder', 'scene', 'profile'],
  },
  {
    label: 'Start OBS with GoodBit',
    description:
      'Minimised, with the replay buffer running, so your key works after a restart without opening anything.',
    section: 'recording',
    keywords: ['launch', 'autostart', 'replay buffer', 'startup'],
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
  },
  {
    label: 'How loud',
    description: 'Press Show me after changing it, to hear where it lands',
    section: 'recording',
    keywords: ['volume', 'loudness', 'chime', 'quiet'],
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

  // Games
  {
    label: 'Hidden games',
    description:
      "Hide folders you don't want in your library. The files stay on disk, they just stop showing up in clips, stats and the editor.",
    section: 'games',
    keywords: ['hide', 'show', 'exclude', 'folder', 'game list'],
  },

  // Playback
  {
    label: 'Auto-play on Hover',
    description: 'Automatically play clips when hovering over them',
    section: 'playback',
    keywords: ['preview', 'hover', 'autoplay'],
  },
  {
    label: 'Scrub on Hover',
    description: 'Move the pointer across the bottom third of a clip to seek through it',
    section: 'playback',
    keywords: ['seek', 'preview', 'scrub', 'hover'],
  },
  {
    label: 'Mute Videos by Default',
    description: 'Start videos muted (can be unmuted manually)',
    section: 'playback',
    keywords: ['sound', 'audio', 'volume', 'silent'],
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

  // Advanced
  {
    label: 'Run the setup again',
    description:
      'The first run, from the start: your clips folder, OBS if it is missing, and the recording setup. Nothing is reset, and every step shows what is already set.',
    section: 'advanced',
    keywords: ['onboarding', 'welcome', 'wizard', 'first run', 'tour'],
  },
  {
    label: 'Enable Keyboard Shortcuts',
    description: 'Use keyboard shortcuts for navigation and actions',
    section: 'advanced',
    keywords: ['hotkeys', 'keys', 'keybindings'],
  },
  {
    label: 'Keyboard Shortcut Customization',
    description: 'Customize keyboard shortcuts to match your workflow',
    section: 'advanced',
    keywords: ['hotkeys', 'rebind', 'keys', 'keybindings', 'change key'],
  },
  {
    label: 'Suggestions learn from your trims',
    description:
      'Every trim records where you cut and what GoodBit had suggested. Once there are enough, it fits a small model to those decisions and uses it instead of the built-in rule, then keeps refitting as you go. Nothing leaves this machine.',
    section: 'advanced',
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
    ],
  },
  {
    label: 'Library backups',
    description:
      'A copy of the library is taken and read back whenever a new version of GoodBit starts, in case an update changes how things are stored. The last five are kept, and any of them can be put back. Your clips themselves are never touched. This is only the names, tags, notes and collections.',
    section: 'advanced',
    keywords: ['backup', 'restore', 'copy', 'database', 'safety', 'tags', 'notes', 'lost', 'undo'],
  },
  {
    label: 'Where settings are kept',
    description: 'These preferences live on this computer and stay put between sessions.',
    section: 'advanced',
    keywords: ['settings file', 'storage', 'export', 'import', 'reset'],
  },
];
