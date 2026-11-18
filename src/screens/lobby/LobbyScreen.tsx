import { useEffect, useState } from 'react';
import { defaultLobbyDemoState, type LobbyDemoState, type LobbyPlayer } from './lobbyTypes';
import type { ScreenName } from '../../navigation';
import './lobby.css';

type Props = { onNavigate?: (screen: ScreenName) => void };
const waitingNames = ['Quỳnh Như', 'Văn Hậu', 'Thúy Kiều', 'Gia Bảo', 'Tường Vy'];

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
  const villagers = Math.max(0, players.length - wolves - specials);
  const roles = { wolves, specials, villagers };

  useEffect(() => {
    onStateChange?.({ players, preset, advanced, settings });
  }, [players, preset, advanced, settings, onStateChange]);

  const addPlayer = () => {
    if (players.length >= maxPlayers) return;
    const nextIndex = (players.length - defaultLobbyDemoState.players.length) % waitingNames.length;
    const name = waitingNames[Math.max(0, nextIndex)];
    setPlayers((current) => [...current, { name }]);
    setNotice(`${name} vừa tham gia bàn.`);
  };

  const removeLastPlayer = () => {
    if (players.length <= 1) return;
    const last = players[players.length - 1];
    if (last.host) return;
    setPlayers((current) => current.slice(0, -1));
    setNotice(`Đã xóa ${last.name} khỏi bàn.`);
  };

  const toggleSetting = (key: keyof typeof settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <button className="lobby-back" onClick={() => onNavigate?.('home')} aria-label="Quay về trang chủ" title="Về trang chủ">
          ←
        </button>
        <div className="lobby-heading">
          <span className="lobby-led" />
          <div>
            <h1>
              Lobby điều phối <span>• Phòng #7290</span>
            </h1>
            <p>Sẵn sàng kết nối thiết bị · Bảng điều khiển quản trò</p>
          </div>
        </div>
        <div className="lobby-header-actions">
          <button className="lobby-link-button" onClick={() => onNavigate?.('host')}>
            <span>Mở bảng Host</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <main className="lobby-layout">
        <div className="lobby-left-column">
          <section className="lobby-card lobby-room-card">
            <div className="lobby-room-details">
              <span className="lobby-kicker">MÃ PHÒNG TRỰC TIẾP</span>
              <strong className="lobby-room-code">7290</strong>
              <p>Người chơi quét QR hoặc nhập mã 4 số để vào bàn tức thì</p>
            </div>
            
            <div className="lobby-qr-container" title="Mã QR vào phòng">
              <div className="qr-scan-line" aria-hidden="true" />
              <svg viewBox="0 0 80 80" className="lobby-qr-svg" aria-label="Mã QR kết nối phòng 7290">
                {/* Background matrix pattern */}
                <rect width="80" height="80" fill="#080a0e" rx="4" />
                {/* Corner anchors */}
                <rect x="6" y="6" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="11" y="11" width="10" height="10" fill="#f59e0b" rx="1" />
                
                <rect x="54" y="6" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="59" y="11" width="10" height="10" fill="#f59e0b" rx="1" />
                
                <rect x="6" y="54" width="20" height="20" fill="none" stroke="#f59e0b" strokeWidth="3" rx="2" />
                <rect x="11" y="59" width="10" height="10" fill="#f59e0b" rx="1" />
                
                {/* Stylized QR dots */}
                <rect x="32" y="8" width="4" height="4" fill="#a1a1aa" />
                <rect x="42" y="8" width="4" height="4" fill="#a1a1aa" />
                <rect x="36" y="16" width="4" height="4" fill="#f59e0b" />
                <rect x="32" y="24" width="4" height="4" fill="#a1a1aa" />
                <rect x="44" y="24" width="4" height="4" fill="#a1a1aa" />
                
                <rect x="8" y="34" width="4" height="4" fill="#a1a1aa" />
                <rect x="18" y="38" width="4" height="4" fill="#f59e0b" />
                <rect x="36" y="36" width="8" height="8" fill="#f59e0b" rx="2" />
                <rect x="58" y="34" width="4" height="4" fill="#a1a1aa" />
                <rect x="68" y="38" width="4" height="4" fill="#a1a1aa" />
                
                <rect x="32" y="48" width="4" height="4" fill="#a1a1aa" />
                <rect x="42" y="54" width="4" height="4" fill="#f59e0b" />
                <rect x="36" y="62" width="4" height="4" fill="#a1a1aa" />
                <rect x="54" y="58" width="6" height="6" fill="#a1a1aa" />
                <rect x="66" y="66" width="6" height="6" fill="#f59e0b" />
              </svg>
              <span className="qr-badge">QUÉT QR VÀO BÀN</span>
            </div>
          </section>

          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title">
              <div>
                <h2>Danh sách người chơi</h2>
                <span className="lobby-count">{players.length}/{maxPlayers}</span>
              </div>
              <span className={ready ? 'lobby-ready' : 'lobby-needs'}>
                {ready ? '✓ ĐỦ ĐIỀU KIỆN' : `CẦN THÊM ${6 - players.length} NGƯỜI`}
              </span>
            </div>

            <div className="lobby-player-grid">
              {players.map((player, index) => (
                <div className={`lobby-player ${player.host ? 'host-player' : ''}`} key={`${player.name}-${index}`}>
                  <div className="player-meta">
                    <span className="player-seat">#{String(index + 1).padStart(2, '0')}</span>
                    <i className="lobby-online-dot" />
                    <span className="player-name">{player.name}</span>
                  </div>
                  {player.host ? (
                    <b className="badge-host">HOST 👑</b>
                  ) : (
                    <b className="badge-online">ONLINE</b>
                  )}
                </div>
              ))}
            </div>

            <div className="lobby-player-controls">
              {players.length < maxPlayers && (
                <button className="lobby-add-player" onClick={addPlayer}>
                  <span aria-hidden="true">＋</span>
                  <span>Thêm người chơi demo</span>
                </button>
              )}
              {players.length > 5 && (
                <button className="lobby-remove-player" onClick={removeLastPlayer} title="Xóa người vừa thêm">
                  <span>− Bớt</span>
                </button>
              )}
            </div>

            {notice && <p className="lobby-notice" role="status">{notice}</p>}

            <div className="lobby-balance" aria-label={`${roles.villagers} dân làng, ${roles.specials} chức năng, ${roles.wolves} ma sói`}>
              <div className="lobby-balance-header">
                <span className="balance-title">THƯỚC CÂN BẰNG THẾ TRẬN</span>
                <span className="balance-status">{ready ? 'Cân bằng tốt' : 'Chưa đủ người'}</span>
              </div>
              <div className="lobby-balance-bar">
                <i style={{ width: `${(roles.villagers / players.length) * 100}%` }} title={`Dân làng: ${roles.villagers}`} />
                <i style={{ width: `${(roles.specials / players.length) * 100}%` }} title={`Chức năng: ${roles.specials}`} />
                <i style={{ width: `${(roles.wolves / players.length) * 100}%` }} title={`Ma sói: ${roles.wolves}`} />
              </div>
              <div className="balance-legend">
                <span className="legend-villager"><i /> Dân làng: <b>{roles.villagers}</b></span>
                <span className="legend-special"><i /> Chức năng: <b>{roles.specials}</b></span>
                <span className="legend-wolf"><i /> Ma Sói: <b>{roles.wolves}</b></span>
              </div>
            </div>
          </section>
        </div>

        <div className="lobby-right-column">
          <section className="lobby-card lobby-preset-card">
            <div className="lobby-section-title">
              <div>
                <h2>Cấu hình ván đấu</h2>
              </div>
              <span className="lobby-kicker">SMART PRESET</span>
            </div>

            <div className="lobby-presets" role="group" aria-label="Chọn preset">
              <button
                onClick={() => setPreset('basic')}
                className={preset === 'basic' ? 'active basic' : ''}
                aria-pressed={preset === 'basic'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Chuẩn</span>
                  <strong className="preset-name">Cơ bản</strong>
                </div>
                <small>6–8 người · Tiên tri + Bảo vệ + 2 Sói</small>
              </button>

              <button
                onClick={() => setPreset('chaos')}
                className={preset === 'chaos' ? 'active chaos' : ''}
                aria-pressed={preset === 'chaos'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Hấp dẫn</span>
                  <strong className="preset-name">Kịch tính</strong>
                </div>
                <small>9–12 người · Thêm Phù thủy, Sói đầu đàn</small>
              </button>

              <button
                onClick={() => { setPreset('custom'); setAdvanced(true); }}
                className={preset === 'custom' ? 'active custom' : ''}
                aria-pressed={preset === 'custom'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Pro</span>
                  <strong className="preset-name">Tự chỉnh</strong>
                </div>
                <small>Tùy biến luật &amp; công tắc nâng cao</small>
              </button>
            </div>

            <button
              className="lobby-advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
            >
              <span>Công tắc luật nâng cao</span>
              <span className="toggle-symbol" aria-hidden="true">{advanced ? '−' : '+'}</span>
            </button>

            {advanced && (
              <div className="lobby-settings">
                <Setting
                  label="Lật vai khi chết"
                  desc="Công bố vai trò của người chơi ngay khi bị xử tử hoặc bị cắn"
                  checked={settings.reveal}
                  onChange={() => toggleSetting('reveal')}
                />
                <Setting
                  label="Sói được bỏ lượt cắn"
                  desc="Cho phép bầy Sói tạo đêm bình yên giả để đánh lừa dân làng"
                  checked={settings.wolfSkip}
                  onChange={() => toggleSetting('wolfSkip')}
                />
                <Setting
                  label="Sói được cắn đồng đội"
                  desc="Cho phép Ma Sói tự cắn nhau để tung hỏa mù"
                  checked={settings.friendlyFire}
                  onChange={() => toggleSetting('friendlyFire')}
                />
                <Setting
                  label="Phù thủy được tự cứu"
                  desc="Cho phép Phù thủy dùng bình cứu cho chính bản thân mình"
                  checked={settings.selfHeal}
                  onChange={() => toggleSetting('selfHeal')}
                />
                <Setting
                  label="Cứu mù mất bình nếu trượt"
                  desc="Mất bình cứu nếu bấm cứu khi đêm đó không ai bị sói cắn trúng"
                  checked={settings.blindWaste}
                  onChange={() => toggleSetting('blindWaste')}
                />
              </div>
            )}

            <p className="lobby-demo-note">
              <span>✦</span> Thiết lập luật được kiểm soát chặt chẽ bởi Game Engine trên máy chủ.
            </p>
          </section>

          <section className={`lobby-start-card ${ready ? 'is-ready' : 'not-ready'}`}>
            <div className="start-meta">
              <strong className="start-title">
                {ready ? 'Bàn đấu đã sẵn sàng!' : `Cần thêm ${6 - players.length} người chơi`}
              </strong>
              <span className="start-desc">
                {ready
                  ? 'Bấm bắt đầu để phát loa quản trò và chuyển sang Đêm 1'
                  : 'Cần tối thiểu 6 người để đảm bảo cân bằng thế trận'}
              </span>
            </div>
            <button
              className="start-button"
              disabled={!ready}
              onClick={() => onNavigate?.('night')}
            >
              <span className="play-icon" aria-hidden="true">▶</span>
              <span>BẮT ĐẦU VÁN ĐẤU</span>
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

function Setting({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="lobby-setting">
      <div className="setting-copy">
        <span className="setting-title">{label}</span>
        {desc && <small className="setting-desc">{desc}</small>}
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  );
}
