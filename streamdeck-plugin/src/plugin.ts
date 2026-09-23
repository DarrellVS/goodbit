import streamDeck from '@elgato/streamdeck';
import { DiscardLatest } from './actions/discard-latest.js';
import { PublishLatest } from './actions/publish-latest.js';
import { SaveReplay } from './actions/save-replay.js';
import { Stats } from './actions/stats.js';
import { TagLatest } from './actions/tag-latest.js';

/**
 * GoodBit's Stream Deck plugin.
 *
 * Keys for the clip you just saved: save the replay, then tag, publish or
 * discard it, and a count on the key. Saving presses the hotkey OBS already
 * has, from inside GoodBit, so nothing in OBS is reconfigured for it.
 */
streamDeck.actions.registerAction(new SaveReplay());
streamDeck.actions.registerAction(new TagLatest());
streamDeck.actions.registerAction(new PublishLatest());
streamDeck.actions.registerAction(new DiscardLatest());
streamDeck.actions.registerAction(new Stats());

void streamDeck.connect();
