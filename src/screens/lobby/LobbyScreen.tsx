import { useEffect, useState } from 'react';
import { defaultLobbyDemoState, type LobbyDemoState, type LobbyPlayer } from './lobbyTypes';
import type { ScreenName } from '../../navigation';
import './lobby.css';

type Props = { onNavigate?: (screen: ScreenName) => void };
const waitingNames = ['Quỳnh Như', 'Văn Hậu', 'Thúy Kiều'];

type LobbyProps = Props & { initialState?: LobbyDemoState; onStateChange?: (state: LobbyDemoState) => void };

export default function LobbyScreen({ onNavigate, initialState, onStateChange }: LobbyProps) {
  const [players, setPlayers] = useState<LobbyPlayer[]>(initialState?.players ?? defaultLobbyDemoState.players);
  const [preset, setPreset] = useState<LobbyDemoState['preset']>(initialState?.preset ?? 'basic');
  const [advanced, setAdvanced] = useState(initialState?.advanced ?? false);
  const [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(initialState?.settings ?? defaultLobbyDemoState.settings);
  const maxPlayers = 8;
  const ready = players.length >= 6;
  const wolves = Math.max(2, Math.floor(players.length / 4));
  const specials = Math.min(2, Math.max(0, players.length - wolves - 2));
  const roles = { wolves, specials, villagers: Math.max(0, players.length - wolves - specials) };

  useEffect(() => {
    onStateChange?.({ players, preset, advanced, settings });
  }, [players, preset, advanced, settings, onStateChange]);

  const addPlayer = () => {
    if (players.length >= maxPlayers) return;
    const name = waitingNames[(players.length - defaultLobbyDemoState.players.length) % waitingNames.length];
    setPlayers((current) => [...current, { name }]);
    setNotice(`${name} đã tham gia bàn demo.`);
  };

  const toggleSetting = (key: keyof typeof settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <button className="lobby-back" onClick={() => onNavigate?.('home')} aria-label="Quay về trang chủ">←</button>
        <div className="lobby-heading"><span className="lobby-led" /><div><h1>Lobby điều phối <span>• Phòng #7290</span></h1><p>Bản demo cục bộ · Các thiết bị chưa được đồng bộ</p></div></div>
        <button className="lobby-link-button" onClick={() => onNavigate?.('host')}>Mở bảng host <span aria-hidden="true">↗</span></button>
      </header>

      <main className="lobby-layout">
        <div className="lobby-left-column">
          <section className="lobby-card lobby-room-card">
            <div><span className="lobby-kicker">Mã kết nối bàn đấu</span><strong className="lobby-room-code">7290</strong><p>Chỉ dùng để xem giao diện demo</p></div>
            <div className="lobby-qr-placeholder" aria-label="QR chưa khả dụng trong bản demo"><span>QR</span><small>CHƯA KẾT NỐI</small></div>
          </section>

          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title"><div><h2>Người chơi</h2><span className="lobby-count">{players.length}/{maxPlayers}</span></div><span className={ready ? 'lobby-ready' : 'lobby-needs'}>{ready ? 'ĐỦ NGƯỜI CHƠI' : `CẦN THÊM ${6 - players.length}`}</span></div>
            <div className="lobby-player-grid">
              {players.map((player, index) => <div className={`lobby-player ${player.host ? 'host-player' : ''}`} key={`${player.name}-${index}`}>
                <div><i className="lobby-online-dot" /><span>{index + 1}. {player.name}</span></div>
                <b>{player.host ? 'HOST' : 'ONLINE'}</b>
              </div>)}
              {players.length < maxPlayers && <button className="lobby-add-player" onClick={addPlayer}><span aria-hidden="true">＋</span> Thêm người chơi demo</button>}
            </div>
            {notice && <p className="lobby-notice" role="status">{notice}</p>}
            <div className="lobby-balance" aria-label={`${roles.villagers} dân thường, ${roles.specials} chức năng, ${roles.wolves} ma sói`}>
              <div className="lobby-balance-bar"><i style={{ width: `${roles.villagers / players.length * 100}%` }} /><i style={{ width: `${roles.specials / players.length * 100}%` }} /><i style={{ width: `${roles.wolves / players.length * 100}%` }} /></div>
              <div><span>Dân: {roles.villagers}</span><span>Chức năng: {roles.specials}</span><span>Sói: {roles.wolves}</span></div>
            </div>
          </section>
        </div>

        <div className="lobby-right-column">
          <section className="lobby-card lobby-preset-card">
            <div className="lobby-section-title"><div><h2>Cấu hình bàn đấu</h2></div><span className="lobby-kicker">Gói thiết lập</span></div>
            <div className="lobby-presets" role="group" aria-label="Chọn preset">
              <button onClick={() => setPreset('basic')} className={preset === 'basic' ? 'active basic' : ''} aria-pressed={preset === 'basic'}><strong>Cơ bản</strong><small>6–8 người</small></button>
              <button onClick={() => setPreset('chaos')} className={preset === 'chaos' ? 'active chaos' : ''} aria-pressed={preset === 'chaos'}><strong>Kịch tính</strong><small>9–12 người</small></button>
              <button onClick={() => { setPreset('custom'); setAdvanced(true); }} className={preset === 'custom' ? 'active custom' : ''} aria-pressed={preset === 'custom'}><strong>Tự chỉnh</strong><small>Nâng cao</small></button>
            </div>
            <button className="lobby-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced((open) => !open)}><span>Tùy chỉnh nâng cao</span><span aria-hidden="true">{advanced ? '−' : '+'}</span></button>
            {advanced && <div className="lobby-settings">
              <Setting label="Lật vai khi chết" checked={settings.reveal} onChange={() => toggleSetting('reveal')} />
              <Setting label="Sói được bỏ lượt cắn" checked={settings.wolfSkip} onChange={() => toggleSetting('wolfSkip')} />
              <Setting label="Sói được cắn đồng đội" checked={settings.friendlyFire} onChange={() => toggleSetting('friendlyFire')} />
              <Setting label="Phù thủy được tự cứu" checked={settings.selfHeal} onChange={() => toggleSetting('selfHeal')} />
              <Setting label="Cứu mù mất bình nếu không ai chết" checked={settings.blindWaste} onChange={() => toggleSetting('blindWaste')} />
            </div>}
            <p className="lobby-demo-note">Thiết lập chỉ lưu trong giao diện demo, chưa áp dụng luật chơi.</p>
          </section>

          <section className="lobby-start-card">
            <div><strong>{ready ? 'Sẵn sàng bắt đầu' : `Cần tối thiểu 6 người chơi`}</strong><span>{players.length}/{maxPlayers} người chơi đã có mặt</span></div>
            <button disabled={!ready} onClick={() => onNavigate?.('night')}><span aria-hidden="true">▶</span> Bắt đầu ván đấu</button>
          </section>
        </div>
      </main>
    </div>
  );
}

function Setting({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="lobby-setting"><span>{label}</span><input type="checkbox" checked={checked} onChange={onChange} /></label>;
}
