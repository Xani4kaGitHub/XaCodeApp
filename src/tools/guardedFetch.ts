import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface GuardedFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  redirectCount?: number;
  allowLocalhost?: boolean;
  signal?: AbortSignal;
}

export interface GuardedFetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

function isPrivateIp(ip: string, allowLocalhost = false): boolean {
  if (allowLocalhost && (ip === '127.0.0.1' || ip === '::1')) return false;
  // IPv4 Loopback (127.0.0.0/8)
  if (/^127\./.test(ip)) return true;
  // IPv4 Private (10.0.0.0/8)
  if (/^10\./.test(ip)) return true;
  // IPv4 Private (172.16.0.0/12)
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  // IPv4 Private (192.168.0.0/16)
  if (/^192\.168\./.test(ip)) return true;
  // IPv4 Link-Local / Cloud Metadata (169.254.0.0/16)
  if (/^169\.254\./.test(ip)) return true;
  // IPv4 Unspecified / Broadcast
  if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;

  // IPv6 Loopback, Local, Private
  if (ip === '::1' || ip === '::' || /^fe80:/i.test(ip) || /^fc00:/i.test(ip) || /^fd00:/i.test(ip)) return true;

  return false;
}

export async function guardedFetch(
  targetUrl: string,
  options: GuardedFetchOptions = {}
): Promise<GuardedFetchResult> {
  const isTestOrDev = process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production';
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10000,
    maxBytes = 5 * 1024 * 1024,
    redirectCount = 0,
    allowLocalhost = options.allowLocalhost ?? isTestOrDev,
    signal,
  } = options;

  if (redirectCount > 5) {
    throw new Error('SSRF Guard: Превышено максимальное количество редиректов (5).');
  }

  let parsedUrl: URL;
  try {
    let formatted = targetUrl.trim();
    if (!/^https?:\/\//i.test(formatted)) formatted = 'https://' + formatted;
    parsedUrl = new URL(formatted);
  } catch (err: any) {
    throw new Error(`SSRF Guard: Некорректный URL: ${err.message}`);
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`SSRF Guard: Протокол ${parsedUrl.protocol} не поддерживается. Разрешены только HTTP и HTTPS.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!allowLocalhost && (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local'))) {
    throw new Error(`SSRF Guard: Запросы к локальным именам (${hostname}) запрещены.`);
  }

  // Resolve IP to check for SSRF
  try {
    const lookupResult = await dns.lookup(hostname, { all: true });
    for (const record of lookupResult) {
      if (isPrivateIp(record.address, allowLocalhost)) {
        throw new Error(`SSRF Guard: Запрос к внутреннему/приватному IP-адресу (${record.address}) заблокирован.`);
      }
    }
  } catch (err: any) {
    if (err.message.includes('SSRF Guard:')) throw err;
    throw new Error(`SSRF Guard: Ошибка сопоставления DNS для ${hostname}: ${err.message}`);
  }

  return new Promise((resolve, reject) => {
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions: http.RequestOptions = {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method.toUpperCase(),
      headers: {
        'User-Agent': 'XaCode-GuardedFetch/1.11.13',
        ...headers,
      },
      timeout: timeoutMs,
    };

    let abortHandler: (() => void) | null = null;
    if (signal) {
      if (signal.aborted) {
        return reject(new Error('USER_INTERRUPTED_EXECUTION'));
      }
      abortHandler = () => {
        req.destroy();
        reject(new Error('USER_INTERRUPTED_EXECUTION'));
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    const req = client.request(reqOptions, (res) => {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);

      const statusCode = res.statusCode || 500;
      const statusText = res.statusMessage || '';

      // Handle Redirects safely
      if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
        req.destroy();
        const nextUrl = new URL(res.headers.location, parsedUrl.toString()).toString();
        return guardedFetch(nextUrl, { ...options, redirectCount: redirectCount + 1 })
          .then(resolve)
          .catch(reject);
      }

      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers)) {
        if (v !== undefined) {
          responseHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
        }
      }

      let receivedBytes = 0;
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          req.destroy();
          reject(new Error(`SSRF Guard: Превышен максимальный лимит размера ответа (${Math.round(maxBytes / 1024 / 1024)}MB).`));
        } else {
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          statusText,
          url: parsedUrl.toString(),
          headers: responseHeaders,
          body: bodyBuffer.toString('utf8'),
        });
      });

      res.on('error', (err) => {
        reject(new Error(`GuardedFetch network error: ${err.message}`));
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('GuardedFetch: Превышено время ожидания ответа (таймаут).'));
    });

    req.on('error', (err) => {
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler);
      reject(new Error(`GuardedFetch request error: ${err.message}`));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
