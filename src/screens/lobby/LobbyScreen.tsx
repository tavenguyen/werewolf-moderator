import { useEffect, useState } from 'react';
import { defaultLobbyDemoState, type LobbyDemoState, type LobbyPlayer, type LobbyPreset } from './lobbyTypes';
import type { ScreenName } from '../../navigation';
import './lobby.css';

type Props = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

const waitingNames = ['Quỳnh Như', 'Văn Hậu', 'Thúy Kiều', 'Gia Bảo', 'Tường Vy'];

type DeckRoleItem = {
  name: string;
  count: number;
  symbol: string;
  side: 'village' | 'wolf' | 'third';
  sideName: string;
};

function getDeckRoles(preset: LobbyPreset, count: number): DeckRoleItem[] {
  if (preset === 'chaos') {
    const wolves = Math.max(1, Math.floor(count / 4));
    const specials = 3; // Tiên tri, Phù thủy, Thợ săn
    const third = 1; // Bán sói
    const villagers = Math.max(1, count - 1 - wolves - specials - third);
    return [
      { name: 'Sói Đầu Đàn', count: 1, symbol: '🩸', side: 'wolf', sideName: 'Phe Sói' },
      { name: 'Ma Sói', count: wolves, symbol: '🐺', side: 'wolf', sideName: 'Phe Sói' },
      { name: 'Tiên Tri', count: 1, symbol: '🔮', side: 'village', sideName: 'Phe Dân' },
      { name: 'Phù Thủy', count: 1, symbol: '🧪', side: 'village', sideName: 'Phe Dân' },
      { name: 'Thợ Săn', count: 1, symbol: '🎯', side: 'village', sideName: 'Phe Dân' },
      { name: 'Bán Sói', count: 1, symbol: '🐾', side: 'third', sideName: 'Phe Thứ 3' },
      { name: 'Dân Làng', count: villagers, symbol: '🛡️', side: 'village', sideName: 'Phe Dân' },
    ].filter((r) => r.count > 0);
  }

  // Basic (Tiêu chuẩn)
  const wolves = Math.max(2, Math.floor(count / 4));
  const seer = 1;
  const guard = count >= 6 ? 1 : 0;
  const hunter = count >= 8 ? 1 : 0;
  const villagers = Math.max(1, count - wolves - seer - guard - hunter);

  const deck: DeckRoleItem[] = [
    { name: 'Ma Sói', count: wolves, symbol: '🐺', side: 'wolf', sideName: 'Phe Sói' },
    { name: 'Tiên Tri', count: seer, symbol: '🔮', side: 'village', sideName: 'Phe Dân' },
  ];
  if (guard > 0) deck.push({ name: 'Bảo Vệ', count: guard, symbol: '⚔️', side: 'village', sideName: 'Phe Dân' });
  if (hunter > 0) deck.push({ name: 'Thợ Săn', count: hunter, symbol: '🎯', side: 'village', sideName: 'Phe Dân' });
  deck.push({ name: 'Dân Làng', count: villagers, symbol: '🛡️', side: 'village', sideName: 'Phe Dân' });
  return deck;
}

type LobbyProps = Props & { initialState?: LobbyDemoState; onStateChange?: (state: LobbyDemoState) => void };

export default function LobbyScreen({ onNavigate, initialState, onStateChange, onOpenRules }: LobbyProps) {
  const [players, setPlayers] = useState<LobbyPlayer[]>(initialState?.players ?? defaultLobbyDemoState.players);
  const [preset, setPreset] = useState<LobbyPreset>(initialState?.preset ?? 'basic');
  const [advanced, setAdvanced] = useState(initialState?.advanced ?? false);
  const [notice, setNotice] = useState('');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [settings, setSettings] = useState(initialState?.settings ?? defaultLobbyDemoState.settings);

  const maxPlayers = 8;
  const ready = players.length >= 6;
  const wolves = Math.max(2, Math.floor(players.length / 4));
  const specials = Math.min(2, Math.max(0, players.length - wolves - 2));
  const villagers = Math.max(0, players.length - wolves - specials);
  const totalVillage = villagers + specials;

  const deckRoles = getDeckRoles(preset, players.length);

  useEffect(() => {
    onStateChange?.({ players, preset, advanced, settings });
  }, [players, preset, advanced, settings, onStateChange]);

  const addPlayer = () => {
    if (players.length >= maxPlayers) return;
    const nextIndex = (players.length - defaultLobbyDemoState.players.length) % waitingNames.length;
    const name = waitingNames[Math.max(0, nextIndex)];
    setPlayers((current) => [...current, { name }]);
    setNotice(`${name} vừa vào bàn.`);
  };

  const removeLastPlayer = () => {
    if (players.length <= 1) return;
    const last = players[players.length - 1];
    if (last.host) return;
    setPlayers((current) => current.slice(0, -1));
    setNotice(`Đã xóa ${last.name} khỏi bàn.`);
  };

  const handleKickPlayer = (targetIndex: number) => {
    const target = players[targetIndex];
    if (!target || target.host) return;
    setPlayers((current) => current.filter((_, idx) => idx !== targetIndex));
    setNotice(`Đã mời ${target.name} rời phòng.`);
  };

  const toggleSetting = (key: keyof typeof settings) =>
    setSettings((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="lobby-page">
      {/* Header */}
      <header className="lobby-header">
        <button
          className="lobby-back"
          onClick={() => onNavigate?.('home')}
          aria-label="Về trang chủ"
          title="Về trang chủ"
        >
          ⟵
        </button>
        <div className="lobby-heading">
          <span className="lobby-candle-flame" aria-hidden="true">🕯️</span>
          <div>
            <h1>
              PHÒNG CHỜ <span>• BÀN #{7290}</span>
            </h1>
            <p>Chờ người chơi quét mã QR hoặc nhập 4 số để vào bàn trước khi bắt đầu</p>
          </div>
        </div>
        <div className="lobby-header-actions">
          <button
            className="lobby-link-button"
            onClick={() => onOpenRules?.('roles')}
            title="Tra cứu luật chơi và 10 vai trò thực chiến"
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

      {/* Main Grid */}
      <main className="lobby-layout">
        {/* Left Column: Room Code & Players */}
        <div className="lobby-left-column">
          {/* Room Code Card */}
          <section className="lobby-card lobby-room-card">
            <div className="lobby-room-details">
              <span className="lobby-kicker">MÃ BÀN CHƠI</span>
              <strong className="lobby-room-code">7290</strong>
              <p>Người chơi nhập 4 số trên hoặc bấm để phóng to mã QR cho cả bàn cùng quét</p>
            </div>

            <button
              type="button"
              className="lobby-qr-preview-btn"
              onClick={() => setQrModalOpen(true)}
              title="Bấm để phóng to mã QR"
              aria-label="Phóng to mã QR bàn 7290"
            >
              <div className="qr-preview-box">
                <svg viewBox="0 0 80 80" className="lobby-qr-svg" aria-hidden="true">
                  <rect width="80" height="80" fill="#13161c" rx="4" />
                  <rect x="6" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="11" y="11" width="10" height="10" fill="#c98638" rx="1" />
                  <rect x="54" y="6" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="59" y="11" width="10" height="10" fill="#c98638" rx="1" />
                  <rect x="6" y="54" width="20" height="20" fill="none" stroke="#c98638" strokeWidth="2.5" rx="2" />
                  <rect x="11" y="59" width="10" height="10" fill="#c98638" rx="1" />
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
              </div>
              <span className="qr-preview-label">
                <span aria-hidden="true">🔍</span> Phóng to QR
              </span>
            </button>
          </section>

          {/* Players Roster Card */}
          <section className="lobby-card lobby-players-card">
            <div className="lobby-section-title">
              <div>
                <h2>Người chơi trong bàn</h2>
                <span className="lobby-count">{players.length}/{maxPlayers}</span>
              </div>
              {ready && <span className="lobby-ready">✓ ĐỦ ĐIỀU KIỆN</span>}
            </div>

            {/* Player Grid */}
            <div className="lobby-player-grid">
              {players.map((player, index) => (
                <div className={`lobby-player ${player.host ? 'host-player' : ''}`} key={`${player.name}-${index}`}>
                  <div className="player-meta">
                    <span className="player-seat">#{String(index + 1).padStart(2, '0')}</span>
                    <span className="player-status-dot" title="Đang kết nối" aria-hidden="true" />
                    <span className="player-name">{player.name}</span>
                  </div>

                  <div className="player-actions">
                    {player.host ? (
                      <b className="badge-host">👑 CHỦ BÀN</b>
                    ) : (
                      <button
                        type="button"
                        className="player-kick-btn"
                        onClick={() => handleKickPlayer(index)}
                        title={`Mời ${player.name} rời phòng`}
                        aria-label={`Mời ${player.name} rời phòng`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Subtle Dev/Test Bot Utility */}
            <div className="lobby-bot-tools">
              <span className="bot-tools-label">Dành cho Host thử nghiệm:</span>
              <div className="bot-tools-btns">
                {players.length < maxPlayers && (
                  <button type="button" className="lobby-btn-bot" onClick={addPlayer} title="Thêm 1 người chơi ảo">
                    ＋ Thêm Bot
                  </button>
                )}
                {players.length > 1 && (
                  <button type="button" className="lobby-btn-bot" onClick={removeLastPlayer} title="Bớt 1 người chơi ảo">
                    − Bớt Bot
                  </button>
                )}
              </div>
            </div>

            {notice && <p className="lobby-notice" role="status">{notice}</p>}

            {/* Faction Balance Bar */}
            <div className="lobby-balance" aria-label={`Phe Dân Làng ${totalVillage}, Phe Ma Sói ${wolves}`}>
              <div className="lobby-balance-header">
                <span className="balance-title">PHÂN BỔ PHE PHÁI</span>
                <span className="balance-status">{players.length} người chơi ({totalVillage} Dân · {wolves} Sói)</span>
              </div>

              <div className="lobby-balance-bar">
                <i
                  style={{ width: `${(totalVillage / players.length) * 100}%` }}
                  title={`Phe Dân Làng: ${totalVillage}`}
                />
                <i
                  style={{ width: `${(wolves / players.length) * 100}%` }}
                  title={`Phe Ma Sói: ${wolves}`}
                />
              </div>

              <div className="balance-legend">
                <span className="legend-villager">
                  <i /> Phe Dân Làng: <b>{totalVillage}</b> <small>({villagers} Dân thường · {specials} Chức năng)</small>
                </span>
                <span className="legend-wolf">
                  <i /> Phe Ma Sói: <b>{wolves}</b>
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Presets & Deck Roster */}
        <div className="lobby-right-column">
          <section className="lobby-card lobby-preset-card">
            <div className="lobby-section-title">
              <div>
                <h2>Quy ước ván đấu</h2>
              </div>
              <span className="lobby-kicker">CHẾ ĐỘ CHƠI</span>
            </div>

            <div className="lobby-presets" role="group" aria-label="Chọn quy ước ván đấu">
              <button
                type="button"
                onClick={() => setPreset('basic')}
                className={preset === 'basic' ? 'active basic' : ''}
                aria-pressed={preset === 'basic'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Cơ Bản</span>
                  <strong className="preset-name">Tiêu Chuẩn</strong>
                </div>
                <small>6–8 người · Tiên tri + Bảo vệ + 2 Sói</small>
              </button>

              <button
                type="button"
                onClick={() => setPreset('chaos')}
                className={preset === 'chaos' ? 'active chaos' : ''}
                aria-pressed={preset === 'chaos'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Mở Rộng</span>
                  <strong className="preset-name">Kịch Tính</strong>
                </div>
                <small>Thêm Phù Thủy, Thợ Săn, Sói Đầu Đàn, Bán Sói</small>
              </button>

              <button
                type="button"
                onClick={() => { setPreset('custom'); setAdvanced(true); }}
                className={preset === 'custom' ? 'active custom' : ''}
                aria-pressed={preset === 'custom'}
              >
                <div className="preset-top">
                  <span className="preset-badge">Tự Chọn</span>
                  <strong className="preset-name">Tùy Biến</strong>
                </div>
                <small>Bật/tắt luật nâng cao theo ý muốn</small>
              </button>
            </div>

            {/* Expected Role Deck Breakdown */}
            <div className="lobby-deck-roster">
              <div className="deck-roster-head">
                <span className="deck-roster-title">ĐỘI HÌNH LÁ BÀI ({players.length} NGƯỜI CHƠI)</span>
                <span className="deck-roster-subtitle">Các vai trò sẽ được chia kín trong ván</span>
              </div>

              <div className="deck-roster-grid">
                {deckRoles.map((role) => (
                  <div key={role.name} className={`deck-role-pill side-${role.side}`}>
                    <span className="deck-role-badge">{role.count}×</span>
                    <span className="deck-role-icon" aria-hidden="true">{role.symbol}</span>
                    <span className="deck-role-name">{role.name}</span>
                    <span className="deck-role-side-tag">{role.sideName}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <button
              type="button"
              className="lobby-advanced-toggle"
              aria-expanded={advanced}
              onClick={() => setAdvanced((open) => !open)}
            >
              <span>Tùy chỉnh luật nâng cao</span>
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
                  desc="Cho phép bầy Sói tạo đêm bình yên giả để tung hỏa mù"
                  checked={settings.wolfSkip}
                  onChange={() => toggleSetting('wolfSkip')}
                />
                <Setting
                  label="Sói được cắn đồng đội"
                  desc="Cho phép Ma Sói tự cắn nhau để đánh lạc hướng"
                  checked={settings.friendlyFire}
                  onChange={() => toggleSetting('friendlyFire')}
                />
                <Setting
                  label="Phù thủy được tự cứu"
                  desc="Cho phép Phù thủy dùng bình cứu cho chính mình"
                  checked={settings.selfHeal}
                  onChange={() => toggleSetting('selfHeal')}
                />
                <Setting
                  label="Cứu mù mất bình nếu trượt"
                  desc="Mất bình cứu nếu dùng khi đêm đó không ai bị sói cắn trúng"
                  checked={settings.blindWaste}
                  onChange={() => toggleSetting('blindWaste')}
                />
              </div>
            )}
          </section>

          {/* Start Game Action Card (Sole Location for Start Requirements) */}
          <section className={`lobby-start-card ${ready ? 'is-ready' : 'not-ready'}`}>
            <div className="start-meta">
              <strong className="start-title">
                {ready
                  ? 'Bàn chơi đã sẵn sàng khai màn!'
                  : `Cần tối thiểu 6 người chơi để bắt đầu (hiện có ${players.length})`}
              </strong>
              <span className="start-desc">
                {ready
                  ? 'Tất cả người chơi đã có mặt. Host bấm nút để bắt đầu Đêm 1.'
                  : 'Cần đủ 6 người để đảm bảo tính cân bằng giữa Phe Dân và Phe Sói.'}
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

      {/* QR Code Magnified Modal */}
      {qrModalOpen && (
        <div
          className="lobby-modal-backdrop"
          role="presentation"
          onClick={() => setQrModalOpen(false)}
        >
          <div
            className="lobby-qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="qr-modal-head">
              <div>
                <span className="qr-modal-kicker">MÃ BÀN QUÉT NHANH</span>
                <h3 id="qr-modal-title">BÀN #{7290}</h3>
              </div>
              <button
                type="button"
                className="qr-modal-close"
                onClick={() => setQrModalOpen(false)}
                aria-label="Đóng mã QR"
              >
                ×
              </button>
            </div>

            <div className="qr-modal-canvas-wrap">
              <svg viewBox="0 0 160 160" className="qr-modal-svg" aria-label="Mã QR bàn 7290">
                <rect width="160" height="160" fill="#0d1017" rx="8" />
                {/* 3 Corner Finder Anchors */}
                <rect x="12" y="12" width="40" height="40" fill="none" stroke="#c98638" strokeWidth="5" rx="4" />
                <rect x="22" y="22" width="20" height="20" fill="#c98638" rx="2" />

                <rect x="108" y="12" width="40" height="40" fill="none" stroke="#c98638" strokeWidth="5" rx="4" />
                <rect x="118" y="22" width="20" height="20" fill="#c98638" rx="2" />

                <rect x="12" y="108" width="40" height="40" fill="none" stroke="#c98638" strokeWidth="5" rx="4" />
                <rect x="22" y="118" width="20" height="20" fill="#c98638" rx="2" />

                {/* High Density Data Matrix */}
                <rect x="64" y="16" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="84" y="16" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="72" y="32" width="8" height="8" fill="#c98638" rx="1" />
                <rect x="64" y="48" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="88" y="48" width="8" height="8" fill="#ede7dc" rx="1" />

                <rect x="16" y="68" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="36" y="76" width="8" height="8" fill="#c98638" rx="1" />
                <rect x="72" y="72" width="16" height="16" fill="#c98638" rx="3" />
                <rect x="116" y="68" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="136" y="76" width="8" height="8" fill="#ede7dc" rx="1" />

                <rect x="64" y="96" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="84" y="108" width="8" height="8" fill="#c98638" rx="1" />
                <rect x="72" y="124" width="8" height="8" fill="#ede7dc" rx="1" />
                <rect x="108" y="116" width="12" height="12" fill="#ede7dc" rx="2" />
                <rect x="132" y="132" width="12" height="12" fill="#c98638" rx="2" />
              </svg>
            </div>

            <p className="qr-modal-hint">
              Mọi người mở camera điện thoại quét mã để bước vào bàn ngay
            </p>

            <button
              type="button"
              className="qr-modal-done-btn"
              onClick={() => setQrModalOpen(false)}
            >
              Đóng lại
            </button>
          </div>
        </div>
      )}
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
