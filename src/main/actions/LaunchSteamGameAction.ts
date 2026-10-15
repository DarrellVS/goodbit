import { BaseAction } from './BaseAction.js';
import { launchSteamGame } from '../services/steam/launch.js';

export interface LaunchSteamGameInput {
  /** The Game row's own name (its folder name), already resolved by the caller from an id GoodBit sent. */
  game: string;
}

export type LaunchSteamGameOutput = { launched: true; appId: string } | { launched: false; reason: string };

/**
 * Start a game through Steam.
 *
 * A wrapper rather than a copy: `launchSteamGame` reads the appid from the
 * Game row, checks it is digits and uses `rungameid`, so nothing a caller sends
 * ever reaches a `steam://` URL.
 */
export class LaunchSteamGameAction extends BaseAction<LaunchSteamGameInput, LaunchSteamGameOutput> {
  async execute({ game }: LaunchSteamGameInput): Promise<LaunchSteamGameOutput> {
    return launchSteamGame(game);
  }
}
