import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const XACODE_HOME = path.resolve(process.env.XACODE_HOME || path.join(os.homedir(), '.xacode'));
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
