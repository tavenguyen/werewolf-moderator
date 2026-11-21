import { createInitialGameState, type PlayerSetupInput } from '../gameEngine';
import type { GameState, RoomSettings } from '../types';

export function createTestPlayers(count: number): PlayerSetupInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    seatIndex: i,
  }));
}

export function createTestGame(
  roleIds: string[],
  settings: Partial<RoomSettings> = {}
): GameState {
  const players = createTestPlayers(roleIds.length);
  return createInitialGameState(players, roleIds, settings);
}
