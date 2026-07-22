import { chromeServerBridge } from './chromeServer';

export async function chromeNavigate(url: string, signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('navigate', { url }, signal);
}

export async function chromeGetContent(signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('get_content', {}, signal);
}

export async function chromeClick(selector: string, signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('click', { selector }, signal);
}

export async function chromeType(selector: string, text: string, signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('type', { selector, text }, signal);
}

export async function chromeScroll(direction: 'down' | 'up' = 'down', amount = 400, signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('scroll', { direction, amount }, signal);
}

export async function chromeHighlight(selector: string, signal?: AbortSignal) {
  return await chromeServerBridge.sendCommand('highlight', { selector }, signal);
}

export function chromeStatus() {
  return {
    connected: chromeServerBridge.isExtensionConnected(),
    serverUrl: 'ws://127.0.0.1:9223'
  };
}
