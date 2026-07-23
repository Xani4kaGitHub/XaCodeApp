// Content Script for XaCode Chrome Bridge - Visual Agent Actions & Custom AI Cursor Engine
(function () {
  console.log('[XaCode Content Script] Запущен на странице');

  // Отслеживание нажатия клавиши ESC для моментальной остановки агента
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      console.warn('[XaCode Content Script] Нажата клавиша Esc!');
      showBanner('⛔ Действие агента прервано (Esc)', '#ef4444');
      removeCursor();
      chrome.runtime.sendMessage({ type: 'USER_INTERRUPT_ESC' });
    }
  }, true);

  // Слушатель команд от background.js
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VISUAL_ACTION') {
      handleVisualAction(message.action, message.params)
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async response
    }
  });

  // Элементы визуализации
  let cursorEl = null;
  let highlightEl = null;

  function ensureCursor() {
    if (!cursorEl) {
      cursorEl = document.createElement('div');
      cursorEl.id = 'xacode-ai-cursor';
      cursorEl.style.cssText = `
        position: fixed;
        width: 28px;
        height: 28px;
        z-index: 9999999;
        pointer-events: none;
        transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        transform: translate(-100px, -100px);
        opacity: 0;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      cursorEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(0 2px 8px rgba(124,58,237,0.6));">
          <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="url(#cursor-grad)" stroke="#ffffff" stroke-width="1.8"/>
          <defs>
            <linearGradient id="cursor-grad" x1="3" y1="3" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#a78bfa"/>
              <stop offset="100%" stop-color="#3b82f6"/>
            </linearGradient>
          </defs>
        </svg>
        <span style="background: rgba(15, 16, 21, 0.92); color: #a78bfa; border: 1px solid #7c3aed; font-family: system-ui, -apple-system, sans-serif; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.4); backdrop-filter: blur(6px);">⚡ XaCode AI</span>
      `;
      document.body.appendChild(cursorEl);
    }
    return cursorEl;
  }

  function ensureHighlight() {
    if (!highlightEl) {
      highlightEl = document.createElement('div');
      highlightEl.id = 'xacode-ai-highlight';
      highlightEl.style.cssText = `
        position: absolute;
        z-index: 9999998;
        pointer-events: none;
        border: 2px solid #a78bfa;
        background: rgba(167, 139, 250, 0.15);
        border-radius: 6px;
        box-shadow: 0 0 20px rgba(167, 139, 250, 0.5);
        transition: all 0.3s ease;
        opacity: 0;
      `;
      document.body.appendChild(highlightEl);
    }
    return highlightEl;
  }

  function removeCursor() {
    if (cursorEl) cursorEl.style.opacity = '0';
    if (highlightEl) highlightEl.style.opacity = '0';
  }

  function moveCursorToElement(el) {
    const cursor = ensureCursor();
    const highlight = ensureHighlight();
    const rect = el.getBoundingClientRect();

    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;

    cursor.style.transform = `translate(${targetX}px, ${targetY}px)`;
    cursor.style.opacity = '1';

    highlight.style.top = `${rect.top + window.scrollY - 3}px`;
    highlight.style.left = `${rect.left + window.scrollX - 3}px`;
    highlight.style.width = `${rect.width + 6}px`;
    highlight.style.height = `${rect.height + 6}px`;
    highlight.style.opacity = '1';
  }

  function createRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 12px;
      height: 12px;
      margin-left: -6px;
      margin-top: -6px;
      border-radius: 50%;
      background: rgba(167, 139, 250, 0.85);
      z-index: 9999999;
      pointer-events: none;
      box-shadow: 0 0 14px #a78bfa;
      animation: xacodeRipple 0.65s ease-out forwards;
    `;
    if (!document.getElementById('xacode-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'xacode-ripple-style';
      style.innerHTML = `
        @keyframes xacodeRipple {
          0% { transform: scale(1); opacity: 0.95; }
          100% { transform: scale(6); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  }

  function showBanner(text, bgColor = '#7c3aed') {
    let banner = document.getElementById('xacode-agent-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'xacode-agent-banner';
      banner.style.cssText = `
        position: fixed;
        top: 16px;
        right: 20px;
        z-index: 9999999;
        padding: 10px 18px;
        border-radius: 10px;
        color: #ffffff;
        background: #0f1017;
        border: 1px solid rgba(167, 139, 250, 0.3);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        transition: all 0.3s ease;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      document.body.appendChild(banner);
    }
    banner.style.borderLeft = `4px solid ${bgColor}`;
    banner.innerText = text;
    banner.style.opacity = '1';
    banner.style.transform = 'translateY(0)';

    setTimeout(() => {
      if (banner) {
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-10px)';
      }
    }, 3500);
  }

  async function handleVisualAction(action, params) {
    switch (action) {
      case 'scroll': {
        const amount = params.amount || 450;
        const direction = params.direction === 'up' ? -1 : 1;
        showBanner(`⚡ XaCode ИИ: Прокрутка страницы ${params.direction === 'up' ? '⬆' : '⬇'}`, '#6366f1');
        window.scrollBy({ top: amount * direction, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 600));
        return { success: true };
      }
      case 'click': {
        const el = document.querySelector(params.selector);
        if (!el) return { success: false, error: `Элемент '${params.selector}' не найден` };

        showBanner(`⚡ XaCode ИИ: Клик по '${params.selector}'`, '#a78bfa');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 300));

        moveCursorToElement(el);
        await new Promise((r) => setTimeout(r, 450));

        const rect = el.getBoundingClientRect();
        createRipple(rect.left + rect.width / 2, rect.top + rect.height / 2);

        el.click();
        await new Promise((r) => setTimeout(r, 300));
        removeCursor();
        return { success: true };
      }
      case 'type': {
        const el = document.querySelector(params.selector);
        if (!el) return { success: false, error: `Элемент '${params.selector}' не найден` };

        showBanner(`⚡ XaCode ИИ: Ввод текста в '${params.selector}'`, '#3b82f6');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 300));

        moveCursorToElement(el);
        await new Promise((r) => setTimeout(r, 400));

        el.focus();
        el.value = params.text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise((r) => setTimeout(r, 300));
        removeCursor();
        return { success: true };
      }
      case 'highlight': {
        const el = document.querySelector(params.selector);
        if (!el) return { success: false, error: `Элемент '${params.selector}' не найден` };

        showBanner(`⚡ XaCode ИИ: Анализ элемента '${params.selector}'`, '#8b5cf6');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 300));

        moveCursorToElement(el);
        await new Promise((r) => setTimeout(r, 1000));
        removeCursor();
        return { success: true };
      }
      case 'tab_switched': {
        showBanner(`⚡ XaCode ИИ: Переключение на вкладку — ${params.title || 'Активная вкладка'}`, '#10b981');
        return { success: true };
      }
      case 'navigated': {
        showBanner(`⚡ XaCode ИИ: Загрузка страницы ${params.url || ''}...`, '#3b82f6');
        return { success: true };
      }
      default:
        return { success: false, error: `Неизвестное визуальное действие: ${action}` };
    }
  }
})();
