import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { RoomService } from './roomService';
import { TimerManager } from './timerManager';
import { SocketGateway } from './socketGateway';

export interface ServerAppOptions {
  port?: number;
  corsOrigin?: string;
  minNightDelaySec?: number;
  maxNightDelaySec?: number;
  nowFn?: () => number;
}

export interface ServerAppInstance {
  httpServer: http.Server;
  io: SocketIOServer;
  roomService: RoomService;
  timerManager: TimerManager;
  socketGateway: SocketGateway;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
}

export function createServerApp(options: ServerAppOptions = {}): ServerAppInstance {
  const corsOrigin = options.corsOrigin ?? process.env.CORS_ORIGIN ?? '*';

  const httpServer = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'werewolf-moderator-backend' }));
  });

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  const roomService = new RoomService();
  const timerManager = new TimerManager({
    minNightDelaySec: options.minNightDelaySec,
    maxNightDelaySec: options.maxNightDelaySec,
    nowFn: options.nowFn,
  });

  const socketGateway = new SocketGateway(io, roomService, timerManager);
  socketGateway.registerEvents();

  const start = async (customPort?: number): Promise<number> => {
    const port = customPort ?? options.port ?? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3001);
    return new Promise<number>((resolve) => {
      httpServer.listen(port, '127.0.0.1', () => {
        const address = httpServer.address();
        const actualPort = typeof address === 'object' && address !== null ? address.port : port;
        resolve(actualPort);
      });
    });
  };

  const stop = async (): Promise<void> => {
    roomService.destroy();
    return new Promise<void>((resolve, reject) => {
      io.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  return {
    httpServer,
    io,
    roomService,
    timerManager,
    socketGateway,
    start,
    stop,
  };
}

// Nếu file được gọi trực tiếp bằng node/bun
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isMain) {
  const app = createServerApp();
  void app.start().then((port) => {
    // eslint-disable-next-line no-console
    console.log(`[Werewolf Backend] Server đang chạy tại cổng ${port}`);
  });
}
