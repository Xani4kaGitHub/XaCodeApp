import fs from 'fs/promises';
import path from 'path';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';
import { guardedFetch } from './guardedFetch';

export async function httpRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: any,
  timeoutMs: number = 10000
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const reqBody = body !== undefined && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
    ? (typeof body === 'string' ? body : JSON.stringify(body))
    : undefined;

  const reqHeaders = { ...(headers || {}) };
  if (reqBody !== undefined && typeof body !== 'string' && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await guardedFetch(url, {
    method: method.toUpperCase(),
    headers: reqHeaders,
    body: reqBody,
    timeoutMs,
    maxBytes: 10 * 1024 * 1024, // 10MB limit
    allowLocalhost: true,
  });

  return {
    status: res.status,
    headers: res.headers,
    body: res.body,
  };
}

export async function httpDownload(url: string, destination: string, maxBytes = 25 * 1024 * 1024, signal?: AbortSignal) {
  const resolvedDestination = path.resolve(destination);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolvedDestination)) {
    throw new Error(`Download destination is outside the selected project sandbox: ${resolvedDestination}`);
  }

  const res = await guardedFetch(url, {
    method: 'GET',
    maxBytes,
    allowLocalhost: true,
    signal,
  });

  if (!res.ok) throw new Error(`Download failed with HTTP ${res.status}: ${res.statusText}`);
  const data = Buffer.from(res.body, 'utf8');

  await fs.mkdir(path.dirname(resolvedDestination), { recursive: true });
  const temporary = `${resolvedDestination}.xacode-download-${process.pid}`;
  try {
    await fs.writeFile(temporary, data);
    await fs.rm(resolvedDestination, { force: true });
    await fs.rename(temporary, resolvedDestination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return { path: resolvedDestination, bytes: data.length, contentType: res.headers['content-type'] || 'application/octet-stream' };
}
