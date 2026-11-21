import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { Server as SocketIOServer } from 'socket.io';
import { RoomService } from './src/server/roomService';
import { TimerManager } from './src/server/timerManager';
import { SocketGateway } from './src/server/socketGateway';

function werewolfSocketPlugin(): Plugin {
  return {
    name: 'werewolf-socket-plugin',
    configureServer(server) {
      if (!server.httpServer) return;
      const io = new SocketIOServer(server.httpServer, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
      });
      const roomService = new RoomService();
      const timerManager = new TimerManager();
      const socketGateway = new SocketGateway(io, roomService, timerManager);
      socketGateway.registerEvents();
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), werewolfSocketPlugin()],
  server: {
    host: '0.0.0.0',
  },
});
