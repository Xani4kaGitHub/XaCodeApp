import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn } from 'child_process';
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { config, validateDesktopConfig } from '../config';
import { refreshLLMProvider } from '../llm/Provider';
import { permissionSystem } from '../security/PermissionSystem';
import { securityManager } from '../security';
import { interactionEmitter } from '../events/interaction';
import { DesktopStore } from './store';
import { DesktopSettings } from './types';
import { getToolCatalog } from '../tools';
import { workspaceStatePath, xacodePath } from '../config/paths';

let mainWindow: BrowserWindow | null = null;
const store = new DesktopStore();
const sessions = new Map<string, any>();
let activeWorkspace = '';
const PROJECT_ADJECTIVES = ['bright', 'calm', 'clever', 'cosmic', 'crisp', 'gentle', 'lucky', 'rapid', 'silent', 'vivid'];
const PROJECT_NOUNS = ['badger', 'falcon', 'forest', 'harbor', 'meteor', 'otter', 'pixel', 'rocket', 'studio', 'willow'];

function projectsRoot() {
  return xacodePath('workspaces');
}

function createWorkspaceFolder() {
  const root = projectsRoot();
  fs.mkdirSync(root, { recursive: true });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const adjective = PROJECT_ADJECTIVES[Math.floor(Math.random() * PROJECT_ADJECTIVES.length)];
    const noun = PROJECT_NOUNS[Math.floor(Math.random() * PROJECT_NOUNS.length)];
    const suffix = attempt > 12 ? `-${Math.floor(10 + Math.random() * 90)}` : '';
    const candidate = path.join(root, `${adjective}-${noun}${suffix}`);
    if (!fs.existsSync(candidate)) {
      fs.mkdirSync(candidate, { recursive: false });
      return candidate;
    }
  }
  const fallback = path.join(root, `project-${Date.now()}`);
  fs.mkdirSync(fallback, { recursive: false });
  return fallback;
}
function ensureInitialWorkspace() {
  const recent = store.getConversations().find((conversation) => conversation.workspace && fs.existsSync(conversation.workspace));
  if (recent) return recent.workspace;
  return '';
}

function gitBashPath() {
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'git-bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'git-bash.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function terminalPath() {
  const candidate = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'wt.exe');
  return fs.existsSync(candidate) ? candidate : '';
}

async function workspaceLaunchers() {
  const specs = [
    { id: 'explorer', label: 'Проводник', executable: path.join(process.env.WINDIR || 'C:\\Windows', 'explorer.exe') },
    { id: 'terminal', label: 'Терминал', executable: terminalPath() },
    { id: 'git-bash', label: 'Git Bash', executable: gitBashPath() },
  ].filter((item) => item.id === 'explorer' || Boolean(item.executable));
  return Promise.all(specs.map(async (item) => {
    let icon = '';
    try { icon = (await app.getFileIcon(item.executable, { size: 'small' })).toDataURL(); } catch {}
    return { id: item.id, label: item.label, icon };
  }));
}

function launchDetached(executable: string, args: string[], cwd?: string) {
  return new Promise<string>((resolve) => {
    let settled = false;
    const child = spawn(executable, args, { cwd, detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', (error) => { if (!settled) { settled = true; resolve(`Не удалось открыть приложение: ${error.message}`); } });
    child.once('spawn', () => { if (!settled) { settled = true; child.unref(); resolve(''); } });
  });
}

function applySettings(settings: DesktopSettings, workspace = activeWorkspace) {
  const profile = settings.modelProfiles.find((item) => item.id === settings.activeProfileId) || settings.modelProfiles[0];
  const selectedProvider = profile?.provider || settings.provider;
  config.LLM_PROVIDER = selectedProvider === 'anthropic' ? 'anthropic' : 'openai';
  config.DEEPSEEK_API_KEY = profile?.apiKey || settings.apiKey;
  config.ANTHROPIC_API_KEY = profile?.apiKey || settings.apiKey;
  config.DEEPSEEK_BASE_URL = profile?.baseUrl || settings.baseUrl;
  config.ANTHROPIC_BASE_URL = profile?.baseUrl || settings.baseUrl;
  config.DEEPSEEK_MODEL = profile?.model || settings.model;
  config.MAX_CONTEXT_TOKENS = profile?.maxContextTokens || 32000;
  config.SHOW_REASONING = profile?.showReasoning ?? settings.showReasoning;
  const projectPolicy = settings.projectPermissions[workspace] || {
    sandboxMode: 'workspace', terminal: 'ask', fileRead: 'allow', fileWrite: 'ask', network: 'ask',
    allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [],
  };
  const sandboxRoot = projectPolicy.sandboxMode === 'strict' ? workspaceStatePath(workspace, 'sandbox') : workspace;
  if (sandboxRoot) fs.mkdirSync(sandboxRoot, { recursive: true });
  config.SANDBOX_DIR = sandboxRoot;
  securityManager.setSandboxDir(sandboxRoot);
  config.ALWAYS_FULL_ACCESS = projectPolicy.sandboxMode === 'full';
  permissionSystem.configure(workspace, settings.permissionDefaults, projectPolicy, (scope, policy) => {
    const latest = store.getSettings();
    if (scope === 'global') {
      latest.permissionDefaults = policy;
      const globalRules = new Set(policy.allowedCommands);
      for (const local of Object.values(latest.projectPermissions)) local.allowedCommands = local.allowedCommands.filter((rule) => !globalRules.has(rule));
    }
    else latest.projectPermissions[workspace] = policy;
    store.saveSettings(latest);
  });
  refreshLLMProvider();
}

function numericSessionId(id: string) {
  let hash = 0;
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) || 1;
}

function getSession(conversationId: string, currentText = '') {
  if (!sessions.has(conversationId)) {
    const { AgentSession } = require('../agent');
    const session = new AgentSession(numericSessionId(conversationId));
    const conversation = store.getConversations().find((item) => item.id === conversationId);
    const history = (conversation?.messages || []).filter((message) => message.role === 'user' || message.role === 'assistant').map((message) => ({ role: message.role, content: message.content }));
    const lastHistory = history[history.length - 1];
    if (lastHistory?.role === 'user' && lastHistory?.content === currentText) history.pop();
    session.restoreConversation(history, conversation?.compressionCount || 0, conversation?.contextUsage || 0);
    sessions.set(conversationId, session);
  }
  return sessions.get(conversationId);
}

function rendererPath() {
  return path.join(__dirname, '../../src/desktop/renderer/index.html');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, '../../xacode.png'),
    width: 1400,
    height: 860,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#0d0e10',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#121315', symbolColor: '#aeb3bb', height: 34 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(rendererPath());
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'b') {
      event.preventDefault();
      mainWindow?.webContents.send('ui:shortcut', 'toggle-sidebar');
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', () => ({
    settings: store.getSettings(),
    conversations: store.getConversations(),
    workspace: activeWorkspace,
    platform: process.platform,
    osRelease: os.release(),
    arch: process.arch,
    homeDir: xacodePath(),
    tools: getToolCatalog(),
  }));

  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Выберите рабочую папку',
      defaultPath: activeWorkspace,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    activeWorkspace = result.filePaths[0];
    return activeWorkspace;
  });

  ipcMain.handle('workspace:create', () => {
    activeWorkspace = createWorkspaceFolder();
    return activeWorkspace;
  });

  ipcMain.handle('workspace:launchers', () => workspaceLaunchers());

  ipcMain.handle('workspace:search-files', async (_event, payload: { workspace: string; query: string }) => {
    const targetWs = payload?.workspace || activeWorkspace;
    if (!targetWs) return [];
    const query = payload?.query || '';
    const results: string[] = [];
    const searchRecursively = async (dir: string) => {
      if (results.length >= 100) return;
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (results.length >= 100) break;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(targetWs, fullPath).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'build', '.xacode'].includes(entry.name)) continue;
            if (!query || relPath.toLowerCase().includes(query.toLowerCase()) || entry.name.toLowerCase().includes(query.toLowerCase())) {
              results.push(relPath + '/');
            }
            await searchRecursively(fullPath);
          } else {
            if (!query || relPath.toLowerCase().includes(query.toLowerCase()) || entry.name.toLowerCase().includes(query.toLowerCase())) {
              results.push(relPath);
            }
          }
        }
      } catch (err) {}
    };
    await searchRecursively(targetWs);
    return results;
  });

  ipcMain.handle('workspace:open-with', async (_event, payload: { targetPath: string; launcher: string }) => {
    const targetPath = payload?.targetPath;
    if (!targetPath || !path.isAbsolute(targetPath) || !fs.existsSync(targetPath)) return 'Папка проекта не найдена';
    if (payload.launcher === 'explorer') return shell.openPath(targetPath);
    if (payload.launcher === 'terminal') return launchDetached('wt.exe', ['-d', targetPath]);
    if (payload.launcher === 'git-bash') {
      const executable = gitBashPath();
      if (!executable) return 'Git Bash не найден в системе';
      return launchDetached(executable, [], targetPath);
    }
    return 'Неизвестное приложение';
  });

  ipcMain.handle('workspace:choose-app', async (_event, targetPath: string) => {
    if (!targetPath || !path.isAbsolute(targetPath) || !fs.existsSync(targetPath)) return 'Папка проекта не найдена';
    const result = await dialog.showOpenDialog(mainWindow!, { title: 'Выберите приложение', defaultPath: process.env.ProgramFiles || 'C:\\Program Files', properties: ['openFile'], filters: [{ name: 'Приложения Windows', extensions: ['exe', 'cmd', 'bat', 'com'] }, { name: 'Все файлы', extensions: ['*'] }] });
    if (result.canceled || !result.filePaths[0]) return '';
    return launchDetached(result.filePaths[0], [targetPath], targetPath);
  });

  ipcMain.handle('clipboard:paste-image', () => {
    const image = clipboard.readImage();
    if (image.isEmpty()) return '';
    const outputDir = xacodePath('temp', 'clipboard');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `image-${Date.now()}.png`);
    fs.writeFileSync(outputPath, image.toPNG());
    return outputPath;
  });

  ipcMain.handle('files:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Выберите файлы для контекста',
      defaultPath: activeWorkspace,
      properties: ['openFile', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
    if (!targetPath || !path.isAbsolute(targetPath)) return 'Некорректный путь';
    return shell.openPath(targetPath);
  });

  ipcMain.handle('settings:save', (_event, settings: DesktopSettings) => {
    const saved = store.saveSettings(settings);
    applySettings(saved);
    return { ...saved, apiKey: saved.apiKey ? '••••••••' : '' };
  });

  ipcMain.handle('conversations:save', (_event, conversations) => {
    store.saveConversations(conversations);
    return true;
  });

  ipcMain.handle('agent:send', async (_event, payload: { conversationId: string; text: string; workspace?: string }) => {
    const workspace = payload.workspace || activeWorkspace;
    if (!fs.existsSync(workspace)) throw new Error('Рабочая папка больше не существует.');
    activeWorkspace = workspace;
    process.chdir(workspace);
    applySettings(store.getSettings(), workspace);
    validateDesktopConfig();
    const session = getSession(payload.conversationId, payload.text);
    await session.handleTask(payload.text, async (content: string) => {
      mainWindow?.webContents.send('agent:update', { conversationId: payload.conversationId, content, context: session.getContextStats() });
    });
    mainWindow?.webContents.send('agent:context', { conversationId: payload.conversationId, context: session.getContextStats() });
    return { ok: true };
  });

  ipcMain.handle('agent:stop', (_event, conversationId: string) => {
    sessions.get(conversationId)?.stop();
    return true;
  });

  ipcMain.handle('agent:answer-choice', (_event, { requestId, choice }) => {
    interactionEmitter.emit(`choice_response_${requestId}`, choice);
    return true;
  });

  ipcMain.handle('window:action', (_event, action: string) => {
    if (action === 'minimize') mainWindow?.minimize();
    if (action === 'maximize') mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
    if (action === 'close') mainWindow?.close();
  });

  ipcMain.handle('view:zoom', (_event, action: string) => {
    if (!mainWindow) return 1;
    const current = mainWindow.webContents.getZoomFactor();
    const next = action === 'in' ? Math.min(1.5, current + 0.1)
      : action === 'out' ? Math.max(0.7, current - 0.1)
      : 1;
    mainWindow.webContents.setZoomFactor(next);
    return next;
  });

  interactionEmitter.on('ask_choice', ({ chatId, requestId, question, options }) => {
    mainWindow?.webContents.send('agent:choice', { chatId, requestId, question, options });
  });
}

app.whenReady().then(() => {
  activeWorkspace = ensureInitialWorkspace();
  applySettings(store.getSettings());
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const session of sessions.values()) session.destroy?.();
  if (process.platform !== 'darwin') app.quit();
});
