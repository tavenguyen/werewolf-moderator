import EventEmitter from 'node:events';
import type { Server as SocketIOServer, Socket as ServerSocket } from 'socket.io';

export class MockClientSocket extends EventEmitter {
  public id: string;
  public connected = true;
  private serverSocket: MockServerSocket;

  constructor(id: string, serverSocket: MockServerSocket) {
    super();
    this.id = id;
    this.serverSocket = serverSocket;
  }

  public emit(event: string, ...args: unknown[]): boolean {
    if (!this.connected) return false;
    // Chuyển tới server socket
    setImmediate(() => {
      this.serverSocket.trigger(event, ...args);
    });
    return true;
  }

  public disconnect(): this {
    if (this.connected) {
      this.connected = false;
      this.serverSocket.trigger('disconnect');
      this.emit('disconnect');
    }
    return this;
  }
}

export class MockServerSocket extends EventEmitter {
  public id: string;
  public rooms = new Set<string>();
  private clientSocket!: MockClientSocket;
  private server: MockSocketIOServer;

  constructor(id: string, server: MockSocketIOServer) {
    super();
    this.id = id;
    this.server = server;
  }

  public setClient(client: MockClientSocket): void {
    this.clientSocket = client;
  }

  public join(room: string): void {
    this.rooms.add(room);
    this.server.addSocketToRoom(room, this);
  }

  public leave(room: string): void {
    this.rooms.delete(room);
    this.server.removeSocketFromRoom(room, this);
  }

  public emit(event: string, ...args: unknown[]): boolean {
    setImmediate(() => {
      this.clientSocket.emit(event, ...args);
    });
    return true;
  }

  public trigger(event: string, ...args: unknown[]): void {
    this.emitLocal(event, ...args);
  }

  public emitLocal(event: string, ...args: unknown[]): void {
    const listeners = this.rawListeners(event);
    for (const fn of listeners) {
      fn(...args);
    }
  }
}

export class MockSocketIOServer extends EventEmitter {
  public sockets = new Map<string, MockServerSocket>();
  public rooms = new Map<string, Set<MockServerSocket>>();
  private socketCount = 0;

  public createClientSocket(): MockClientSocket {
    this.socketCount++;
    const id = `mock_sock_${this.socketCount}`;
    const serverSock = new MockServerSocket(id, this);
    const clientSock = new MockClientSocket(id, serverSock);
    serverSock.setClient(clientSock);

    this.sockets.set(id, serverSock);

    // Kích hoạt event connection
    this.emit('connection', serverSock);

    return clientSock;
  }

  public addSocketToRoom(room: string, socket: MockServerSocket): void {
    let set = this.rooms.get(room);
    if (!set) {
      set = new Set();
      this.rooms.set(room, set);
    }
    set.add(socket);
  }

  public removeSocketFromRoom(room: string, socket: MockServerSocket): void {
    const set = this.rooms.get(room);
    if (set) {
      set.delete(socket);
      if (set.size === 0) {
        this.rooms.delete(room);
      }
    }
  }

  public to(room: string) {
    return {
      emit: (event: string, ...args: unknown[]) => {
        const set = this.rooms.get(room);
        if (set) {
          for (const sock of set) {
            sock.emit(event, ...args);
          }
        }
      },
    };
  }

  public close(cb?: (err?: Error) => void): void {
    this.sockets.clear();
    this.rooms.clear();
    if (cb) cb();
  }
}

/**
 * Helper bọc Mock server thành Socket.io Server thực để truyền vào SocketGateway.
 */
export function createMockIoServer(): MockSocketIOServer {
  return new MockSocketIOServer();
}
