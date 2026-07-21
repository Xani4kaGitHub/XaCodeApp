const { contextBridge } = require('electron');

const now = new Date().toISOString();
const workspace = String.raw`C:\Users\bogda\Documents\XaCode Projects\silent-otter`;
const conversations = [{
  id: 'visual-chat',
  title: 'Создать Python-скрипт',
  workspace,
  createdAt: now,
  updatedAt: now,
  pinned: false,
  messages: [
    { id: 'u1', role: 'user', content: 'Создай небольшой Python-скрипт для сортировки файлов.', createdAt: now },
    { id: 's1', role: 'status', content: '🚀 *Task Started:*\n`Создать Python-скрипт`\n\n🔍 *Analyzing...*', createdAt: now },
    { id: 's2', role: 'status', content: '🛠 *Executing Tool:* `runcommand`\n```json\n{"command":"python sorter.py --check"}\n```', createdAt: now },
    { id: 's3', role: 'reasoning', content: 'Проверяю структуру папки и готовлю безопасный вариант скрипта.', createdAt: now },
  ],
}];
let agentChoiceCallback = null;
let lastChoice = '';

contextBridge.exposeInMainWorld('xacode', {
  __testWorkspace: () => workspace,
  bootstrap: async () => ({ settings: { provider: 'deepseek', apiKey: 'demo', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', fullAccess: false, showReasoning: true, activeProfileId: 'demo', modelProfiles: [{ id: 'demo', name: 'DeepSeek Flash', provider: 'deepseek', apiKey: 'demo', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash', maxContextTokens: 32000, showReasoning: true }], permissionDefaults: { sandboxMode: 'workspace', terminal: 'ask', fileRead: 'allow', fileWrite: 'ask', network: 'ask', allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [] }, projectPermissions: {} }, conversations, workspace, tools: [{ name: 'read_file', description: 'Read files', required: false }, { name: 'docker', description: 'Docker operations', required: false }, { name: 'finish_task', description: 'Finish a task', required: true }] }),
  getWorkspaceLaunchers: async () => [{ id: 'explorer', label: 'Проводник', icon: '' }, { id: 'terminal', label: 'Терминал', icon: '' }],
  saveConversations: async () => true,
  saveSettings: async (value) => value,
  selectWorkspace: async () => workspace,
  createWorkspace: async () => `${workspace}\\.xacode_project\\silent-otter`,
  selectFiles: async () => [],
  openPath: async () => '',
  openWorkspaceWith: async () => '',
  chooseWorkspaceApp: async () => '',
  pasteClipboardImage: async () => String.raw`C:\Temp\clipboard-image.png`,
  sendMessage: async () => ({ ok: true }),
  stopAgent: async () => true,
  answerChoice: async (_requestId, choice) => { lastChoice = choice; return true; },
  windowAction: async () => true,
  zoomAction: async () => 1,
  onAgentUpdate: () => () => {},
  onAgentContext: () => () => {},
  onAgentChoice: (callback) => { agentChoiceCallback = callback; return () => {}; },
  onShortcut: () => () => {},
  __testTriggerChoice: (payload) => agentChoiceCallback?.(payload),
  __testLastChoice: () => lastChoice,
});
