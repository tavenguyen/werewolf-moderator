import { useState } from 'react';
import type { ScreenName } from '../../navigation';
import './summary.css';

type SummaryScreenProps = {
  onNavigate?: (screen: ScreenName) => void;
  onOpenRules?: (tab?: 'rules' | 'roles') => void;
};

type PlayerSummary = {
  name: string;
  role: string;
  symbol: string;
  status: string;
  side: 'seer' | 'wolf' | 'village' | 'hunter';
  sideName: string;
};

const players: PlayerSummary[] = [
  { name: 'Minh Khang', role: 'Tiên Tri', symbol: '🔮', status: 'CÒN SỐNG', side: 'seer', sideName: 'Phe Dân Làng' },
  { name: 'Lan Anh', role: 'Phù Thủy', symbol: '🧪', status: 'CÒN SỐNG', side: 'seer', sideName: 'Phe Dân Làng' },
  { name: 'Hoàng Nam', role: 'Ma Sói', symbol: '🐺', status: 'BỊ TREO CỔ', side: 'wolf', sideName: 'Phe Ma Sói' },
  { name: 'Bảo Trâm', role: 'Thợ Săn', symbol: '🎯', status: 'BỊ CẮN', side: 'hunter', sideName: 'Phe Dân Làng' },
  { name: 'Đức Huy', role: 'Sói Đầu Đàn', symbol: '🩸', status: 'BỊ BẮN HẠ', side: 'wolf', sideName: 'Phe Ma Sói' },
  { name: 'Quỳnh Như', role: 'Dân Làng', symbol: '🛡️', status: 'CÒN SỐNG', side: 'village', sideName: 'Phe Dân Làng' },
];

export default function SummaryScreen({ onNavigate }: SummaryScreenProps) {
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'cards' | 'timeline'>('cards');

  const flip = (name: string) => {
    setOpenCards((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const revealAll = () => {
    if (openCards.size < players.length) {
      setOpenCards(new Set(players.map((player) => player.name)));
    } else {
      setOpenCards(new Set());
    }
  };

  const allRevealed = openCards.size === players.length;

  return (
    <main className="summary-screen">
      <header className="summary-header">
        <div className="summary-header-title">
          <i aria-hidden="true" />
          <strong>GIẢI MÃ VÁN ĐẤU <span>• PHÒNG #7290</span></strong>
        </div>
        <span className="summary-badge-complete">HOÀN TẤT VÁN ĐẤU</span>
      </header>

      <div className="summary-content">
        {/* Victory Banner */}
        <section className="summary-winner">
          <div className="summary-trophy-wrap" aria-hidden="true">
            <span className="summary-trophy">☀️</span>
          </div>
          <div className="summary-winner-copy">
            <span className="winner-eyebrow">PHE CHIẾN THẮNG CHUNG CUỘC</span>
            <h1>THÔN BẢN TOÀN THẮNG!</h1>
            <p>Bầy Ma Sói đã bị vạch trần và quy án. Làng quê trở về yên bình dưới ánh trăng.</p>
          </div>
          <button className="summary-reveal-all" onClick={revealAll}>
            {allRevealed ? 'ÚP TOÀN BÀN' : 'LẬT TOÀN BÀN ✦'}
          </button>
        </section>

        {/* Dramatic Turning Point */}
        <section className="summary-turning-point">
          <div className="turning-point-icon" aria-hidden="true">⚔️</div>
          <div className="turning-point-body">
            <strong>BƯỚC NGOẶT ĐỊNH ĐOẠT VÁN ĐẤU</strong>
            <p>
              Đêm 2: Sói cắn tử vong Thợ Săn Bảo Trâm. Trước khi trút hơi thở cuối cùng, Bảo Trâm nổ phát súng chuẩn xác găm trúng tim <b>Sói Đầu Đàn Đức Huy</b>, mở toang cánh cửa thắng lợi cho Thôn Dân!
            </p>
          </div>
        </section>

        {/* Tabs */}
        <div className="summary-tabs" role="tablist" aria-label="Nội dung tổng kết">
          <button
            role="tab"
            aria-selected={tab === 'cards'}
            className={tab === 'cards' ? 'active' : ''}
            onClick={() => setTab('cards')}
          >
            <span aria-hidden="true">🎴</span>
            <span>THẺ BÀI HUYỀN BÍ ({openCards.size}/{players.length})</span>
          </button>
          <button
            role="tab"
            aria-selected={tab === 'timeline'}
            className={tab === 'timeline' ? 'active' : ''}
            onClick={() => setTab('timeline')}
          >
            <span aria-hidden="true">📜</span>
            <span>BIÊN NIÊN SỬ VÁN ĐẤU</span>
          </button>
        </div>

        {tab === 'cards' ? (
          <section className="summary-cards" aria-label="Vai trò người chơi">
            {players.map((player, index) => {
              const isOpen = openCards.has(player.name);
              return (
                <button
                  key={player.name}
                  className={`summary-card ${isOpen ? 'is-open' : ''}`}
                  onClick={() => flip(player.name)}
                  aria-pressed={isOpen}
                  aria-label={`${isOpen ? 'Ẩn' : 'Lật'} thẻ bài vai trò của ${player.name}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="summary-card-inner">
                    {/* Front Face: Rustic Tarot Card Back */}
                    <span className="summary-card-face summary-card-front">
                      <div className="tarot-card-border">
                        <span className="tarot-corner tl" />
                        <span className="tarot-corner tr" />
                        <span className="tarot-corner bl" />
                        <span className="tarot-corner br" />
                        <small className="card-seat-tag">GHẾ #{String(index + 1).padStart(2, '0')}</small>
                        <div className="tarot-emblem" aria-hidden="true">☾</div>
                        <b className="card-player-name">{player.name}</b>
                        <small className="summary-card-hint">CHẠM ĐỂ GIẢI MÃ</small>
                      </div>
                    </span>

                    {/* Back Face: Revealed Secret Role */}
                    <span className={`summary-card-face summary-card-back side-${player.side}`}>
                      <div className="role-revealed-wrap">
                        <span className="role-side-tag">{player.sideName}</span>
                        <div className="role-symbol-display" aria-hidden="true">
                          {player.symbol}
                        </div>
                        <b className="role-title-display">{player.role}</b>
                        <span className={`status-pill ${player.status.includes('SỐNG') ? 'status-alive' : 'status-dead'}`}>
                          {player.status}
                        </span>
                      </div>
                    </span>
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="summary-timeline" aria-label="Diễn biến ván đấu">
            <article className="timeline-event">
              <i className="timeline-dot night-dot" aria-hidden="true" />
              <div className="timeline-heading">
                <strong>ĐÊM THỨ I · BÌNH YÊN</strong>
                <b className="safe">0 tử vong</b>
              </div>
              <p>
                • <b>Tiên tri</b> soi trúng Đức Huy (Ma Sói).<br />
                • <b>Bầy Sói</b> chọn cắn Quỳnh Như.<br />
                • <b>Phù thủy</b> kịp thời dùng Bình Cứu, cứu sống thành công Quỳnh Như!
              </p>
            </article>

            <article className="timeline-event">
              <i className="timeline-dot day-dot" aria-hidden="true" />
              <div className="timeline-heading">
                <strong>NGÀY I · BIỂU QUYẾT BẤT THÀNH</strong>
                <b className="safe">Hòa phiếu</b>
              </div>
              <p>
                • Cả làng tranh luận gay gắt nhưng biểu quyết hòa phiếu giữa Hoàng Nam và Lan Anh.<br />
                • Không có ai bị xử tử trong ngày đầu.
              </p>
            </article>

            <article className="timeline-event">
              <i className="timeline-dot night-dot" aria-hidden="true" />
              <div className="timeline-heading">
                <strong>ĐÊM THỨ II · PHÁT SÚNG SINH TỬ</strong>
                <b className="danger">2 người chết</b>
              </div>
              <p>
                • <b>Bầy Sói</b> cắn tử vong Thợ Săn Bảo Trâm.<br />
                • <b>Thợ Săn</b> nổ súng găm trúng tim Sói Đầu Đàn Đức Huy!
              </p>
            </article>

            <article className="timeline-event">
              <i className="timeline-dot win-dot" aria-hidden="true" />
              <div className="timeline-heading">
                <strong>NGÀY II · THÔN BẢN TOÀN THẮNG</strong>
                <b className="safe">Dân Làng Thắng</b>
              </div>
              <p>
                • Cả bàn đồng thuận 4 phiếu xử tử <b>Hoàng Nam</b> (Con sói cuối cùng).<br />
                • Ván đấu kết thúc trọn vẹn với chiến thắng thuộc về Dân Làng!
              </p>
            </article>
          </section>
        )}
      </div>

      <footer className="summary-footer">
        <button className="summary-rematch" onClick={() => onNavigate?.('lobby')}>
          <span className="rematch-icon" aria-hidden="true">🎲</span>
          <span>ĐẢO BÀI &amp; CHƠI VÁN MỚI</span>
        </button>
        <button
          className="summary-exit"
          onClick={() => onNavigate?.('home')}
          aria-label="Rời phòng về cổng làng"
          title="Rời phòng về cổng làng"
        >
          ⟵
        </button>
      </footer>
    </main>
  );
}
