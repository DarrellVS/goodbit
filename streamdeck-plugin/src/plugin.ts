import streamDeck from '@elgato/streamdeck';
import { DiscardLatest } from './actions/discard-latest.js';
import { PublishLatest } from './actions/publish-latest.js';
import { Stats } from './actions/stats.js';
import { TagLatest } from './actions/tag-latest.js';

/**
 * GoodBit's Stream Deck plugin.
 *
 * Keys for what only GoodBit knows about: tagging, publishing or discarding
 * the clip you just saved, and a count on the key. The key that *saves* a
 * replay is not here, deliberately: GoodBit has no channel into OBS to press
 * it, and Elgato's own OBS Studio plugin already does exactly that key.
 */
streamDeck.actions.registerAction(new TagLatest());
streamDeck.actions.registerAction(new PublishLatest());
streamDeck.actions.registerAction(new DiscardLatest());
streamDeck.actions.registerAction(new Stats());

void streamDeck.connect();
