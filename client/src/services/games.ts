import axios from '../axios';
import type { Game } from '../types/game';

export type GameRow = Game;

export async function fetchGames(): Promise<Game[]> {
  const { data } = await axios.get<Game[]>('/api/games');
  return data;
}

export async function rescanGames(): Promise<void> {
  await axios.post('/api/scan');
}

export async function updateGameName(gameName: string, displayName: string | null): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { displayName });
}


