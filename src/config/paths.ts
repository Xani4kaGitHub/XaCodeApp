import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const XACODE_HOME = path.resolve(process.env.XACODE_HOME || path.join(os.homedir(), '.xacode'));
export const CONFIG_ENV_PATH = path.join(XACODE_HOME, 'config.env');
export const IPC_TOKEN_PATH = path.join(XACODE_HOME, 'ipc-token');
export const IPC_SOCKET_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\xacode-agent'
  : path.join(XACODE_HOME, 'xacode.sock');

export function ensureXaCodeHome(): string {
  fs.mkdirSync(XACODE_HOME, { recursive: true });
  return XACODE_HOME;
}

export function xacodePath(...segments: string[]): string {
  return path.join(XACODE_HOME, ...segments);
}

export function workspaceId(workspace = process.cwd()): string {
  const normalized = path.resolve(workspace).toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export function workspaceStatePath(workspace = process.cwd(), ...segments: string[]): string {
  return xacodePath('projects', workspaceId(workspace), ...segments);
}
