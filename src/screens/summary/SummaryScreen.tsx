import { useState } from 'react';
import type { ScreenName } from '../../navigation';
import './summary.css';

type SummaryScreenProps = { onNavigate?: (screen: ScreenName) => void };

const players = [
  { name: 'Minh Khang', role: 'Tiên tri', symbol: '◉', status: 'CÒN SỐNG', side: 'seer' },
  { name: 'Lan Anh', role: 'Phù thủy', symbol: '✦', status: 'CÒN SỐNG', side: 'seer' },
  { name: 'Hoàng Nam', role: 'Ma sói', symbol: '♟', status: 'BỊ TREO CỔ', side: 'wolf' },
  { name: 'Bảo Trâm', role: 'Thợ săn', symbol: '⚑', status: 'BỊ CẮN', side: 'neutral' },
  { name: 'Đức Huy', role: 'Sói đầu đàn', symbol: '♟', status: 'BỊ BẮN', side: 'wolf' },
  { name: 'Quỳnh Như', role: 'Dân làng', symbol: '♙', status: 'CÒN SỐNG', side: 'village' },
];

export default function SummaryScreen({ onNavigate }: SummaryScreenProps) {
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'cards' | 'timeline'>('cards');
  const flip = (name: string) => setOpenCards((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const revealAll = () => setOpenCards(new Set(players.map((player) => player.name)));

  return (
    <main className="summary-screen">
      <header className="summary-header"><div><i /> <strong>GIẢI MÃ VÁN ĐẤU • PHÒNG #7290</strong></div><span>HOÀN TẤT</span></header>
      <div className="summary-content">
        <section className="summary-winner">
          <div className="summary-trophy" aria-hidden="true">♜</div>
          <div className="summary-winner-copy"><span>PHE CHIẾN THẮNG</span><h1>DÂN LÀNG TOÀN THẮNG</h1><p>Tất cả Ma Sói đã bị xử tử.</p></div>
          <button className="summary-reveal-all" onClick={revealAll}>LẬT TOÀN BÀN</button>
        </section>

        <section className="summary-turning-point"><span aria-hidden="true">✦</span><div><strong>BƯỚC NGOẶT VÁN ĐẤU</strong><p>Đêm 2: Sói cắn tử vong Thợ Săn Bảo Trâm. Trước khi nhắm mắt, Bảo Trâm kích hoạt phát đạn chính xác bắn hạ <b>Sói Đầu Đàn Đức Huy</b>, lật ngược thế trận cho Dân Làng!</p></div></section>

        <div className="summary-tabs" role="tablist" aria-label="Nội dung tổng kết">
          <button role="tab" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>▤ <span>LẬT THẺ BÀI (6)</span></button>
          <button role="tab" aria-selected={tab === 'timeline'} className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>◷ <span>DÒNG THỜI GIAN</span></button>
        </div>

        {tab === 'cards' ? <section className="summary-cards" aria-label="Vai trò người chơi">
          {players.map((player, index) => <button key={player.name} className={`summary-card ${openCards.has(player.name) ? 'is-open' : ''}`} onClick={() => flip(player.name)} aria-pressed={openCards.has(player.name)} aria-label={`${openCards.has(player.name) ? 'Ẩn' : 'Lật'} vai ${player.name}`}>
            <span className="summary-card-inner">
              <span className="summary-card-face summary-card-front"><small>GHẾ {index + 1}</small><i aria-hidden="true">✧</i><b>{player.name}</b><small className="summary-card-hint">CHẠM ĐỂ LẬT</small></span>
              <span className={`summary-card-face summary-card-back ${player.side}`}><b>{player.role}</b><i aria-hidden="true">{player.symbol}</i><small>{player.status}</small></span>
            </span>
          </button>)}
        </section> : <section className="summary-timeline" aria-label="Diễn biến ván đấu">
          <article><i className="timeline-dot night-dot"/><div className="timeline-heading"><strong>ĐÊM THỨ 1</strong><b className="safe">Bình yên</b></div><p>• Tiên tri soi Đức Huy (Ma Sói).<br />• Ma Sói cắn Quỳnh Như.<br />• Phù thủy dùng bình cứu kịp thời.</p></article>
          <article><i className="timeline-dot day-dot"/><div className="timeline-heading"><strong>ĐÊM 2 &amp; NGÀY 2</strong><b className="danger">2 người chết</b></div><p>• Sói cắn tử vong Thợ Săn Bảo Trâm.<br />• Thợ Săn bắn hạ chính xác Sói Đầu Đàn Đức Huy.</p></article>
          <article><i className="timeline-dot win-dot"/><div className="timeline-heading"><strong>NGÀY 3 • CHUNG CUỘC</strong><b className="safe">Chiến thắng</b></div><p>• Bàn biểu quyết 4 phiếu xử tử Hoàng Nam (Sói cuối cùng).</p></article>
        </section>}
      </div>
      <footer className="summary-footer"><button className="summary-rematch" onClick={() => onNavigate?.('lobby')}>⚄ <span>ĐẢO BÀI • VÁN MỚI</span></button><button className="summary-exit" onClick={() => onNavigate?.('home')} aria-label="Rời phòng về trang chủ">↪</button></footer>
    </main>
  );
}
