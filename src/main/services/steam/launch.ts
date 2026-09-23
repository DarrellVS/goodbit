import { shell } from 'electron';

/**
 * Launch a game through Steam, by the name GoodBit files it under.
 *
 * `rungameid` rather than `run`, because `steam://run/<id>//<args>/` passes
 * its tail to the game as launch parameters. The appid is checked against
 * digits before it is put anywhere near a URL, and it comes from the database
 * rather than from the caller, so nothing can ask Steam to run something by
 * handing over a string. Shared by the app window and the notch's Play again.
 */
export async function launchSteamGame(
  game: string,
): Promise<{ launched: true; appId: string } | { launched: false; reason: string }> {
  const { AppDataSource } = await import('../../data-source.js');
  const { Game } = await import('../../entity/Game.js');

  const row = await AppDataSource.getRepository(Game).findOneBy({ name: game });
  const appId = row?.steamAppId ?? '';
  if (!/^\d+$/.test(appId)) return { launched: false, reason: 'not a Steam game' };

  await shell.openExternal(`steam://rungameid/${appId}`);
  return { launched: true, appId };
}
