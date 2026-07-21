import fs from 'fs/promises';
import path from 'path';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

export async function httpRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: any,
  timeoutMs: number = 10000
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const init: RequestInit = {
      method: method.toUpperCase(),
      headers: headers || {},
      signal: controller.signal as any
    };

    if (body !== undefined && init.method !== 'GET' && init.method !== 'HEAD') {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);

      const reqHeaders = init.headers as Record<string, string>;
      if (typeof body !== 'string' && !reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, init);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const responseBody = await response.text();

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function httpDownload(url: string, destination: string, maxBytes = 25 * 1024 * 1024, signal?: AbortSignal) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS downloads are supported.');
  const resolvedDestination = path.resolve(destination);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolvedDestination)) {
    throw new Error(`Download destination is outside the selected project sandbox: ${resolvedDestination}`);
  }

  const response = await fetch(parsed, { redirect: 'follow', signal });
  if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}: ${response.statusText}`);
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > maxBytes) throw new Error(`Download exceeds the ${maxBytes}-byte limit.`);

  if (!response.body) throw new Error('Download response did not contain a body.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Download exceeds the ${maxBytes}-byte limit.`);
    }
    chunks.push(Buffer.from(value));
  }
  const data = Buffer.concat(chunks, totalBytes);
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
  return { path: resolvedDestination, bytes: data.length, contentType: response.headers.get('content-type') || 'application/octet-stream' };
}
