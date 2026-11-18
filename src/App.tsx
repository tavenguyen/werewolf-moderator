import { useEffect, useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import LobbyScreen from './screens/lobby/LobbyScreen';
import NightScreen from './screens/night/NightScreen';
import DayScreen from './screens/day/DayScreen';
import HostScreen from './screens/host/HostScreen';
import SummaryScreen from './screens/summary/SummaryScreen';
import RulesAndRolesDrawer from './components/RulesAndRolesDrawer';
import { defaultLobbyDemoState, type LobbyDemoState } from './screens/lobby/lobbyTypes';
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

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('home');
  const [lobbyState, setLobbyState] = useState<LobbyDemoState>(defaultLobbyDemoState);
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false);
  const [rulesDrawerTab, setRulesDrawerTab] = useState<'rules' | 'roles'>('rules');
  const navigate = setScreen;

  const handleOpenRules = (tab: 'rules' | 'roles' = 'rules') => {
    setRulesDrawerTab(tab);
    setRulesDrawerOpen(true);
  };

  // Handle sanitized host nickname setup from home screen
  const handleHostJoined = (sanitizedName: string) => {
    setLobbyState((prev) => ({
      ...prev,
      players: prev.players.map((p, idx) => (idx === 0 ? { ...p, name: sanitizedName } : p)),
    }));
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Security: Do not intercept browser shortcuts (Ctrl, Alt, Meta, Shift)
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }

      // Security: Do not trigger while typing in inputs, textareas, or contenteditables
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // If drawer is open, do not trigger numeric shortcuts
      if (rulesDrawerOpen) {
        return;
      }

      // Security & Role privacy: Do not allow accidental screen jumping out of pitch-black Night mode
      if (screen === 'night') {
        return;
      }

      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= screens.length) {
        setScreen(screens[num - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, rulesDrawerOpen]);

  return (
    <>
      <div className="demo-nav-wrapper">
        <nav className="demo-nav" aria-label="Chuyển màn hình demo">
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

      <div key={screen} className="screen-container">
        {screen === 'home' && (
          <HomeScreen
            onNavigate={navigate}
            onPlayerJoined={handleHostJoined}
            onOpenRules={handleOpenRules}
          />
        )}
        {screen === 'lobby' && (
          <LobbyScreen
            onNavigate={navigate}
            initialState={lobbyState}
            onStateChange={setLobbyState}
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
