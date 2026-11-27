import { useEffect, useRef } from 'react';

type QuickEndGameModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onRevealAndEnd: () => void | Promise<void>;
  onAbortToLobby: () => void | Promise<void>;
  isBusy?: boolean;
};

/**
 * Hộp thoại xác nhận kết thúc ván sớm an toàn với 3 lựa chọn:
 * Tiếp tục chơi (mặc định an toàn), Lật bài kết thúc ván, hoặc Về thẳng Phòng chờ.
 */
export default function QuickEndGameModal({
  isOpen,
  onClose,
  onRevealAndEnd,
  onAbortToLobby,
  isBusy = false,
}: QuickEndGameModalProps) {
  const continueBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    continueBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      openerRef.current?.focus();
    };
  }, [isOpen, isBusy, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'rgba(6, 8, 12, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-end-game-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: '#131720',
          border: '1px solid rgba(212, 175, 55, 0.35)',
          borderRadius: '14px',
          padding: '20px',
          color: '#e2e8f0',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.75)',
        }}
      >
        <h2
          id="quick-end-game-title"
          style={{ margin: '0 0 10px', fontSize: '17px', color: '#f8fafc' }}
        >
          Kết thúc ván đang chơi?
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: '13.5px', lineHeight: 1.5, color: '#cbd5e1' }}>
          Diễn biến ván hiện tại sẽ bị dừng lại, nhưng danh sách người chơi và bộ bài vẫn được giữ nguyên ở Phòng chờ.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            ref={continueBtnRef}
            type="button"
            disabled={isBusy}
            onClick={onClose}
            style={{
              padding: '11px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(212, 175, 55, 0.45)',
              background: 'rgba(212, 175, 55, 0.16)',
              color: '#f5d77f',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Tiếp tục chơi
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onRevealAndEnd()}
            style={{
              padding: '11px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#e2e8f0',
              fontWeight: 500,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Lật bài kết thúc ván
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onAbortToLobby()}
            style={{
              padding: '11px 14px',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              background: 'rgba(220, 38, 38, 0.2)',
              color: '#fca5a5',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Về thẳng Phòng chờ
          </button>
        </div>
      </section>
    </div>
  );
}
