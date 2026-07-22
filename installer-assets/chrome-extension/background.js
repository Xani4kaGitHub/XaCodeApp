// Background Service Worker for XaCode Chrome Bridge
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
      console.log('[XaCode Chrome Bridge] Подключено к XaCodeApp');
      chrome.storage.local.set({ status: 'connected' });
      ws.send(JSON.stringify({ type: 'REGISTER', role: 'chrome-extension' }));
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
        console.error('[XaCode Chrome Bridge] Ошибка обработки сообщения:', err);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      chrome.storage.local.set({ status: 'disconnected' });
      console.log('[XaCode Chrome Bridge] Отключено. Переподключение...');
      setTimeout(connectWebSocket, 2000);
    };

    ws.onerror = (err) => {
      console.warn('[XaCode Chrome Bridge] Ошибка WebSocket:', err);
      ws.close();
    };
  } catch (e) {
    console.error('[XaCode Chrome Bridge] Не удалось подключиться:', e);
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

// Alarm для предотвращения гибернации Chrome Service Worker
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    connectWebSocket();
  }
});

// Прием сигналов от content.js (нажатие Esc на вкладке)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_INTERRUPT_ESC') {
    console.warn('[XaCode Chrome Bridge] Получен сигнал прерывания Esc от пользователя!');
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

async function handleAgentCommand(commandId, action, params) {
  try {
    switch (action) {
      case 'navigate': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab) {
          await chrome.tabs.update(activeTab.id, { url: params.url });
          return { success: true, data: { tabId: activeTab.id, url: params.url } };
        } else {
          const newTab = await chrome.tabs.create({ url: params.url });
          return { success: true, data: { tabId: newTab.id, url: params.url } };
        }
      }
      case 'get_content': {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab) return { success: false, error: 'Нет активной вкладки' };
        
        const [{ result }] = await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => ({
            title: document.title,
            url: window.location.href,
            text: document.body ? document.body.innerText.substring(0, 8000) : ''
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
