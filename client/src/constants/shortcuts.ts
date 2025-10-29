/**
 * Keyboard Shortcut Action Definitions
 * 
 * Defines all available actions that can be mapped to keyboard shortcuts.
 * Each action has an ID, label, description, and category.
 */

export interface ShortcutAction {
  id: string;
  label: string;
  description: string;
  category: 'global' | 'clips' | 'editor' | 'collection';
  defaultKey?: ShortcutKey;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // Global Navigation
  {
    id: 'nav-library',
    label: 'Go to Library',
    description: 'Navigate to the main clips library',
    category: 'global',
    defaultKey: 'KeyG',
  },
  {
    id: 'nav-settings',
    label: 'Go to Settings',
    description: 'Navigate to settings page',
    category: 'global',
    defaultKey: 'KeyS',
  },
  {
    id: 'focus-search',
    label: 'Focus Search',
    description: 'Focus the global search input',
    category: 'global',
    defaultKey: 'Slash',
  },
  
  // Clips Page Actions
  {
    id: 'toggle-view-mode',
    label: 'Toggle View Mode',
    description: 'Switch between grid and grouped view',
    category: 'clips',
    defaultKey: 'KeyL',
  },
  {
    id: 'exit-selection',
    label: 'Exit Selection Mode',
    description: 'Exit batch selection mode',
    category: 'clips',
    defaultKey: 'Escape',
  },
  {
    id: 'page-next',
    label: 'Next Page',
    description: 'Navigate to next page of clips',
    category: 'clips',
    defaultKey: 'ArrowRight',
  },
  {
    id: 'page-previous',
    label: 'Previous Page',
    description: 'Navigate to previous page of clips',
    category: 'clips',
    defaultKey: 'ArrowLeft',
  },
  {
    id: 'scroll-down',
    label: 'Scroll Down',
    description: 'Scroll page down',
    category: 'clips',
    defaultKey: 'ArrowDown',
  },
  {
    id: 'scroll-up',
    label: 'Scroll Up',
    description: 'Scroll page up',
    category: 'clips',
    defaultKey: 'ArrowUp',
  },
  
  // Editor Actions
  {
    id: 'editor-play-pause',
    label: 'Play/Pause',
    description: 'Toggle video playback in editor',
    category: 'editor',
    defaultKey: 'Space',
  },
  {
    id: 'editor-skip-backward',
    label: 'Skip Backward',
    description: 'Skip backward in editor timeline',
    category: 'editor',
    defaultKey: 'ArrowLeft',
  },
  {
    id: 'editor-skip-forward',
    label: 'Skip Forward',
    description: 'Skip forward in editor timeline',
    category: 'editor',
    defaultKey: 'ArrowRight',
  },
  {
    id: 'editor-delete-clip',
    label: 'Delete Clip',
    description: 'Delete selected clip from timeline',
    category: 'editor',
    defaultKey: 'Delete',
  },
];

export type ShortcutKey = 
  | 'Space' 
  | 'ArrowLeft' 
  | 'ArrowRight' 
  | 'ArrowUp' 
  | 'ArrowDown'
  | 'Delete' 
  | 'Escape'
  | 'KeyG'
  | 'KeyL'
  | 'KeyS'
  | 'KeyF'
  | 'Slash'
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9';

export const ALL_KEYS: ShortcutKey[] = [
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Delete', 'Escape', 'Slash',
  'KeyG', 'KeyL', 'KeyS', 'KeyF', 'KeyA', 'KeyB', 'KeyC', 'KeyD',
  'KeyE', 'KeyH', 'KeyI', 'KeyJ', 'KeyK', 'KeyM', 'KeyN', 'KeyO',
  'KeyP', 'KeyQ', 'KeyR', 'KeyT', 'KeyU', 'KeyV', 'KeyW', 'KeyX',
  'KeyY', 'KeyZ',
  'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'Digit6', 'Digit7', 'Digit8', 'Digit9',
];

export function getKeyDisplayName(key: ShortcutKey): string {
  const keyMap: Record<string, string> = {
    Space: 'Space',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Delete: 'Delete',
    Escape: 'Esc',
    Slash: '/',
    KeyG: 'G',
    KeyL: 'L',
    KeyS: 'S',
    KeyF: 'F',
    KeyA: 'A',
    KeyB: 'B',
    KeyC: 'C',
    KeyD: 'D',
    KeyE: 'E',
    KeyH: 'H',
    KeyI: 'I',
    KeyJ: 'J',
    KeyK: 'K',
    KeyM: 'M',
    KeyN: 'N',
    KeyO: 'O',
    KeyP: 'P',
    KeyQ: 'Q',
    KeyR: 'R',
    KeyT: 'T',
    KeyU: 'U',
    KeyV: 'V',
    KeyW: 'W',
    KeyX: 'X',
    KeyY: 'Y',
    KeyZ: 'Z',
    Digit0: '0',
    Digit1: '1',
    Digit2: '2',
    Digit3: '3',
    Digit4: '4',
    Digit5: '5',
    Digit6: '6',
    Digit7: '7',
    Digit8: '8',
    Digit9: '9',
  };
  return keyMap[key] || key;
}

export function getDefaultShortcuts(): Record<string, ShortcutKey> {
  const defaults: Record<string, ShortcutKey> = {};
  SHORTCUT_ACTIONS.forEach(action => {
    if (action.defaultKey) {
      defaults[action.id] = action.defaultKey as ShortcutKey;
    }
  });
  return defaults;
}

