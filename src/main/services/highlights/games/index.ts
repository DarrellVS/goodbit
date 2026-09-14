/**
 * Every game module there is.
 *
 * Importing this file is what registers them, so it is imported once at boot
 * rather than from whichever code path happens to run first — a module that
 * registers late is a module that silently did nothing for the clip already
 * being analysed.
 */
import './battlefield.js';

export {};
