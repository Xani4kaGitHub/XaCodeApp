// Content Script for XaCode Chrome Bridge - Visual Agent Actions Engine
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

  // Слушатель команд анимаций от background.js
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
        width: 24px;
        height: 24px;
        z-index: 9999999;
        pointer-events: none;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
        transform: translate(-100px, -100px);
        opacity: 0;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      cursorEl.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
        </svg>
        <span style="background: #1e1e2e; color: #60a5fa; border: 1px solid #3b82f6; font-family: system-ui; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 6px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">🤖 XaCode AI</span>
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
        border: 2px solid #3b82f6;
        background: rgba(59, 130, 246, 0.15);
        border-radius: 6px;
        box-shadow: 0 0 16px rgba(59, 130, 246, 0.6);
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

    highlight.style.top = `${rect.top + window.scrollY - 2}px`;
    highlight.style.left = `${rect.left + window.scrollX - 2}px`;
    highlight.style.width = `${rect.width + 4}px`;
    highlight.style.height = `${rect.height + 4}px`;
    highlight.style.opacity = '1';
  }

  function createRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      width: 10px;
      height: 10px;
      margin-left: -5px;
      margin-top: -5px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.8);
      z-index: 9999999;
      pointer-events: none;
      animation: xacodeRipple 0.6s ease-out forwards;
    `;
    if (!document.getElementById('xacode-ripple-style')) {
      const style = document.createElement('style');
      style.id = 'xacode-ripple-style';
      style.innerHTML = `
        @keyframes xacodeRipple {
          0% { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  function showBanner(text, bgColor = '#3b82f6') {
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
        background: #1e1e2e;
        border: 1px solid rgba(255,255,255,0.15);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
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
    }, 4000);
  }

  async function handleVisualAction(action, params) {
    switch (action) {
      case 'scroll': {
        const amount = params.amount || 400;
        const direction = params.direction === 'up' ? -1 : 1;
        showBanner(`🤖 XaCode ИИ: Прокрутка страницы (${params.direction || 'down'})`, '#3b82f6');
        window.scrollBy({ top: amount * direction, behavior: 'smooth' });
        await new Promise((r) => setTimeout(r, 600));
        return { success: true };
      }
      case 'click': {
        const el = document.querySelector(params.selector);
        if (!el) return { success: false, error: `Элемент '${params.selector}' не найден на странице` };

        showBanner(`🤖 XaCode ИИ: Клик по элементу '${params.selector}'`, '#3b82f6');
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
        if (!el) return { success: false, error: `Элемент '${params.selector}' не найден на странице` };

        showBanner(`🤖 XaCode ИИ: Ввод текста в '${params.selector}'`, '#3b82f6');
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

        showBanner(`🤖 XaCode ИИ: Анализ элемента '${params.selector}'`, '#8b5cf6');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((r) => setTimeout(r, 300));

        moveCursorToElement(el);
        await new Promise((r) => setTimeout(r, 1000));
        removeCursor();
        return { success: true };
      }
      default:
        return { success: false, error: `Неизвестное визуальное действие: ${action}` };
    }
  }
})();
