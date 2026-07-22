import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface WebBrowserResult {
  ok: boolean;
  url: string;
  title?: string;
  content?: string;
  error?: string;
}

function cleanHtmlToText(html: string): { title: string; text: string } {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/[\r\n\t]+/g, ' ').trim();
  }

  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\n# $1\n\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s+\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length > 15000) {
    text = text.substring(0, 15000) + '\n... [Текст урезан для оптимизации контекста]';
  }

  return { title: title || 'Без заголовка', text };
}

export async function fetchWebPage(targetUrl: string, timeoutMs = 12000): Promise<WebBrowserResult> {
  return new Promise((resolve) => {
    try {
      let formattedUrl = targetUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = 'https://' + formattedUrl;
      }

      const parsedUrl = new URL(formattedUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(
        formattedUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 XaCodeBrowser/1.11.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, formattedUrl).toString();
            return fetchWebPage(redirectUrl, timeoutMs).then(resolve);
          }

          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            data += chunk;
            if (data.length > 2000000) { // Limit raw HTML to 2MB
              req.destroy();
            }
          });

          res.on('end', () => {
            const { title, text } = cleanHtmlToText(data);
            resolve({
              ok: true,
              url: formattedUrl,
              title,
              content: text,
            });
          });
        }
      );

      req.on('error', (err) => {
        resolve({ ok: false, url: formattedUrl, error: `Ошибка подключения: ${err.message}` });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, url: formattedUrl, error: 'Превышено время ожидания ответа сервера (таймаут).' });
      });
    } catch (err: any) {
      resolve({ ok: false, url: targetUrl, error: `Некорректный URL: ${err?.message || err}` });
    }
  });
}

export async function webBrowser(url: string, search?: string): Promise<string> {
  let targetUrl = url;
  if (search && !url) {
    targetUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(search)}`;
  }

  const result = await fetchWebPage(targetUrl);
  if (!result.ok) {
    return JSON.stringify({ ok: false, tool: 'web_browser', error: result.error });
  }

  return JSON.stringify({
    ok: true,
    tool: 'web_browser',
    data: {
      url: result.url,
      title: result.title,
      contentSnippet: result.content,
    },
  });
}
