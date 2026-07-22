import { guardedFetch } from './guardedFetch';

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
  try {
    const res = await guardedFetch(targetUrl, { timeoutMs, maxBytes: 3 * 1024 * 1024 });
    const { title, text } = cleanHtmlToText(res.body);
    return {
      ok: true,
      url: res.url,
      title,
      content: text,
    };
  } catch (err: any) {
    return { ok: false, url: targetUrl, error: err.message || String(err) };
  }
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
