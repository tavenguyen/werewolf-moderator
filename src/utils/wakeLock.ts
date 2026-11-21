/**
 * Screen Wake Lock Utility
 * Giữ màn hình luôn sáng trong suốt ván chơi Ma Sói để người chơi không bị tắt màn hình ban đêm.
 * Tự động yêu cầu lại khi chuyển tab (visibilitychange) và giải phóng khi kết thúc hoặc rời phòng.
 */

let wakeLockSentinel: WakeLockSentinel | null = null;
let isRequested = false;

export async function requestWakeLock(): Promise<boolean> {
  isRequested = true;
  if (typeof window === 'undefined' || !('wakeLock' in navigator)) {
    return false;
  }

  try {
    if (!wakeLockSentinel || wakeLockSentinel.released) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel.addEventListener('release', () => {
        // Log release event if needed
      });
    }
    return true;
  } catch (err) {
    // Wake Lock request có thể bị từ chối nếu pin yếu hoặc tab không hiển thị
    console.warn('Screen Wake Lock không thể kích hoạt:', err);
    return false;
  }
}

export async function releaseWakeLock(): Promise<void> {
  isRequested = false;
  if (wakeLockSentinel && !wakeLockSentinel.released) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    } finally {
      wakeLockSentinel = null;
    }
  }
}

// Lắng nghe khi tab active trở lại để re-acquire nếu đang trong ván
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRequested) {
      void requestWakeLock();
    }
  });
}
