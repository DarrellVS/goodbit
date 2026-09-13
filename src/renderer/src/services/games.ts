import axios from '../axios';
import type { Game } from '../types/game';

export type GameRow = Game;

/**
 * Games the UI should show. Hidden games are left out unless asked for —
 * only the settings screen that manages hiding wants them.
 */
export async function fetchGames(includeHidden = false): Promise<Game[]> {
  const { data } = await axios.get<Game[]>('/api/games', {
    params: includeHidden ? { includeHidden: 'true' } : undefined,
  });
  return data;
}

export async function rescanGames(): Promise<void> {
  await axios.post('/api/scan');
}

export async function updateGameName(gameName: string, displayName: string | null): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { displayName });
}

export async function setGameHidden(gameName: string, hidden: boolean): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { hidden });
}
