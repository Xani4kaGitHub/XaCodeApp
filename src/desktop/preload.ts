import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('xacode', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  createWorkspace: () => ipcRenderer.invoke('workspace:create'),
  getWorkspaceLaunchers: () => ipcRenderer.invoke('workspace:launchers'),
  openWorkspaceWith: (targetPath: string, launcher: string) => ipcRenderer.invoke('workspace:open-with', { targetPath, launcher }),
  chooseWorkspaceApp: (targetPath: string) => ipcRenderer.invoke('workspace:choose-app', targetPath),
  pasteClipboardImage: () => ipcRenderer.invoke('clipboard:paste-image'),
  getFilePreview: (targetPath: string) => ipcRenderer.invoke('file:preview', targetPath),
  getDroppedFilePath: (file: File) => webUtils.getPathForFile(file),
  selectFiles: () => ipcRenderer.invoke('files:select'),
  searchFiles: (payload: { workspace: string; query: string }) => ipcRenderer.invoke('workspace:search-files', payload),
  openPath: (targetPath: string) => ipcRenderer.invoke('shell:open-path', targetPath),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  saveConversations: (conversations: unknown) => ipcRenderer.invoke('conversations:save', conversations),
  showNotification: (payload: unknown) => ipcRenderer.invoke('notification:show', payload),
  sendMessage: (payload: unknown) => ipcRenderer.invoke('agent:send', payload),
  stopAgent: (conversationId: string) => ipcRenderer.invoke('agent:stop', conversationId),
  answerChoice: (requestId: string, choice: string) => ipcRenderer.invoke('agent:answer-choice', { requestId, choice }),
  windowAction: (action: string) => ipcRenderer.invoke('window:action', action),
  zoomAction: (action: string) => ipcRenderer.invoke('view:zoom', action),
  onAgentUpdate: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('agent:update', listener);
    return () => ipcRenderer.removeListener('agent:update', listener);
  },
  onAgentContext: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('agent:context', listener);
    return () => ipcRenderer.removeListener('agent:context', listener);
  },
  onAgentChoice: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on('agent:choice', listener);
    return () => ipcRenderer.removeListener('agent:choice', listener);
  },
  onShortcut: (callback: (shortcut: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, shortcut: string) => callback(shortcut);
    ipcRenderer.on('ui:shortcut', listener);
    return () => ipcRenderer.removeListener('ui:shortcut', listener);
  },
  onNotificationOpen: (callback: (conversationId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, conversationId: string) => callback(conversationId);
    ipcRenderer.on('notification:open-conversation', listener);
    return () => ipcRenderer.removeListener('notification:open-conversation', listener);
  },
});
