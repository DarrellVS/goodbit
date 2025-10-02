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


