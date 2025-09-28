import axios from '../axios';

export type GameRow = { game: string; count: number };

export async function fetchGames(): Promise<GameRow[]> {
  const { data } = await axios.get<GameRow[]>('/api/games');
  return data;
}

export async function rescanGames(): Promise<void> {
  await axios.post('/api/scan');
}


