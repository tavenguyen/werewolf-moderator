import { useEffect, useMemo, useRef, useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import LobbyScreen from './screens/lobby/LobbyScreen';
import RoleRevealScreen from './screens/reveal/RoleRevealScreen';
import NightScreen from './screens/night/NightScreen';
import DayScreen from './screens/day/DayScreen';
import HostScreen from './screens/host/HostScreen';
import SummaryScreen from './screens/summary/SummaryScreen';
import RulesAndRolesDrawer from './components/RulesAndRolesDrawer';
import { GameSessionProvider, useGameSession } from './adapters/useGameSession';
import type { GamePhase } from './engine/types';
import type { ScreenName } from './navigation';

const screens = ['home', 'lobby', 'reveal', 'night', 'day', 'host', 'summary'] as const satisfies readonly ScreenName[];

const screenLabels: Record<ScreenName, { title: string; keyNum: string }> = {
  home: { title: 'Trang chủ', keyNum: '1' },
  lobby: { title: 'Lobby', keyNum: '2' },
  reveal: { title: 'Xem vai', keyNum: '3' },
  night: { title: 'Đêm', keyNum: '4' },
  day: { title: 'Ngày', keyNum: '5' },
  host: { title: 'Host', keyNum: '6' },
  summary: { title: 'Tổng kết', keyNum: '7' },
};

function AppContent() {
  const { state, isAutoResumed } = useGameSession();
  const [screen, setScreen] = useState<ScreenName>('home');
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [rulesDrawerTab, setRulesDrawerTab] = useState<'rules' | 'roles'>('rules');
  const isDevMode = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('dev') === '1',
    []
  );
  const prevPhaseRef = useRef<GamePhase | null>(null);
  const prevRoomCodeRef = useRef<string | null>(null);
  const prevAutoResumedRef = useRef(false);

  const navigate = setScreen;

  const handleOpenRules = (tab: 'rules' | 'roles' = 'rules') => {
    setRulesDrawerTab(tab);
    setRulesDrawerOpen(true);
  };

  // Tự động điều hướng theo gamePhase của GameSession (chỉ khi phase/roomCode chuyển hoặc auto-resume)
  useEffect(() => {
    const phase = state.publicView?.phase ?? null;
    const roomCode = state.publicView?.roomCode ?? (state.roomCode || null);

    if (!phase) {
      prevPhaseRef.current = null;
      prevRoomCodeRef.current = null;
      prevAutoResumedRef.current = isAutoResumed;
      return;
    }

    const phaseChanged = phase !== prevPhaseRef.current;
    const roomChanged = roomCode !== prevRoomCodeRef.current;
    const autoResumedTriggered = isAutoResumed && !prevAutoResumedRef.current;

    prevPhaseRef.current = phase;
    prevRoomCodeRef.current = roomCode;
    prevAutoResumedRef.current = isAutoResumed;

    if (!phaseChanged && !roomChanged && !autoResumedTriggered) {
      return;
    }

    const isCenterBoardHost =
      state.deviceMode === 'MULTI_DEVICE' &&
      state.isHost &&
      state.hostMode === 'CENTER_BOARD';

    setScreen((currentScreen) => {
      if (phase === 'LOBBY') {
        if (
          (currentScreen !== 'home' && currentScreen !== 'lobby') ||
          (currentScreen === 'home' && isAutoResumed)
        ) {
          return 'lobby';
        }
        return currentScreen;
      }
      if (phase === 'FIRST_NIGHT_SETUP') {
        return currentScreen !== 'reveal' ? 'reveal' : currentScreen;
      }
      if (phase === 'NIGHT') {
        const targetScreen = isCenterBoardHost ? 'host' : 'night';
        return currentScreen !== targetScreen ? targetScreen : currentScreen;
      }
      if (
        phase === 'DAY_DISCUSS' ||
        phase === 'DAY_VOTE' ||
        phase === 'DAY_RUNOFF' ||
        phase === 'DAY_MAYOR_ELECTION' ||
        phase === 'HUNTER_SHOT' ||
        phase === 'MAYOR_SUCCESSION'
      ) {
        const targetScreen = isCenterBoardHost ? 'host' : 'day';
        return currentScreen !== targetScreen ? targetScreen : currentScreen;
      }
      if (phase === 'GAME_OVER') {
        return currentScreen !== 'summary' ? 'summary' : currentScreen;
      }
      return currentScreen;
    });
  }, [
    state.publicView?.phase,
    state.publicView?.roomCode,
    state.roomCode,
    state.deviceMode,
    state.isHost,
    state.hostMode,
    isAutoResumed,
  ]);

  // Bắt phím tắt bàn phím [1..7] chỉ khi bật chế độ ?dev=1
  useEffect(() => {
    if (!isDevMode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (rulesDrawerOpen) {
        return;
      }

      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= screens.length) {
        setScreen(screens[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDevMode, rulesDrawerOpen]);

  return (
    <>
      {isDevMode && (
        <div className="demo-nav-wrapper">
          <nav className="demo-nav" aria-label="Chuyển màn hình ván đấu">
            <div className="demo-nav-label">
              <span className="hud-dot" aria-hidden="true" />
              <span>MODERATOR HUD</span>
            </div>
            <div className="demo-nav-items">
              {screens.map((item) => (
                <button
                  key={item}
                  className={screen === item ? 'demo-nav-button active' : 'demo-nav-button'}
                  onClick={() => navigate(item)}
                  title={`Nhấn phím [${screenLabels[item].keyNum}] để chuyển`}
                >
                  <span>{screenLabels[item].title}</span>
                  <kbd>{screenLabels[item].keyNum}</kbd>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      <div key={screen} className={`screen-container screen-${screen}`}>
        {screen === 'home' && (
          <HomeScreen
            onNavigate={navigate}
            onOpenRules={handleOpenRules}
            isRulesOpen={rulesDrawerOpen}
          />
        )}
        {screen === 'lobby' && (
          <LobbyScreen
            onNavigate={navigate}
            onOpenRules={handleOpenRules}
          />
        )}
        {screen === 'reveal' && (
          <RoleRevealScreen onNavigate={navigate} onOpenRules={handleOpenRules} />
        )}
        {screen === 'night' && (
          <NightScreen onNavigate={navigate} onOpenRules={handleOpenRules} />
        )}
        {screen === 'day' && (
          <DayScreen onNavigate={navigate} onOpenRules={handleOpenRules} />
        )}
        {screen === 'host' && (
          <HostScreen onNavigate={navigate} onOpenRules={handleOpenRules} />
        )}
        {screen === 'summary' && (
          <SummaryScreen onNavigate={navigate} onOpenRules={handleOpenRules} />
        )}
      </div>

      <RulesAndRolesDrawer
        isOpen={rulesDrawerOpen}
        onClose={() => setRulesDrawerOpen(false)}
        initialTab={rulesDrawerTab}
      />
    </>
  );
}

export default function App() {
  return (
    <GameSessionProvider>
      <AppContent />
    </GameSessionProvider>
  );
}
