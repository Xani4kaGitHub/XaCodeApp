import fs from 'fs';
import os from 'os';
import path from 'path';
import { xacodePath } from '../config/paths';

export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

class Logger {
  private logFile: string;
  private logDir: string;

  constructor() {
    const candidates = [
      process.env.XACODE_LOG_DIR,
      xacodePath('logs'),
      path.join(os.tmpdir(), 'XaCode', 'logs'),
    ].filter(Boolean) as string[];
    this.logDir = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      try {
        fs.mkdirSync(candidate, { recursive: true });
        this.logDir = candidate;
        break;
      } catch {}
    }
    this.logFile = path.join(this.logDir, `xacode_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
  }

  private write(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;

    // Write to stdout
    if (level === LogLevel.ERROR) {
      console.error(logLine.trim());
    } else {
      console.log(logLine.trim());
    }

    // Write to file
    try { fs.appendFileSync(this.logFile, logLine); } catch {}
  }

  info(message: string, ...args: any[]) { this.write(LogLevel.INFO, message, ...args); }
  warn(message: string, ...args: any[]) { this.write(LogLevel.WARN, message, ...args); }
  error(message: string, ...args: any[]) { this.write(LogLevel.ERROR, message, ...args); }
  debug(message: string, ...args: any[]) { this.write(LogLevel.DEBUG, message, ...args); }

  async uploadPaste(content: string, filename: string = 'log.txt'): Promise<string> {
    // Basic pastebin fallback for long logs. Using a public service or just saving locally and returning path.
    // For a real production app, integration with something like hastebin, gist, or a custom server is better.
    // For now, we will save to a temporary file in the sandbox and return the path, or a stub URL.
    const tempFile = path.join(this.logDir, `paste_${Date.now()}_${path.basename(filename)}`);
    fs.writeFileSync(tempFile, content);
    return `Saved to local file: ${tempFile} (Pastebin upload not configured)`;
  }
}

export const logger = new Logger();
