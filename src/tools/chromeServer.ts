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
  private pendingCommands = new Map<string, { resolve: (res: ChromeCommandResult) => void; reject: (err: any) => void }>();
  private port = 9223;
  private isConnected = false;

  startServer() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'XaCode Chrome Server Running', connected: this.isConnected }));
    });

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[XaCode ChromeServer] Порт ${this.port} уже занят другим процессом. Повторный запуск пропущен.`);
      } else {
        console.error('[XaCode ChromeServer] Ошибка сервера:', err);
      }
    });

    this.server.on('upgrade', (req, socket, head) => {
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
      this.emit('connected');
      console.log('[XaCode ChromeServer] Chrome Extension успешно подключено!');

      socket.on('data', (buffer: Buffer) => {
        this.handleFrame(buffer);
      });

      socket.on('close', () => {
        this.clientSocket = null;
        this.isConnected = false;
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
    return this.isConnected;
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

    this.clientSocket.write(Buffer.concat([header, payload]));
  }

  private handleFrame(buffer: Buffer) {
    try {
      if (buffer.length < 2) return;
      const firstByte = buffer[0];
      const opcode = firstByte & 0x0f;

      // Обработка закрытия соединения (0x8)
      if (opcode === 0x8) {
        if (this.clientSocket) {
          this.clientSocket.end();
          this.clientSocket = null;
          this.isConnected = false;
        }
        return;
      }

      // Обработка Ping (0x9) -> Отправка Pong (0xA)
      if (opcode === 0x9) {
        if (this.clientSocket) {
          this.clientSocket.write(Buffer.from([0x8a, 0x00]));
        }
        return;
      }

      // Игнорируем управляющие фреймы, кроме текстового (0x1)
      if (opcode !== 0x1) return;

      const secondByte = buffer[1];
      const isMasked = (secondByte & 0x80) !== 0;
      let length = secondByte & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let mask: Buffer | null = null;
      if (isMasked) {
        if (buffer.length < offset + 4) return;
        mask = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + length) return;

      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (isMasked && mask) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      const messageStr = payload.toString('utf-8').trim();
      if (!messageStr || !messageStr.startsWith('{')) return;

      const msg = JSON.parse(messageStr);

      if (msg.type === 'INTERRUPT') {
        console.warn('[XaCode ChromeServer] Получен сигнал отмены Esc от пользователя!');
        this.emit('interrupt', msg);
        for (const [cmdId, deferred] of this.pendingCommands.entries()) {
          deferred.reject(new Error('USER_INTERRUPTED_EXECUTION'));
          this.pendingCommands.delete(cmdId);
        }
      } else if (msg.type === 'COMMAND_RESULT') {
        const deferred = this.pendingCommands.get(msg.commandId);
        if (deferred) {
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
    if (!this.isConnected || !this.clientSocket) {
      throw new Error('Chrome Extension не подключено. Запустите Google Chrome с установленным расширением XaCode Bridge.');
    }

    const commandId = 'cmd_' + Math.random().toString(36).substring(2, 10);

    return new Promise((resolve, reject) => {
      const abortHandler = () => {
        this.pendingCommands.delete(commandId);
        reject(new Error('USER_INTERRUPTED_EXECUTION'));
      };

      if (signal) {
        if (signal.aborted) {
          return reject(new Error('USER_INTERRUPTED_EXECUTION'));
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pendingCommands.set(commandId, {
        resolve: (res) => {
          if (signal) signal.removeEventListener('abort', abortHandler);
          resolve(res);
        },
        reject: (err) => {
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
  }
}

export const chromeServerBridge = new ChromeServerBridge();
