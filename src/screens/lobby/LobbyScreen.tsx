import { useEffect, useState } from 'react';
import { defaultLobbyDemoState, type LobbyDemoState, type LobbyPlayer } from './lobbyTypes';
import type { ScreenName } from '../../navigation';
import './lobby.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};
const waitingNames = ['Quỳnh Như', 'Văn Hậu', 'Thúy Kiều', 'Gia Bảo', 'Tường Vy'];

type LobbyProps = Props & { initialState?: LobbyDemoState; onStateChange?: (state: LobbyDemoState) => void };

export default function LobbyScreen({ onNavigate, initialState, onStateChange, onOpenRules }: LobbyProps) {
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
    setNotice(`${name} vừa thắp nến vào chiếu họp.`);
  };

  const removeLastPlayer = () => {
    if (players.length <= 1) return;
    const last = players[players.length - 1];
    if (last.host) return;
    setPlayers((current) => current.slice(0, -1));
    setNotice(`Đã mời ${last.name} rời chiếu.`);
  };

  const toggleSetting = (key: keyof typeof settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <button className="lobby-back" onClick={() => onNavigate?.('home')} aria-label="Quay về cổng làng" title="Về trang chủ">
          ⟵
        </button>
        <div className="lobby-heading">
          <span className="lobby-candle-flame" aria-hidden="true">🕯️</span>
          <div>
            <h1>
              ĐIỂM DANH THÔN BẢN <span>• PHÒNG #{7290}</span>
            </h1>
            <p>Tiếng mõ làng báo hiệu giờ tụ họp · Chờ đủ người trước khi đêm buông</p>
          </div>
        </div>
        <div className="lobby-header-actions">
          <button
            className="lobby-link-button"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật làng và 10 vai trò thực chiến"
          >
            <span aria-hidden="true">📜</span>
            <span>Luật &amp; Vai trò</span>
          </button>
          <button className="lobby-link-button" onClick={() => onNavigate?.('host')}>
            <span>Bàn Quản Trò</span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <main className="lobby-layout">
        <div className="lobby-left-column">
          <section className="lobby-card lobby-room-card">
            <div className="lobby-room-details">
              <span className="lobby-kicker">MẬT TỰ ĐIỂM DANH</span>
              <strong className="lobby-room-code">7290</strong>
              <p>Thôn dân quét ấn mã hoặc nhập 4 số để vào chiếu họp</p>
            </div>
            
            <div className="lobby-qr-container" title="Ấn mã vào phòng 7290">
              <div className="qr-woodcut-frame" aria-hidden="true" />
              <svg viewBox="0 0 80 80" className="lobby-qr-svg" aria-label="Mã QR kết nối phòng 7290">
                {/* Woodcut parchment background */}
                <rect width="80" height="80" fill="#13161c" rx="4" />
                {/* Corner anchors */}
                <rect x="6" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                <rect x="11" y="11" width="10" height="10" fill="#c98638" rx="1" />
                
                <rect x="54" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                <rect x="59" y="11" width="10" height="10" fill="#c98638" rx="1" />
                
                <rect x="6" y="54" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                <rect x="11" y="59" width="10" height="10" fill="#c98638" rx="1" />
                
                {/* Stylized QR ink marks */}
                <rect x="32" y="8" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="42" y="8" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="36" y="16" width="4" height="4" fill="#c98638" />
                <rect x="32" y="24" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="44" y="24" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                
                <rect x="8" y="34" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="18" y="38" width="4" height="4" fill="#c98638" />
                <rect x="36" y="36" width="8" height="8" fill="#c98638" rx="2" />
                <rect x="58" y="34" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="68" y="38" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                
                <rect x="32" y="48" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="42" y="54" width="4" height="4" fill="#c98638" />
                <rect x="36" y="62" width="4" height="4" fill="#ede7dc" opacity="0.8" />
                <rect x="54" y="58" width="6" height="6" fill="#ede7dc" opacity="0.8" />
                <rect x="66" y="66" width="6" height="6" fill="#c98638" />
              </svg>
              <span className="qr-badge">ẤN MÃ THÔN</span>
            </div>
          </section>

          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title">
              <div>
                <h2>Danh sách thôn dân</h2>
                <span className="lobby-count">{players.length}/{maxPlayers}</span>
              </div>
              <span className={ready ? 'lobby-ready' : 'lobby-needs'}>
                {ready ? '✓ ĐỦ ĐIỀU KIỆN KHAI MÀN' : `CẦN THÊM ${6 - players.length} NGƯỜI`}
              </span>
            </div>

            <div className="lobby-player-grid">
              {players.map((player, index) => (
                <div className={`lobby-player ${player.host ? 'host-player' : ''}`} key={`${player.name}-${index}`}>
                  <div className="player-meta">
                    <span className="player-seat">#{String(index + 1).padStart(2, '0')}</span>
                    <i className="lobby-candle-dot" />
                    <span className="player-name">{player.name}</span>
                  </div>
                  {player.host ? (
                    <b className="badge-host">TRƯỞNG THÔN 👑</b>
                  ) : (
                    <b className="badge-online">CÓ MẶT</b>
                  )}
                </div>
              ))}
            </div>

            <div className="lobby-player-controls">
              {players.length < maxPlayers && (
                <button className="lobby-add-player" onClick={addPlayer}>
                  <span aria-hidden="true">＋</span>
                  <span>Mời thêm thôn dân thử nghiệm</span>
                </button>
              )}
              {players.length > 5 && (
                <button className="lobby-remove-player" onClick={removeLastPlayer} title="Bớt người vừa thêm">
                  <span>− Bớt</span>
                </button>
              )}
            </div>

            {notice && <p className="lobby-notice" role="status">{notice}</p>}

            <div className="lobby-balance" aria-label={`${roles.villagers} dân làng, ${roles.specials} chức năng, ${roles.wolves} ma sói`}>
              <div className="lobby-balance-header">
                <span className="balance-title">CÁN CÂN THẾ TRẬN</span>
                <span className="balance-status">{ready ? 'Cân bằng âm dương' : 'Chưa đủ quân số'}</span>
              </div>
              <div className="lobby-balance-bar">
                <i style={{ width: `${(roles.villagers / players.length) * 100}%` }} title={`Dân làng: ${roles.villagers}`} />
                <i style={{ width: `${(roles.specials / players.length) * 100}%` }} title={`Chức năng: ${roles.specials}`} />
                <i style={{ width: `${(roles.wolves / players.length) * 100}%` }} title={`Ma sói: ${roles.wolves}`} />
              </div>
              <div className="balance-legend">
                <span className="legend-villager"><i /> Thôn dân: <b>{roles.villagers}</b></span>
                <span className="legend-special"><i /> Thần linh: <b>{roles.specials}</b></span>
                <span className="legend-wolf"><i /> Ma sói: <b>{roles.wolves}</b></span>
              </div>
            </div>
          </section>
        </div>

        <div className="lobby-right-column">
          <section className="lobby-card lobby-preset-card">
            <div className="lobby-section-title">
              <div>
                <h2>Quy ước ván đấu</h2>
              </div>
              <span className="lobby-kicker">CỔ KINH THÔN BẢN</span>
            </div>

            <div className="lobby-presets" role="group" aria-label="Chọn quy ước ván đấu">
              <button
                onClick={() => setPreset('basic')}
                className={preset === 'basic' ? 'active basic' : ''}
                aria-pressed={preset === 'basic'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Bản Chuẩn</span>
                  <strong className="preset-name">Tiêu Chuẩn</strong>
                </div>
                <small>6–8 người · Tiên tri + Bảo vệ + 2 Sói</small>
              </button>

              <button
                onClick={() => setPreset('chaos')}
                className={preset === 'chaos' ? 'active chaos' : ''}
                aria-pressed={preset === 'chaos'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Huyết Nguyệt</span>
                  <strong className="preset-name">Kịch Tính</strong>
                </div>
                <small>9–12 người · Thêm Phù thủy, Sói đầu đàn</small>
              </button>

              <button
                onClick={() => { setPreset('custom'); setAdvanced(true); }}
                className={preset === 'custom' ? 'active custom' : ''}
                aria-pressed={preset === 'custom'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Tự Định</span>
                  <strong className="preset-name">Tùy Biến</strong>
                </div>
                <small>Tùy biến điều lệ &amp; luật lệ nâng cao</small>
              </button>
            </div>

            <button
              className="lobby-advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
            >
              <span>Mở rộng điều lệ thôn</span>
              <span className="toggle-symbol" aria-hidden="true">{advanced ? '−' : '+'}</span>
            </button>

            {advanced && (
              <div className="lobby-settings">
                <Setting
                  label="Lật vai khi chết"
                  desc="Công bố vai trò của thôn dân ngay khi bị xử tử hoặc bị cắn"
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
                  desc="Cho phép Phù thủy dùng bình tiên dược cho chính mình"
                  checked={settings.selfHeal}
                  onChange={() => toggleSetting('selfHeal')}
                />
                <Setting
                  label="Cứu mù mất bình nếu trượt"
                  desc="Mất bình tiên dược nếu bấm cứu khi đêm đó không ai bị sói cắn trúng"
                  checked={settings.blindWaste}
                  onChange={() => toggleSetting('blindWaste')}
                />
              </div>
            )}

            <p className="lobby-demo-note">
              <span>✦</span> Mọi quy tắc và phân chia vai trò được phong ấn bảo mật trên Game Engine máy chủ.
            </p>
          </section>

          <section className={`lobby-start-card ${ready ? 'is-ready' : 'not-ready'}`}>
            <div className="start-meta">
              <strong className="start-title">
                {ready ? 'Lễ hội bóng đêm đã sẵn sàng!' : `Cần thêm ${6 - players.length} thôn dân`}
              </strong>
              <span className="start-desc">
                {ready
                  ? 'Gõ mõ khai hội, tắt hết nến và bước vào Đêm Thứ 1'
                  : 'Cần tối thiểu 6 người để đảm bảo tính công bằng của ván đấu'}
              </span>
            </div>
            <button
              className="start-button"
              disabled={!ready}
              onClick={() => onNavigate?.('night')}
            >
              <span className="play-icon" aria-hidden="true">⚔</span>
              <span>BẮT ĐẦU VÁN ĐẤU • ĐÊM 1</span>
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
