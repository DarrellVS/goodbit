import axios from '@renderer/axios';
import type { Game } from '@renderer/types/game';

export type GameRow = Game;

/**
 * Games the UI should show. Hidden games are left out unless asked for,
 * only the settings screen that manages hiding wants them.
 */
export async function fetchGames(includeHidden = false): Promise<Game[]> {
  const { data } = await axios.get<Game[]>('/api/games', {
    params: includeHidden ? { includeHidden: 'true' } : undefined,
  });
  return data;
}

/** What a scan found, so the window can say so rather than just spinning. */
export interface ScanResult {
  /** Clips in games the user has hidden, which the library header leaves out. */
  hidden?: number;
  added: number;
  updated: number;
  removed: number;
  total: number;
  /**
   * Present when pruning was refused because the folder looked wrong rather
   * than emptied, an unmounted drive being the usual cause. Worth telling
   * somebody about: their library is intact but the scan did not trust itself.
   */
  pruneSkipped?: { reason: string; wouldHaveRemoved: number };
}

export async function rescanGames(): Promise<ScanResult> {
  const { data } = await axios.post<ScanResult>('/api/scan');
  return data;
}

export async function updateGameName(gameName: string, displayName: string | null): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { displayName });
}

export async function setGameHidden(gameName: string, hidden: boolean): Promise<void> {
  await axios.patch(`/api/games/${encodeURIComponent(gameName)}`, { hidden });
}
