// Background Service Worker for XaCode Chrome Bridge - Tab Switching & Live Visual Manager
let ws = null;
let isConnected = false;
const WS_URL = 'ws://127.0.0.1:9223';

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }
  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      isConnected = true;
      console.log('[XaCode Chrome Bridge] Подключено к XaCodeApp. Аутентификация...');
      chrome.storage.local.get(['xacode_token'], (res) => {
        const token = res.xacode_token || '';
        ws.send(JSON.stringify({ type: 'REGISTER', role: 'chrome-extension', token }));
      });
      chrome.storage.local.set({ status: 'connected' });
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'COMMAND') {
          const result = await handleAgentCommand(data.commandId, data.action, data.params);
          ws.send(JSON.stringify({
            type: 'COMMAND_RESULT',
            commandId: data.commandId,
            success: result.success,
            data: result.data,
            error: result.error
          }));
        }
      } catch (err) {
        console.error('[XaCode Chrome Bridge] Ошибка сообщения:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      chrome.storage.local.set({ status: 'disconnected' });
      console.log('[XaCode Chrome Bridge] Отключено. Переподключение через 2с...');
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.warn('[XaCode Chrome Bridge] Ошибка WebSocket:', err);
      ws.close();
    };
  } catch (e) {
    console.error('[XaCode Chrome Bridge] Ошибка соединения:', e);
    setTimeout(connectWebSocket, 3000);
  }
}

connectWebSocket();

// Continuous KeepAlive Heartbeat
setInterval(() => {
  if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'PING' }));
  } else if (!ws || ws.readyState === WebSocket.CLOSED) {
    connectWebSocket();
  }
}, 5000);

// Alarm для предотвращения сна Service Worker
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') connectWebSocket();
});

// Слушатель Esc от пользователя
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_INTERRUPT_ESC') {
    if (ws && isConnected && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'INTERRUPT',
        reason: 'ESC_KEY_PRESSED',
        tabId: sender.tab ? sender.tab.id : null
      }));
    }
    sendResponse({ ack: true });
  }
});

async function sendVisualBannerToTab(tabId, action, params) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'VISUAL_ACTION', action, params });
  } catch (err) {
    // Ignore if content script is not loaded yet on empty tab
  }
}

async function handleAgentCommand(commandId, action, params = {}) {
  try {
    switch (action) {
      case 'navigate': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let targetTabId = activeTab ? activeTab.id : null;
        if (activeTab) {
          await chrome.tabs.update(activeTab.id, { url: params.url });
        } else {
          const newTab = await chrome.tabs.create({ url: params.url });
          targetTabId = newTab.id;
        }
        if (targetTabId) {
          setTimeout(() => sendVisualBannerToTab(targetTabId, 'navigated', { url: params.url }), 800);
        }
        return { success: true, data: { tabId: targetTabId, url: params.url } };
      }

      case 'list_tabs': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const resultList = tabs.map((t) => ({ id: t.id, title: t.title, url: t.url, active: t.active }));
        return { success: true, data: { tabs: resultList } };
      }

      case 'switch_tab': {
        const tabId = Number(params.tabId);
        if (!tabId) return { success: false, error: 'Не указан tabId' };
        const tab = await chrome.tabs.update(tabId, { active: true });
        if (tab) {
          await sendVisualBannerToTab(tab.id, 'tab_switched', { title: tab.title });
          return { success: true, data: { tabId: tab.id, title: tab.title, url: tab.url } };
        }
        return { success: false, error: `Вкладка ${tabId} не найдена` };
      }

      case 'new_tab': {
        const url = params.url || 'chrome://newtab';
        const newTab = await chrome.tabs.create({ url, active: true });
        setTimeout(() => sendVisualBannerToTab(newTab.id, 'navigated', { url }), 600);
        return { success: true, data: { tabId: newTab.id, url: newTab.url } };
      }

      case 'close_tab': {
        const tabId = params.tabId ? Number(params.tabId) : null;
        if (tabId) {
          await chrome.tabs.remove(tabId);
        } else {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (activeTab) await chrome.tabs.remove(activeTab.id);
        }
        return { success: true };
      }

      case 'get_content': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };

        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => ({
            title: document.title,
            url: window.location.href,
            text: document.body ? document.body.innerText.substring(0, 10000) : ''
          })
        });
        return { success: true, data: result };
      }

      case 'scroll': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };
        const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'VISUAL_ACTION', action: 'scroll', params });
        return res || { success: true };
      }

      case 'click': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };
        const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'VISUAL_ACTION', action: 'click', params });
        return res || { success: true };
      }

      case 'type': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };
        const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'VISUAL_ACTION', action: 'type', params });
        return res || { success: true };
      }

      case 'highlight': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };
        const res = await chrome.tabs.sendMessage(activeTab.id, { type: 'VISUAL_ACTION', action: 'highlight', params });
        return res || { success: true };
      }

      default:
        return { success: false, error: `Неизвестная команда Chrome: ${action}` };
    }
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}
