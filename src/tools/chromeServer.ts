import http from 'http';
import crypto from 'crypto';
import { EventEmitter } from 'events';

export interface ChromeCommandResult {
  success: boolean;
  data?: any;
  error?: string;
}

class ChromeServerBridge extends EventEmitter {
  private server: http.Server | null = null;
  private clientSocket: any = null;
  private isConnected = false;
  private isAuthenticated = false;
  private port = 9223;
  public secretToken: string = crypto.randomBytes(32).toString('hex');
  private pendingCommands = new Map<string, { resolve: (val: ChromeCommandResult) => void; reject: (err: any) => void; timer?: NodeJS.Timeout }>();

  constructor() {
    super();
  }

  getAuthToken(): string {
    return this.secretToken;
  }

  startServer() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'XaCode Chrome Server Running', connected: this.isConnected && this.isAuthenticated }));
    });

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[XaCode ChromeServer] Порт ${this.port} уже занят другим процессом. Повторный запуск пропущен.`);
      } else {
        console.error('[XaCode ChromeServer] Ошибка сервера:', err);
      }
    });

    this.server.on('upgrade', (req, socket, head) => {
      const origin = String(req.headers.origin || '').toLowerCase();
      if (origin && !origin.startsWith('chrome-extension://') && !origin.startsWith('moz-extension://')) {
        console.warn('[XaCode ChromeServer] Отклонено подключение с недопустимым Origin:', origin);
        socket.destroy();
        return;
      }

      const key = req.headers['sec-websocket-key'];
      if (!key) {
        socket.destroy();
        return;
      }

      const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

      const responseHeaders = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`
      ];

      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
      this.clientSocket = socket;
      this.isConnected = true;
      this.isAuthenticated = false;

      const authTimer = setTimeout(() => {
        if (!this.isAuthenticated) {
          console.warn('[XaCode ChromeServer] Таймаут рукопожатия аутентификации. Сокет закрыт.');
          socket.destroy();
        }
      }, 5000);

      socket.on('data', (buffer: Buffer) => {
        this.handleFrame(buffer, authTimer);
      });

      socket.on('close', () => {
        clearTimeout(authTimer);
        this.clientSocket = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        for (const [cmdId, deferred] of this.pendingCommands.entries()) {
          if (deferred.timer) clearTimeout(deferred.timer);
          deferred.reject(new Error('Chrome Extension websocket connection closed.'));
        }
        this.pendingCommands.clear();
        this.emit('disconnected');
        console.log('[XaCode ChromeServer] Chrome Extension отключено.');
      });

      socket.on('error', (err: any) => {
        console.warn('[XaCode ChromeServer] Socket error:', err);
      });
    });

    try {
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`[XaCode ChromeServer] Сервер запущен на http://127.0.0.1:${this.port}`);
      });
      this.server.unref();
    } catch (e: any) {
      console.warn('[XaCode ChromeServer] Не удалось запустить сервер:', e.message);
    }
  }

  isExtensionConnected(): boolean {
    return this.isConnected && this.isAuthenticated;
  }

  private sendWsText(text: string) {
    if (!this.clientSocket || !this.isConnected) return;
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;

    let header: Buffer;
    if (length <= 125) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    try {
      this.clientSocket.write(Buffer.concat([header, payload]));
    } catch (e) {
      console.error('[XaCode ChromeServer] Ошибка отправки WebSocket пакета:', e);
    }
  }

  private handleFrame(buffer: Buffer, authTimer?: NodeJS.Timeout) {
    if (buffer.length < 2) return;

    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let currentOffset = 2;

    if (payloadLength === 126) {
      if (buffer.length < 4) return;
      payloadLength = buffer.readUInt16BE(2);
      currentOffset = 4;
    } else if (payloadLength === 127) {
      if (buffer.length < 10) return;
      payloadLength = Number(buffer.readBigUInt64BE(2));
      currentOffset = 10;
    }

    let maskingKey: Buffer | null = null;
    if (isMasked) {
      if (buffer.length < currentOffset + 4) return;
      maskingKey = buffer.slice(currentOffset, currentOffset + 4);
      currentOffset += 4;
    }

    if (buffer.length < currentOffset + payloadLength) return;
    let payload = buffer.slice(currentOffset, currentOffset + payloadLength);

    if (isMasked && maskingKey) {
      const unmasked = Buffer.alloc(payloadLength);
      for (let i = 0; i < payloadLength; i++) {
        unmasked[i] = payload[i] ^ maskingKey[i % 4];
      }
      payload = unmasked;
    }

    try {
      const text = payload.toString('utf-8');
      const msg = JSON.parse(text);

      if (msg.type === 'REGISTER') {
        if (msg.token === this.secretToken) {
          this.isAuthenticated = true;
          if (authTimer) clearTimeout(authTimer);
          this.emit('connected');
          console.log('[XaCode ChromeServer] Chrome Extension успешно прошла аутентификацию по секрет-токену!');
          this.sendWsText(JSON.stringify({ type: 'REGISTER_OK' }));
        } else {
          console.warn('[XaCode ChromeServer] Неверный секрет-токен при аутентификации.');
          if (this.clientSocket) this.clientSocket.destroy();
        }
        return;
      }

      if (!this.isAuthenticated) {
        console.warn('[XaCode ChromeServer] Сообщение отклонено: клиент не аутентифицирован.');
        return;
      }

      if (msg.type === 'PING') {
        this.sendWsText(JSON.stringify({ type: 'PONG' }));
      } else if (msg.type === 'HEARTBEAT') {
        const cmdId = msg.commandId || msg.id;
        if (cmdId && this.pendingCommands.has(cmdId)) {
          // Heartbeat received
        }
      } else if (msg.type === 'COMMAND_RESULT') {
        const deferred = this.pendingCommands.get(msg.commandId);
        if (deferred) {
          if (deferred.timer) clearTimeout(deferred.timer);
          deferred.resolve({
            success: msg.success,
            data: msg.data,
            error: msg.error
          });
          this.pendingCommands.delete(msg.commandId);
        }
      }
    } catch (e) {
      console.error('[XaCode ChromeServer] Ошибка разбора WebSocket фрейма:', e);
    }
  }

  async sendCommand(action: string, params: any = {}, signal?: AbortSignal): Promise<ChromeCommandResult> {
    if (!this.isConnected || !this.isAuthenticated || !this.clientSocket) {
      throw new Error('Chrome Extension не аутентифицировано. Запустите Google Chrome с установленным расширением XaCode Bridge.');
    }

    const commandId = 'cmd_' + Math.random().toString(36).substring(2, 10);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingCommands.has(commandId)) {
          this.pendingCommands.delete(commandId);
          reject(new Error('Chrome command execution timed out (15000ms limit).'));
        }
      }, 15000);

      const abortHandler = () => {
        clearTimeout(timer);
        this.pendingCommands.delete(commandId);
        reject(new Error('USER_INTERRUPTED_EXECUTION'));
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          return reject(new Error('USER_INTERRUPTED_EXECUTION'));
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pendingCommands.set(commandId, {
        timer,
        resolve: (res) => {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', abortHandler);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          if (signal) signal.removeEventListener('abort', abortHandler);
          reject(err);
        }
      });

      this.sendWsText(JSON.stringify({
        type: 'COMMAND',
        commandId,
        action,
        params
      }));
    });
  }

  stopServer() {
    if (this.clientSocket) {
      try { this.clientSocket.destroy(); } catch (e) {}
      this.clientSocket = null;
    }
    if (this.server) {
      try { this.server.close(); } catch (e) {}
      this.server = null;
    }
    this.isConnected = false;
    this.isAuthenticated = false;
  }
}

export const chromeServerBridge = new ChromeServerBridge();
