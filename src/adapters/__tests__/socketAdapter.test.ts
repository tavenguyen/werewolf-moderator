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

  it('hasRecoverableSession trả về false khi không có session hoặc session đã hết hạn', () => {
    const adapter = new SocketAdapter('http://localhost:3001');
    expect(adapter.hasRecoverableSession()).toBe(false);
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

  it('resumeSession thoát về false và đặt isConnecting = false theo timeout fallback khi offline', async () => {
    const store = new Map<string, string>();
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      store.set(
        'werewolf_socket_session',
        JSON.stringify({
          roomCode: '1234',
          token: 'offline-test-token',
          isHost: false,
          hostMode: 'CENTER_BOARD',
          expiresAt: Date.now() + 60_000,
        })
      );

      const adapter = new SocketAdapter('http://127.0.0.1:59999', { resumeTimeoutMs: 150 });
      const ok = await adapter.resumeSession();

      expect(ok).toBe(false);
      expect(adapter.getState().isConnecting).toBe(false);
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });

  it('createRoom đua với resumeSession chậm không bị ghi đè state hoặc xóa session mới, và connect ban đầu không tự bắn room:resume', async () => {
    const store = new Map<string, string>();
    const originalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      store.set(
        'werewolf_socket_session',
        JSON.stringify({
          roomCode: '1111',
          token: 'stale-token',
          isHost: true,
          hostMode: 'CENTER_BOARD',
          expiresAt: Date.now() + 60_000,
        })
      );

      const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
      let resumeEmitCount = 0;
      let resolveSlowResume: ((res: unknown) => void) | null = null;

      const fakeSocket = {
        connected: false,
        disconnected: false,
        on(event: string, fn: (...args: unknown[]) => void) {
          const list = listeners.get(event) ?? [];
          list.push(fn);
          listeners.set(event, list);
          return this;
        },
        once(event: string, fn: (...args: unknown[]) => void) {
          const wrapper = (...args: unknown[]) => {
            this.off(event, wrapper);
            fn(...args);
          };
          return this.on(event, wrapper);
        },
        off(event: string, fn: (...args: unknown[]) => void) {
          const list = listeners.get(event) ?? [];
          listeners.set(
            event,
            list.filter((item) => item !== fn)
          );
          return this;
        },
        connect() {
          this.connected = true;
          for (const fn of [...(listeners.get('connect') ?? [])]) {
            fn();
          }
          return this;
        },
        emit(event: string, _payload: unknown, ack?: (res: unknown) => void) {
          if (event === 'room:resume') {
            resumeEmitCount += 1;
            resolveSlowResume = ack ?? null;
          } else if (event === 'room:create') {
            ack?.({
              ok: true,
              data: { roomCode: '5678', hostToken: 'fresh-host-token' },
            });
          }
          return this;
        },
      };

      const adapter = new SocketAdapter('http://localhost:3001', {
        resumeTimeoutMs: 2000,
        socketFactory: () => fakeSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
      });

      // 1. Bắt đầu resumeSession (chậm) và kết nối socket lần đầu
      const resumePromise = adapter.resumeSession();
      fakeSocket.connect();
      await Promise.resolve();

      // Connect ban đầu (chưa có roomCode trong bộ nhớ) KHÔNG được bắn thêm room:resume thứ 2
      expect(resumeEmitCount).toBe(1);

      // 2. Trong lúc resumeSession đang chờ ack, user tạo phòng mới
      const created = await adapter.createRoom({ isPlayer: false });
      expect(created.roomCode).toBe('5678');

      // 3. Sau đó resumeSession cũ mới trả về lỗi ROOM_NOT_FOUND
      expect(resolveSlowResume).not.toBeNull();
      resolveSlowResume!({
        ok: false,
        error: { code: 'ROOM_NOT_FOUND', message: 'Bàn cũ không tồn tại.' },
      });

      const resumed = await resumePromise;
      expect(resumed).toBe(false);

      // State và session mới trong localStorage phải còn nguyên vẹn!
      expect(adapter.getState().roomCode).toBe('5678');
      expect(adapter.getState().error).toBeNull();
      const savedAfter = JSON.parse(store.get('werewolf_socket_session') ?? '{}');
      expect(savedAfter.roomCode).toBe('5678');
      expect(savedAfter.token).toBe('fresh-host-token');
    } finally {
      if (originalStorage === undefined) {
        delete (globalThis as Record<string, unknown>).localStorage;
      } else {
        (globalThis as Record<string, unknown>).localStorage = originalStorage;
      }
    }
  });
});
