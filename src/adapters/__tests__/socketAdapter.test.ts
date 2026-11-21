import { describe, expect, it } from 'bun:test';
import { SocketAdapter } from '../socketAdapter';

describe('SocketAdapter - Multi Device Mode', () => {
  it('khởi tạo adapter với trạng thái ban đầu chính xác', () => {
    const adapter = new SocketAdapter('http://localhost:3001');
    const state = adapter.getState();

    expect(state.roomCode).toBe('');
    expect(state.deviceMode).toBe('MULTI_DEVICE');
    expect(state.isHost).toBe(false);
    expect(state.isConnected).toBe(false);
    expect(state.publicView).toBeNull();
  });

  it('lắng nghe thay đổi trạng thái qua subscribe', () => {
    const adapter = new SocketAdapter('http://localhost:3001');
    let capturedState = adapter.getState();

    const unsub = adapter.subscribe((newState) => {
      capturedState = newState;
    });

    expect(capturedState).toBeDefined();
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('resumeSession trả về false nếu không có phiên lưu trữ', async () => {
    const adapter = new SocketAdapter('http://localhost:3001');
    const ok = await adapter.resumeSession();
    expect(ok).toBe(false);
  });

  it('joinRoom báo lỗi ngay lập tức khi không thể kết nối hoặc bàn không tồn tại', async () => {
    // Cố ý kết nối đến port không tồn tại
    const adapter = new SocketAdapter('http://127.0.0.1:59999');
    let error: Error | null = null;
    try {
      await adapter.joinRoom('9999', 'PlayerOne');
    } catch (err) {
      error = err as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Bàn chưa tồn tại hoặc không thể kết nối|Không thể kết nối/);
  });
});
