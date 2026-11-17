import { useState } from 'react';
import HomeScreen from './screens/home/HomeScreen';
import LobbyScreen from './screens/lobby/LobbyScreen';
import NightScreen from './screens/night/NightScreen';
import DayScreen from './screens/day/DayScreen';
import HostScreen from './screens/host/HostScreen';
import SummaryScreen from './screens/summary/SummaryScreen';
import { defaultLobbyDemoState, type LobbyDemoState } from './screens/lobby/lobbyTypes';

export type ScreenName = 'home' | 'lobby' | 'night' | 'day' | 'host' | 'summary';

export default function App() {
  const [screen, setScreen] = useState<ScreenName>('home');
  const [lobbyState, setLobbyState] = useState<LobbyDemoState>(defaultLobbyDemoState);
  const navigate = (next: ScreenName) => setScreen(next);

  return (
    <>
      <nav className="demo-nav" aria-label="Chuyển màn hình demo">
        <span className="demo-nav-label">DEMO</span>
        {(['home', 'lobby', 'night', 'day', 'host', 'summary'] as const).map((item) => (
          <button key={item} className={screen === item ? 'demo-nav-button active' : 'demo-nav-button'} onClick={() => navigate(item)}>
            {({ home: 'Trang chủ', lobby: 'Lobby', night: 'Đêm', day: 'Ngày', host: 'Host', summary: 'Tổng kết' })[item]}
          </button>
        ))}
      </nav>
      {screen === 'home' && <HomeScreen onNavigate={navigate} />}
      {screen === 'lobby' && <LobbyScreen onNavigate={navigate} initialState={lobbyState} onStateChange={setLobbyState} />}
      {screen === 'night' && <NightScreen onNavigate={navigate} />}
      {screen === 'day' && <DayScreen onNavigate={navigate} />}
      {screen === 'host' && <HostScreen onNavigate={navigate} />}
      {screen === 'summary' && <SummaryScreen onNavigate={navigate} />}
    </>
  );
}
