import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, spawnSync } from 'child_process';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { config, validateDesktopConfig } from '../config';
import { createLLMProvider, refreshLLMProvider } from '../llm/Provider';
import { permissionSystem } from '../security/PermissionSystem';
import { securityManager } from '../security';
import { interactionEmitter } from '../events/interaction';
import { DesktopStore } from './store';
import { DesktopSettings } from './types';
import { getToolCatalog } from '../tools';
import { workspaceStatePath, xacodePath } from '../config/paths';

let mainWindow: BrowserWindow | null = null;
type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'latest' | 'error' | 'development';
type UpdateState = { status: UpdateStatus; currentVersion: string; availableVersion?: string; percent?: number; message?: string };
let updateState: UpdateState = { status: 'idle', currentVersion: app.getVersion() };
let updateDownloadStarted = false;
let lastNotificationConversationId = '';
const APP_USER_MODEL_ID = 'com.xanichka.xacode';
const TOAST_ACTIVATOR_CLSID = '{A4E9EB8A-9C31-4BD9-94D5-1F42E0A21C11}';
app.setName('XaCode');
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  app.setToastActivatorCLSID(TOAST_ACTIVATOR_CLSID);
}
const store = new DesktopStore();
const sessions = new Map<string, any>();
const sessionProfileIds = new Map<string, string>();
const sessionsPendingRefresh = new Set<string>();
const numericConversationIds = new Map<number, string>();
let activeWorkspace = '';
const PROJECT_ADJECTIVES = ['bright', 'calm', 'clever', 'cosmic', 'crisp', 'gentle', 'lucky', 'rapid', 'silent', 'vivid'];
const PROJECT_NOUNS = ['badger', 'falcon', 'forest', 'harbor', 'meteor', 'otter', 'pixel', 'rocket', 'studio', 'willow'];

function ensureWindowsNotificationShortcut() {
  if (process.platform !== 'win32') return true;
  const shortcutDirectory = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  const shortcutPath = path.join(shortcutDirectory, 'XaCode.lnk');
  const legacyShortcutPath = path.join(shortcutDirectory, 'Electron.lnk');
  const iconPath = app.isPackaged ? process.execPath : path.join(app.getAppPath(), 'installer-assets', 'xacode.ico');
  fs.mkdirSync(path.dirname(shortcutPath), { recursive: true });

  // Older development runs could create Electron.lnk with XaCode's AUMID but
  // without the required path-to-app argument. Windows then grouped XaCode as
  // Electron and notification clicks launched Electron's empty welcome page.
  if (fs.existsSync(legacyShortcutPath)) {
    try {
      const legacy = shell.readShortcutLink(legacyShortcutPath);
      const isXaCodeLegacyShortcut = legacy.appUserModelId === APP_USER_MODEL_ID
        && path.basename(legacy.target).toLowerCase() === 'electron.exe';
      if (isXaCodeLegacyShortcut) {
        const backupDirectory = xacodePath('backups', 'windows-shortcuts');
        fs.mkdirSync(backupDirectory, { recursive: true });
        fs.copyFileSync(legacyShortcutPath, path.join(backupDirectory, 'Electron-legacy.lnk'));
        const legacyClsid = String(legacy.toastActivatorClsid || '');
        if (/^\{[0-9a-f-]{36}\}$/i.test(legacyClsid) && legacyClsid !== TOAST_ACTIVATOR_CLSID) {
          const registryKey = `HKCU\\Software\\Classes\\CLSID\\${legacyClsid}`;
          spawnSync('reg.exe', ['export', registryKey, path.join(backupDirectory, 'Electron-toast-activator.reg'), '/y'], { windowsHide: true });
          spawnSync('reg.exe', ['delete', registryKey, '/f'], { windowsHide: true });
        }
        fs.unlinkSync(legacyShortcutPath);
      }
    } catch (error) {
      console.warn('Could not migrate the legacy Electron notification shortcut:', error);
    }
  }

  return shell.writeShortcutLink(shortcutPath, 'create', {
    target: process.execPath,
    cwd: app.getAppPath(),
    args: app.isPackaged ? '' : `"${app.getAppPath()}"`,
    description: 'XaCode — локальный AI coding agent',
    icon: fs.existsSync(iconPath) ? iconPath : process.execPath,
    iconIndex: 0,
    appUserModelId: APP_USER_MODEL_ID,
    toastActivatorClsid: TOAST_ACTIVATOR_CLSID,
  });
}

function openNotificationConversation(conversationId = lastNotificationConversationId) {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (!conversationId) return;
  const send = () => mainWindow?.webContents.send('notification:open-conversation', conversationId);
  if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
  else send();
}

function publishUpdateState(patch: Partial<UpdateState>) {
  updateState = { ...updateState, ...patch, currentVersion: app.getVersion() };
  mainWindow?.webContents.send('app:update-status', updateState);
  return updateState;
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => publishUpdateState({ status: 'checking', message: undefined, percent: undefined }));
  autoUpdater.on('update-available', (info) => publishUpdateState({ status: 'available', availableVersion: info.version, message: undefined, percent: undefined }));
  autoUpdater.on('update-not-available', () => publishUpdateState({ status: 'latest', availableVersion: undefined, message: undefined, percent: undefined }));
  autoUpdater.on('download-progress', (progress) => publishUpdateState({ status: 'downloading', percent: Math.round(progress.percent), message: undefined }));
  autoUpdater.on('update-downloaded', (info) => publishUpdateState({ status: 'downloaded', availableVersion: info.version, percent: 100, message: undefined }));
  autoUpdater.on('error', (error) => {
    updateDownloadStarted = false;
    publishUpdateState({ status: 'error', message: error?.message || 'Не удалось проверить обновления.', percent: undefined });
  });
}

async function checkForUpdates() {
  if (!app.isPackaged) return publishUpdateState({ status: 'development', message: 'Проверка обновлений доступна в установленной версии.' });
  if (updateState.status === 'checking' || updateState.status === 'downloading') return updateState;
  try {
    publishUpdateState({ status: 'checking', message: undefined, percent: undefined });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    publishUpdateState({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось проверить обновления.' });
  }
  return updateState;
}

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

function applySettings(settings: DesktopSettings, workspace = activeWorkspace, modelProfileId = settings.activeProfileId) {
  const profile = settings.modelProfiles.find((item) => item.id === modelProfileId) || settings.modelProfiles.find((item) => item.id === settings.activeProfileId) || settings.modelProfiles[0];
  const selectedProvider = profile?.provider || settings.provider;
  config.LLM_PROVIDER = selectedProvider === 'anthropic' ? 'anthropic' : 'openai';
  config.DEEPSEEK_API_KEY = profile?.apiKey || settings.apiKey;
  config.ANTHROPIC_API_KEY = profile?.apiKey || settings.apiKey;
  config.DEEPSEEK_BASE_URL = profile?.baseUrl || settings.baseUrl;
  config.ANTHROPIC_BASE_URL = profile?.baseUrl || settings.baseUrl;
  config.DEEPSEEK_MODEL = profile?.model || settings.model;
  config.MAX_CONTEXT_TOKENS = profile?.maxContextTokens || 32000;
  config.SHOW_REASONING = profile?.showReasoning ?? settings.showReasoning;
  const instructionProfile = settings.instructionProfiles?.find((item) => item.id === settings.activeInstructionProfileId);
  config.CUSTOM_INSTRUCTIONS = settings.customInstructionsEnabled ? String(instructionProfile?.prompt || '').trim() : '';
  config.TEMPERATURE_ENABLED = Boolean(settings.temperatureEnabled);
  config.TEMPERATURE = Math.max(0, Math.min(2, Number(settings.temperature ?? 0.7)));
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

function getSession(conversationId: string, currentText = '', requestedProfileId = '') {
  numericConversationIds.set(numericSessionId(conversationId), conversationId);
  const settings = store.getSettings();
  const profile = settings.modelProfiles.find((item) => item.id === requestedProfileId)
    || settings.modelProfiles.find((item) => item.id === settings.activeProfileId)
    || settings.modelProfiles[0];
  if (sessions.has(conversationId) && sessionProfileIds.get(conversationId) !== profile.id) {
    sessions.get(conversationId)?.destroy();
    sessions.delete(conversationId);
    sessionProfileIds.delete(conversationId);
  }
  if (!sessions.has(conversationId)) {
    const { AgentSession } = require('../agent');
    const selectedProvider = profile.provider === 'anthropic' ? 'anthropic' : 'openai';
    const provider = createLLMProvider(selectedProvider, {
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      model: profile.model,
      maxContextTokens: profile.maxContextTokens || 32000,
      temperatureEnabled: Boolean(settings.temperatureEnabled),
      temperature: Math.max(0, Math.min(2, Number(settings.temperature ?? 0.7))),
    });
    const session = new AgentSession(numericSessionId(conversationId), provider);
    const conversation = store.getConversations().find((item) => item.id === conversationId);
    const history = (conversation?.messages || []).filter((message) => message.role === 'user' || message.role === 'assistant').map((message) => ({ role: message.role, content: message.content }));
    const lastHistory = history[history.length - 1];
    if (lastHistory?.role === 'user' && lastHistory?.content === currentText) history.pop();
    session.restoreConversation(history, conversation?.compressionCount || 0, conversation?.contextUsage || 0);
    sessions.set(conversationId, session);
    sessionProfileIds.set(conversationId, profile.id);
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
    appVersion: app.getVersion(),
    updateState,
  }));

  ipcMain.handle('app:update-check', () => checkForUpdates());
  ipcMain.handle('app:update-download', async () => {
    if (!app.isPackaged) return publishUpdateState({ status: 'development', message: 'Загрузка обновлений доступна в установленной версии.' });
    if (updateState.status !== 'available' || updateDownloadStarted) return updateState;
    updateDownloadStarted = true;
    publishUpdateState({ status: 'downloading', percent: 0, message: undefined });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      updateDownloadStarted = false;
      publishUpdateState({ status: 'error', message: error instanceof Error ? error.message : 'Не удалось загрузить обновление.' });
    }
    return updateState;
  });
  ipcMain.handle('app:update-install', () => {
    if (updateState.status !== 'downloaded') return false;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  });

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

  ipcMain.handle('file:preview', (_event, targetPath: string) => {
    if (!targetPath || !path.isAbsolute(targetPath) || !fs.existsSync(targetPath)) return '';
    const mimeTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
    const mimeType = mimeTypes[path.extname(targetPath).toLowerCase()];
    if (!mimeType) return '';
    const stats = fs.statSync(targetPath);
    if (!stats.isFile() || stats.size > 15 * 1024 * 1024) return '';
    return `data:${mimeType};base64,${fs.readFileSync(targetPath).toString('base64')}`;
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
    for (const [conversationId, session] of sessions) {
      if (session.isExecuting) {
        sessionsPendingRefresh.add(conversationId);
        continue;
      }
      session.destroy();
      sessions.delete(conversationId);
      sessionProfileIds.delete(conversationId);
    }
    return { ...saved, apiKey: saved.apiKey ? '••••••••' : '' };
  });

  ipcMain.handle('conversations:save', (_event, conversations) => {
    store.saveConversations(conversations);
    return true;
  });

  ipcMain.handle('notification:show', (_event, payload: { title?: string; body?: string; conversationId?: string }) => {
    if (!Notification.isSupported()) return false;
    lastNotificationConversationId = String(payload?.conversationId || '');
    const notification = new Notification({
      id: lastNotificationConversationId ? `xacode-${lastNotificationConversationId}` : undefined,
      title: String(payload?.title || 'XaCode').slice(0, 80),
      body: String(payload?.body || '').slice(0, 220),
      icon: path.join(__dirname, '../../xacode.png'),
    });
    notification.on('click', () => openNotificationConversation(payload?.conversationId));
    notification.show();
    return true;
  });

  ipcMain.handle('agent:send', async (_event, payload: { conversationId: string; text: string; workspace?: string; modelProfileId?: string }) => {
    const workspace = payload.workspace || activeWorkspace;
    if (!fs.existsSync(workspace)) throw new Error('Рабочая папка больше не существует.');
    activeWorkspace = workspace;
    process.chdir(workspace);
    applySettings(store.getSettings(), workspace, payload.modelProfileId);
    validateDesktopConfig();
    const session = getSession(payload.conversationId, payload.text, payload.modelProfileId);
    try {
      await session.handleTask(payload.text, async (content: string) => {
        mainWindow?.webContents.send('agent:update', { conversationId: payload.conversationId, content, context: session.getContextStats() });
      });
      mainWindow?.webContents.send('agent:context', { conversationId: payload.conversationId, context: session.getContextStats() });
    } finally {
      if (sessionsPendingRefresh.delete(payload.conversationId)) {
        session.destroy();
        sessions.delete(payload.conversationId);
        sessionProfileIds.delete(payload.conversationId);
      }
    }
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
    const conversationId = numericConversationIds.get(Number(chatId));
    mainWindow?.webContents.send('agent:choice', { chatId, conversationId, requestId, question, options });
  });
}

app.whenReady().then(() => {
  ensureWindowsNotificationShortcut();
  if (process.platform === 'win32') Notification.handleActivation(() => openNotificationConversation());
  configureAutoUpdater();
  activeWorkspace = ensureInitialWorkspace();
  applySettings(store.getSettings());
  registerIpc();
  createWindow();
  setTimeout(() => { void checkForUpdates(); }, 5000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  for (const session of sessions.values()) session.destroy?.();
  if (process.platform !== 'darwin') app.quit();
});
