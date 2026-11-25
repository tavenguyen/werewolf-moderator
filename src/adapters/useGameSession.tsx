import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type {
  CreateRoomOptions,
  DeviceMode,
  GameSessionAdapter,
  GameSessionState,
  NightActionInput,
} from './types';
import { SocketAdapter } from './socketAdapter';
import { LocalEngineAdapter } from './localEngineAdapter';
import type { PlayerId, RoomSettings } from '../engine/types';
import { requestWakeLock, releaseWakeLock } from '../utils/wakeLock';
import { audioController } from '../audio/audioController';

export interface GameSessionContextValue {
  state: GameSessionState;
  adapter: GameSessionAdapter;
  deviceMode: DeviceMode;
  setDeviceMode: (mode: DeviceMode) => void;
  actions: {
    createRoom: (options: CreateRoomOptions) => Promise<{ roomCode: string }>;
    joinRoom: (roomCode: string, username: string) => Promise<{ playerId: PlayerId; seatIndex: number }>;
    resumeSession: () => Promise<boolean>;
    hasRecoverableSession: () => boolean;
    leaveRoom: () => Promise<void>;
    updateSettings: (settings: Partial<RoomSettings>) => Promise<void>;
    startGame: (customRoleIds?: string[]) => Promise<void>;
    startFirstNight: () => Promise<void>;
    sendNightAction: (roleId: string, action: NightActionInput) => Promise<void>;
    sendDayVote: (targetPlayerId: PlayerId | null) => Promise<void>;
    sendHunterShot: (targetPlayerId: PlayerId | null) => Promise<void>;
    sendMayorTransfer: (successorPlayerId: PlayerId | null) => Promise<void>;
    sendMayorElect: (candidateId: PlayerId | null) => Promise<void>;
    finalizePublicVote: () => Promise<void>;
    hostPause: () => Promise<void>;
    hostResume: () => Promise<void>;
    hostExtendTime: () => Promise<void>;
    hostEmergencyEliminate: (targetPlayerId: PlayerId) => Promise<void>;
    hostRematch: () => Promise<void>;
    setLocalActivePlayer: (playerId: PlayerId) => void;
    advanceLocalTurn: () => void;
    addOfflinePlayer: (name: string) => void;
    removeOfflinePlayer: (playerId: PlayerId) => void;
  };
}

const GameSessionContext = createContext<GameSessionContextValue | null>(null);

export interface GameSessionProviderProps {
  children: React.ReactNode;
  initialDeviceMode?: DeviceMode;
}

export function GameSessionProvider({
  children,
  initialDeviceMode = 'MULTI_DEVICE',
}: GameSessionProviderProps) {
  const [deviceMode, setDeviceModeState] = useState<DeviceMode>(initialDeviceMode);

  // Khởi tạo 2 adapter đơn nhất
  const socketAdapter = useMemo(() => new SocketAdapter(), []);
  const localEngineAdapter = useMemo(() => new LocalEngineAdapter(), []);

  const activeAdapter: GameSessionAdapter = useMemo(() => {
    return deviceMode === 'SINGLE_DEVICE' ? localEngineAdapter : socketAdapter;
  }, [deviceMode, localEngineAdapter, socketAdapter]);

  const [state, setState] = useState<GameSessionState>(() => activeAdapter.getState());

  useEffect(() => {
    setState(activeAdapter.getState());
    const unsubscribe = activeAdapter.subscribe((newState) => {
      setState(newState);
    });
    return unsubscribe;
  }, [activeAdapter]);

  // Quản lý Screen Wake Lock: Giữ sáng màn hình khi đang trong ván chơi (không phải LOBBY và không phải GAME_OVER)
  useEffect(() => {
    const phase = state.publicView?.phase;
    if (phase && phase !== 'LOBBY' && phase !== 'GAME_OVER') {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
      if (phase === 'GAME_OVER') {
        audioController.stopAll();
      }
    }
  }, [state.publicView?.phase]);

  // Điều phối âm thanh tự động cho Host trong chế độ nhiều máy (MULTI_DEVICE)
  // Quy tắc SKILL: Chỉ Host mới được phát loa công cộng, máy người chơi tuyệt đối im lặng
  useEffect(() => {
    if (deviceMode !== 'MULTI_DEVICE' || !state.isHost) {
      return;
    }

    const phase = state.publicView?.phase;
    if (!phase) return;

    if (phase === 'NIGHT') {
      audioController.playNightBGM();
      const currentTurn = state.publicView?.currentTurnInfo?.turnKey;
      if (currentTurn) {
        audioController.playTurnNarration(currentTurn);
      }
    } else if (phase === 'DAY_DISCUSS') {
      audioController.stopNightBGM();
      // Hiệu lệnh sáng dậy và thảo luận
      audioController.playTurnNarration('night_end', () => {
        audioController.playTurnNarration('day_discuss');
      });
    } else if (phase === 'GAME_OVER') {
      audioController.stopAll();
    }
  }, [
    deviceMode,
    state.isHost,
    state.publicView?.phase,
    state.publicView?.currentTurnInfo?.turnKey,
  ]);

  const setDeviceMode = (mode: DeviceMode) => {
    audioController.setDeviceMode(mode);
    setDeviceModeState(mode);
  };

  useEffect(() => {
    audioController.setDeviceMode(deviceMode);
  }, [deviceMode]);

  const actions = useMemo(() => {
    return {
      createRoom: async (options: CreateRoomOptions) => {
        const mode = options.deviceMode ?? deviceMode;
        if (mode !== deviceMode) {
          setDeviceMode(mode);
        }
        if (typeof localStorage !== 'undefined') {
          try {
            if (mode === 'SINGLE_DEVICE') {
              localStorage.removeItem('werewolf_socket_session');
            } else {
              localStorage.removeItem('werewolf_local_game_session');
            }
          } catch {
            // ignore storage errors
          }
        }
        const targetAdapter = mode === 'SINGLE_DEVICE' ? localEngineAdapter : socketAdapter;
        return targetAdapter.createRoom(options);
      },
      joinRoom: async (roomCode: string, username: string) => {
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem('werewolf_local_game_session');
          } catch {
            // ignore storage errors
          }
        }
        return activeAdapter.joinRoom(roomCode, username);
      },
      resumeSession: async () => {
        // Thử resume local trước, nếu không được thử socket
        const localOk = await localEngineAdapter.resumeSession();
        if (localOk) {
          setDeviceMode('SINGLE_DEVICE');
          return true;
        }
        const socketOk = await socketAdapter.resumeSession();
        if (socketOk) {
          setDeviceMode('MULTI_DEVICE');
          return true;
        }
        return false;
      },
      hasRecoverableSession: () => {
        return localEngineAdapter.hasRecoverableSession() || socketAdapter.hasRecoverableSession();
      },
      leaveRoom: async () => {
        audioController.stopAll();
        await activeAdapter.leaveRoom();
        await releaseWakeLock();
      },
      updateSettings: async (settings: Partial<RoomSettings>) => {
        return activeAdapter.updateSettings(settings);
      },
      startGame: async (customRoleIds?: string[]) => {
        return activeAdapter.startGame(customRoleIds);
      },
      startFirstNight: async () => {
        if (activeAdapter.startFirstNight) {
          return activeAdapter.startFirstNight();
        }
      },
      sendNightAction: async (roleId: string, action: NightActionInput) => {
        return activeAdapter.sendNightAction(roleId, action);
      },
      sendDayVote: async (targetPlayerId: PlayerId | null) => {
        return activeAdapter.sendDayVote(targetPlayerId);
      },
      sendHunterShot: async (targetPlayerId: PlayerId | null) => {
        return activeAdapter.sendHunterShot(targetPlayerId);
      },
      sendMayorTransfer: async (successorPlayerId: PlayerId | null) => {
        return activeAdapter.sendMayorTransfer(successorPlayerId);
      },
      sendMayorElect: async (candidateId: PlayerId | null) => {
        return activeAdapter.sendMayorElect(candidateId);
      },
      finalizePublicVote: async () => {
        return activeAdapter.finalizePublicVote();
      },
      hostPause: async () => {
        return activeAdapter.hostPause();
      },
      hostResume: async () => {
        return activeAdapter.hostResume();
      },
      hostExtendTime: async () => {
        return activeAdapter.hostExtendTime();
      },
      hostEmergencyEliminate: async (targetPlayerId: PlayerId) => {
        return activeAdapter.hostEmergencyEliminate(targetPlayerId);
      },
      hostRematch: async () => {
        audioController.stopAll();
        return activeAdapter.hostRematch();
      },
      setLocalActivePlayer: (playerId: PlayerId) => {
        if (activeAdapter.setLocalActivePlayer) {
          activeAdapter.setLocalActivePlayer(playerId);
        }
      },
      advanceLocalTurn: () => {
        if (activeAdapter.advanceLocalTurn) {
          activeAdapter.advanceLocalTurn();
        }
      },
      addOfflinePlayer: (name: string) => {
        if (activeAdapter.addOfflinePlayer) {
          activeAdapter.addOfflinePlayer(name);
        }
      },
      removeOfflinePlayer: (playerId: PlayerId) => {
        if (activeAdapter.removeOfflinePlayer) {
          activeAdapter.removeOfflinePlayer(playerId);
        }
      },
    };
  }, [activeAdapter, deviceMode, localEngineAdapter, socketAdapter]);

  const value: GameSessionContextValue = {
    state,
    adapter: activeAdapter,
    deviceMode,
    setDeviceMode,
    actions,
  };

  return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession(): GameSessionContextValue {
  const context = useContext(GameSessionContext);
  if (!context) {
    throw new Error('useGameSession phải được sử dụng bên trong GameSessionProvider');
  }
  return context;
}
