import { useEffect, useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import LobbyScreen from './screens/lobby/LobbyScreen';
import NightScreen from './screens/night/NightScreen';
import DayScreen from './screens/day/DayScreen';
import HostScreen from './screens/host/HostScreen';
import SummaryScreen from './screens/summary/SummaryScreen';
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
  const navigate = setScreen;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger when user is typing in input or textarea
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const num = parseInt(event.key, 10);
      if (num >= 1 && num <= screens.length) {
        setScreen(screens[num - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        {screen === 'home' && <HomeScreen onNavigate={navigate} />}
        {screen === 'lobby' && <LobbyScreen onNavigate={navigate} initialState={lobbyState} onStateChange={setLobbyState} />}
        {screen === 'night' && <NightScreen onNavigate={navigate} />}
        {screen === 'day' && <DayScreen onNavigate={navigate} />}
        {screen === 'host' && <HostScreen onNavigate={navigate} />}
        {screen === 'summary' && <SummaryScreen onNavigate={navigate} />}
      </div>
    </>
  );
}
