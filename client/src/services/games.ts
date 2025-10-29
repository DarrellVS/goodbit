import axios from '../axios';
import type { GameDTO } from '../../../shared';

export type GameRow = GameDTO;

export async function fetchGames(): Promise<GameDTO[]> {
  const { data } = await axios.get<GameDTO[]>('/api/games');
  return data;
}

export async function rescanGames(): Promise<void> {
  await axios.post('/api/scan');
}

export async function updateGameName(gameName: string, displayName: string | null): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { displayName });
}


