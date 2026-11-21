import { useEffect, useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import LobbyScreen from './screens/lobby/LobbyScreen';
import NightScreen from './screens/night/NightScreen';
import DayScreen from './screens/day/DayScreen';
import HostScreen from './screens/host/HostScreen';
import SummaryScreen from './screens/summary/SummaryScreen';
import RulesAndRolesDrawer from './components/RulesAndRolesDrawer';
import { GameSessionProvider, useGameSession } from './adapters/useGameSession';
import type { ScreenName } from './navigation';

const screens = ['home', 'lobby', 'night', 'day', 'host', 'summary'] as const satisfies readonly ScreenName[];

const screenLabels: Record<ScreenName, { title: string; keyNum: string }> = {
  home: { title: 'Trang chủ', keyNum: '1' },
  lobby: { title: 'Lobby', keyNum: '2' },
  night: { title: 'Đêm', keyNum: '3' },
  day: { title: 'Ngày', keyNum: '4' },
  host: { title: 'Host', keyNum: '5' },
  summary: { title: 'Tổng kết', keyNum: '6' },
};

function AppContent() {
  const { state } = useGameSession();
  const [screen, setScreen] = useState<ScreenName>('home');
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [rulesDrawerTab, setRulesDrawerTab] = useState<'rules' | 'roles'>('rules');

  const navigate = setScreen;

  const handleOpenRules = (tab: 'rules' | 'roles' = 'rules') => {
    setRulesDrawerTab(tab);
    setRulesDrawerOpen(true);
  };

  // Tự động điều hướng theo gamePhase của GameSession
  useEffect(() => {
    const phase = state.publicView?.phase;
    if (!phase) return;

    if (phase === 'LOBBY') {
      if (screen !== 'home' && screen !== 'lobby' && screen !== 'host') {
        setScreen('lobby');
      }
    } else if (phase === 'NIGHT') {
      if (state.isHost && state.hostMode === 'CENTER_BOARD') {
        setScreen('host');
      } else {
        setScreen('night');
      }
    } else if (
      phase === 'DAY_DISCUSS' ||
      phase === 'DAY_RUNOFF' ||
      phase === 'DAY_MAYOR_ELECTION' ||
      phase === 'HUNTER_SHOT' ||
      phase === 'MAYOR_SUCCESSION'
    ) {
      if (state.isHost && state.hostMode === 'CENTER_BOARD') {
        setScreen('host');
      } else {
        setScreen('day');
      }
    } else if (phase === 'GAME_OVER') {
      setScreen('summary');
    }
  }, [state.publicView?.phase, state.isHost, state.hostMode]);

  // Bắt phím tắt bàn phím [1..6] để dev/tester chuyển nhanh khi cần
  useEffect(() => {
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
  }, [rulesDrawerOpen]);

  return (
    <>
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
