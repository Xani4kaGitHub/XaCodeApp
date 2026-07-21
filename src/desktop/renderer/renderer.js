const api = window.xacode;
const $ = (selector) => document.querySelector(selector);

function readLocalJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    const valid = Array.isArray(fallback)
      ? Array.isArray(value)
      : fallback && typeof fallback === 'object'
        ? Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        : typeof value === typeof fallback;
    return valid ? value : fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

const state = {
  settings: null,
  conversations: [],
  activeId: null,
  workspace: '',
  running: false,
  pendingChoiceId: null,
  settingsPage: 'general',
  view: 'conversation',
  navigation: ['conversation'],
  navigationIndex: 0,
  historyStatuses: { running: true, complete: true, archived: true },
  attachments: [],
  sidebarWidth: Number(localStorage.getItem('xacode.sidebarWidth')) || 314,
  sidebarWidthBeforeCollapse: Number(localStorage.getItem('xacode.sidebarWidth')) || 314,
  resizingSidebar: false,
  workspaceLaunchers: [],
  availableTools: [],
  showAllProjects: false,
  projectAliases: readLocalJson('xacode.projectAliases', {}),
  collapsedProjects: readLocalJson('xacode.collapsedProjects', {}),
  pinnedProjects: readLocalJson('xacode.pinnedProjects', []),
  hoverTimer: null,
  confirmResolve: null,
  editingProfileId: null,
  settingsSnapshot: null,
};

const slashCommands = [
  { id: 'btw', icon: 'ph-chat-teardrop-dots', description: 'Быстрый вопрос без изменения основной задачи' },
  { id: 'goal', icon: 'ph-target', description: 'Работать, пока указанная цель не будет завершена' },
  { id: 'browser', icon: 'ph-globe', description: 'Поручить агенту задачу для браузера' },
  { id: 'grill-me', icon: 'ph-chats-circle', description: 'Провести подробное интервью по плану или идее' },
  { id: 'teamwork-preview', icon: 'ph-tree-structure', description: 'Разбить большую задачу между несколькими ролями' },
  { id: 'learn', icon: 'ph-lightbulb', description: 'Извлечь полезное правило из результата или исправления' },
];

const LOCAL_PROJECT_PERMISSIONS = { sandboxMode: 'workspace', terminal: 'ask', fileRead: 'allow', fileWrite: 'ask', network: 'ask', allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [] };
const MODEL_PROVIDERS = {
  deepseek: { label: 'DeepSeek', icon: 'ri:deepseek-fill', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'] },
  openai: { label: 'OpenAI', icon: 'arcticons:openai-chatgpt', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1', models: ['gpt-4.1', 'gpt-4.1-mini', 'o3'] },
  anthropic: { label: 'Anthropic', icon: 'ri:claude-line', baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-5', models: ['claude-sonnet-4-5', 'claude-opus-4-1'] },
  google: { label: 'Google Gemini', icon: 'ri:google-fill', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.5-pro', models: ['gemini-2.5-pro', 'gemini-2.5-flash'] },
  openrouter: { label: 'OpenRouter', icon: 'ph-git-branch', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4.1', models: ['openai/gpt-4.1', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-pro'] },
  ollama: { label: 'Ollama', icon: 'simple-icons:ollama', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen3-coder', models: ['qwen3-coder', 'llama3.3', 'gemma3'] },
  custom: { label: 'Свой API', icon: 'ph-plugs-connected', baseUrl: '', model: '', models: [] },
};
function providerMeta(provider) { return MODEL_PROVIDERS[provider] || MODEL_PROVIDERS.custom; }

function renderIcon(iconClass) {
  if (iconClass.includes(':')) return `<iconify-icon icon="${iconClass}"></iconify-icon>`;
  return `<i class="ph-bold ${iconClass}"></i>`;
}

const commandDefinitions = [
  { id: 'new-chat', label: 'Новый чат', icon: 'ph-chat-circle-dots', shortcut: 'Ctrl+N' },
  { id: 'choose-folder', label: 'Открыть проект', icon: 'ph-folder-plus' },
  { id: 'history', label: 'История чатов', icon: 'ph-clock-counter-clockwise' },
  { id: 'toggle-sidebar', label: 'Переключить боковую панель', icon: 'ph-sidebar-simple', shortcut: 'Ctrl+B' },
  { id: 'settings', label: 'Открыть настройки', icon: 'ph-gear-six', shortcut: 'Ctrl+,' },
];

function id(prefix = 'id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function activeConversation() { return state.conversations.find((item) => item.id === state.activeId); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function folderName(value) { return value?.split(/[\\/]/).filter(Boolean).pop() || 'XaCode'; }
function shortPath(value) {
  if (!value) return 'Выбрать папку проекта';
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.length > 4 ? `…\\${parts.slice(-4).join('\\')}` : value;
}
function formatAge(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${Math.max(1, minutes)}м`;
  const days = Math.floor(minutes / 1440);
  return days < 1 ? `${Math.floor(minutes / 60)}ч` : `${days}д`;
}
function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');
}
function simpleMarkdown(value) {
  const codeBlocks = [];
  const source = String(value).replace(/\s+—\s+/g, ' - ').replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_match, language, code) => {
    const index = codeBlocks.push(`<pre><div class="code-label">${escapeHtml(language || 'код')}</div><code>${escapeHtml(code.trimEnd())}</code></pre>`) - 1;
    return `@@XACODE_BLOCK_${index}@@`;
  });
  const lines = source.split(/\r?\n/);
  let html = '';
  let listType = '';
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = ''; } };
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    const nextLine = lines[lineIndex + 1]?.trim() || '';
    if (trimmed.includes('|') && /^\|?\s*:?-{3,}/.test(nextLine)) {
      closeList();
      const splitRow = (row) => row.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const headers = splitRow(trimmed);
      html += `<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>`;
      lineIndex += 2;
      while (lineIndex < lines.length && lines[lineIndex].includes('|') && lines[lineIndex].trim()) {
        html += `<tr>${splitRow(lines[lineIndex]).map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`;
        lineIndex += 1;
      }
      html += '</tbody></table></div>';
      lineIndex -= 1;
      continue;
    }
    const unordered = trimmed.match(/^[-*•]\s+(.+)/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (unordered || ordered) {
      const nextType = unordered ? 'ul' : 'ol';
      if (listType !== nextType) { closeList(); listType = nextType; html += `<${listType}>`; }
      const item = (unordered || ordered)[1];
      const task = item.match(/^\[([ xX])\]\s+(.+)/);
      html += task ? `<li class="task-list-item"><input type="checkbox" disabled ${task[1].toLowerCase() === 'x' ? 'checked' : ''}>${inlineMarkdown(task[2])}</li>` : `<li>${inlineMarkdown(item)}</li>`;
      continue;
    }
    closeList();
    if (!trimmed) continue;
    if (/^@@XACODE_BLOCK_\d+@@$/.test(trimmed)) { html += trimmed; continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (heading) { const level = Math.min(3, heading[1].length + 1); html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`; continue; }
    if (/^[-─]{3,}$/.test(trimmed)) { html += '<hr>'; continue; }
    if (trimmed.startsWith('> ')) { html += `<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`; continue; }
    html += `<p>${inlineMarkdown(trimmed)}</p>`;
  }
  closeList();
  return html.replace(/@@XACODE_BLOCK_(\d+)@@/g, (_match, index) => codeBlocks[Number(index)] || '');
}
function parseTokenMetric(content) {
  const match = String(content).match(/Tokens Spent \(this run\):\*?\s*`?([\d\s.,]+)/i);
  if (!match) return null;
  const value = Number(match[1].replace(/[^\d]/g, ''));
  return Number.isFinite(value) ? value : null;
}
function normalizeMessage(message) {
  let role = message.role;
  let content = message.content;
  if (/^🤖\s*\*?Agent:\*?/i.test(content)) { role = 'assistant'; content = content.replace(/^🤖\s*\*?Agent:\*?\s*/i, ''); }
  if (/^🧠\s*\*?Agent Reasoning:\*?/i.test(content)) { role = 'reasoning'; content = content.replace(/^🧠\s*\*?Agent Reasoning:\*?\s*/i, '').replace(/^_+|_+$/g, ''); }
  if (/Task Started:/i.test(content)) { role = 'status'; content = '🔍 *Анализирую задачу...*'; }
  return { ...message, role, content };
}
function preparedMessages(messages) {
  const result = [];
  for (const original of messages) {
    const tokens = parseTokenMetric(original.content);
    if (tokens !== null) {
      const target = [...result].reverse().find((message) => message.role === 'assistant');
      if (target) target.tokensUsed = tokens;
      continue;
    }
    result.push(normalizeMessage({ ...original }));
  }
  return result;
}
function statusTitle(content) {
  const clean = String(content).replace(/[*_`]/g, '');
  if (/Executing Tool:/i.test(clean)) {
    const rawTool = clean.match(/Executing Tool:\s*([^\n]+)/i)?.[1]?.trim() || 'инструмент';
    const labels = { run_command: 'Команда в терминале', process_list: 'Проверка процессов', read_file: 'Чтение файла', read_files: 'Чтение файлов', write_file: 'Изменение файла', edit_file: 'Редактирование файла', apply_patch: 'Применение изменений', list_directory: 'Просмотр папки', search_code: 'Поиск в коде', find_files: 'Поиск файлов', web_search: 'Поиск в интернете', read_url: 'Чтение страницы', ask_user: 'Вопрос пользователю' };
    return `Выполняется: ${labels[rawTool.toLowerCase()] || rawTool}`;
  }
  if (/Task Started:/i.test(clean)) return 'Задача запущена';
  if (/Analyzing|Анализирую|Анализ задачи/i.test(clean)) return 'Анализирую задачу…';
  if (/Task completed successfully/i.test(clean)) return 'Задача выполнена';
  if (/Error|crashed|Ошибка/i.test(clean)) return 'Ошибка выполнения';
  if (/Warning|⚠️/i.test(clean)) return 'Предупреждение';
  return clean.split('\n').find(Boolean)?.slice(0, 90) || 'Ход выполнения';
}

function statusIcon(content, role, active) {
  const value = String(content).toLowerCase();
  if (/error|ошиб|crashed/.test(value)) return 'ph-warning-circle';
  if (/completed|выполнена|готово/.test(value)) return 'ph-check-circle';
  if (role === 'reasoning') return 'ph-brain';
  if (/run_command|terminal|process|команд/.test(value)) return 'ph-terminal-window';
  if (/write_file|edit_file|apply_patch|измен/.test(value)) return 'ph-pencil-simple';
  if (/read_file|list_directory|просмотр|чтение/.test(value)) return 'ph-book-open-text';
  if (/web_search|read_url|network|сеть/.test(value)) return 'ph-globe-hemisphere-west';
  if (/image|изображ/.test(value)) return 'ph-image';
  if (/analy|анализ/.test(value)) return 'ph-magnifying-glass';
  return active ? 'ph-spinner-gap' : 'ph-activity';
}

function renderContextIndicator() {
  const conversation = activeConversation();
  const profile = state.settings?.modelProfiles?.find((item) => item.id === state.settings.activeProfileId);
  const used = Number(conversation?.contextUsage || 0);
  const limit = Number(conversation?.contextLimit || profile?.maxContextTokens || 32000);
  const percent = Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
  const indicator = $('#contextIndicator');
  indicator.style.setProperty('--context-percent', `${percent * 3.6}deg`);
  indicator.dataset.tooltip = `Контекст: ${used.toLocaleString('ru-RU')} / ${limit.toLocaleString('ru-RU')} токенов (${percent}%). Сжатий: ${conversation?.compressionCount || 0}. Автосжатие при 85%.`;
}

function updateSendButton() {
  const sendButton = $('#sendButton');
  sendButton.disabled = !state.running && !$('#promptInput').value.trim();
  sendButton.classList.toggle('stop-mode', state.running);
  sendButton.setAttribute('aria-label', state.running ? 'Остановить' : 'Отправить');
  sendButton.innerHTML = state.running ? '<i class="ph-bold ph-stop"></i>' : '<i class="ph-bold ph-arrow-up"></i>';
}
function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2600);
}

function showConfirm({ title, message, confirmLabel = 'Удалить' }) {
  return new Promise((resolve) => {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    $('#confirmAccept').textContent = confirmLabel;
    state.confirmResolve = resolve;
    dialog.showModal();
  });
}

function resolveConfirm(value) {
  if (!state.confirmResolve) return;
  const resolve = state.confirmResolve;
  state.confirmResolve = null;
  $('#confirmDialog').close();
  resolve(value);
}
function persist() { return api.saveConversations(state.conversations); }
function isEmptyConversation(conversation) { return !conversation?.messages?.length; }
function cleanupEmptyConversations(keepId = null) {
  const before = state.conversations.length;
  state.conversations = state.conversations.filter((conversation) => !isEmptyConversation(conversation) || conversation.id === keepId);
  if (!state.conversations.some((conversation) => conversation.id === state.activeId)) state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null;
  if (state.conversations.length !== before) persist();
}

function setView(view, push = true) {
  if (view !== 'conversation') cleanupEmptyConversations();
  if (push && state.navigation[state.navigationIndex] !== view) {
    state.navigation = state.navigation.slice(0, state.navigationIndex + 1);
    state.navigation.push(view);
    state.navigationIndex = state.navigation.length - 1;
  }
  state.view = view;
  renderMainView();
}

function navigate(delta) {
  const next = state.navigationIndex + delta;
  if (next < 0 || next >= state.navigation.length) return;
  state.navigationIndex = next;
  setView(state.navigation[next], false);
}

function renderSidebar() {
  const list = $('#conversationList');
  const groups = new Map();
  state.conversations.filter((conversation) => !conversation.archived).forEach((conversation) => {
    const key = conversation.workspace || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(conversation);
  });
  const projects = [...groups.entries()].map(([workspace, conversations]) => ({ workspace, conversations: conversations.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt) - new Date(a.updatedAt)), updatedAt: Math.max(...conversations.map((conversation) => new Date(conversation.updatedAt).getTime())) })).sort((a, b) => {
    const pinnedDifference = Number(state.pinnedProjects.includes(b.workspace)) - Number(state.pinnedProjects.includes(a.workspace));
    return pinnedDifference || b.updatedAt - a.updatedAt;
  });
  const projectsHeader = `<div class="projects-heading"><button type="button" class="projects-heading-title" id="projectsHeadingToggle">Проекты <i class="ph-bold ph-caret-down"></i></button><span class="projects-heading-actions"><button type="button" id="projectsHeadingMore" title="Действия"><i class="ph-bold ph-dots-three"></i></button><button type="button" id="projectsHeadingAdd" title="Добавить проект"><i class="ph-bold ph-plus"></i></button></span></div>`;
  list.innerHTML = projectsHeader + (projects.length ? projects.map(({ workspace, conversations }) => {
    const collapsed = Boolean(state.collapsedProjects[workspace]);
    const active = conversations.some((conversation) => conversation.id === state.activeId) && state.view === 'conversation';
    const name = workspace ? (state.projectAliases[workspace] || folderName(workspace)) : 'Без проекта';
    return `<section class="project-group ${active ? 'active-project' : ''}" data-project="${escapeHtml(workspace)}">
      <div class="project-row" data-project-hover="${escapeHtml(workspace)}">
        <button type="button" class="project-toggle" data-project-toggle="${escapeHtml(workspace)}" title="${collapsed ? 'Развернуть' : 'Свернуть'} проект"><i class="ph-bold ${collapsed ? 'ph-caret-right' : 'ph-caret-down'}"></i><i class="ph-bold ph-folder"></i><strong>${escapeHtml(name)}</strong>${state.pinnedProjects.includes(workspace) ? '<i class="ph-bold ph-push-pin project-pin"></i>' : ''}</button>
        ${workspace ? `<span class="project-row-actions"><button type="button" class="project-new-chat" data-project-new-chat="${escapeHtml(workspace)}" title="Новый чат в этой папке"><i class="ph-bold ph-plus"></i></button><button type="button" class="project-delete" data-project-action-inline="remove" data-workspace="${escapeHtml(workspace)}" title="Убрать проект"><i class="ph-bold ph-trash"></i></button><button type="button" class="project-more" data-project-menu="${escapeHtml(workspace)}" title="Действия проекта"><i class="ph-bold ph-dots-three"></i></button></span>` : ''}
      </div>
      <div class="project-conversations ${collapsed ? 'hidden' : ''}">${conversations.map((conversation) => `<div class="project-chat ${conversation.id === state.activeId && state.view === 'conversation' ? 'active' : ''} ${conversation.unread ? 'unread' : ''}" data-chat-row="${conversation.id}"><button type="button" class="project-chat-main" data-conversation="${conversation.id}" title="${escapeHtml(conversation.title)}"><span>${escapeHtml(conversation.title)}</span><time>${formatAge(conversation.updatedAt)}</time></button><span class="chat-hover-actions"><button type="button" data-quick-chat="pin" data-chat-id="${conversation.id}" title="${conversation.pinned ? 'Открепить' : 'Закрепить'}"><i class="ph-bold ph-push-pin${conversation.pinned ? '-slash' : ''}"></i></button><button type="button" data-quick-chat="delete" data-chat-id="${conversation.id}" title="Удалить"><i class="ph-bold ph-trash"></i></button></span></div>`).join('')}</div>
    </section>`;
  }).join('') : '<div class="empty-sidebar">Пока нет чатов</div>');
  list.querySelectorAll('[data-conversation]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.conversation)));
  list.querySelectorAll('[data-chat-row]').forEach((row) => row.addEventListener('contextmenu', (event) => { event.preventDefault(); showChatMenu(row.dataset.chatRow, event.clientX, event.clientY); }));
  list.querySelectorAll('[data-quick-chat]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runChatAction(button.dataset.quickChat, button.dataset.chatId); }));
  $('#projectsHeadingToggle').addEventListener('click', () => { const allCollapsed = projects.every((project) => state.collapsedProjects[project.workspace]); projects.forEach((project) => { state.collapsedProjects[project.workspace] = !allCollapsed; }); localStorage.setItem('xacode.collapsedProjects', JSON.stringify(state.collapsedProjects)); renderSidebar(); });
  $('#projectsHeadingAdd').addEventListener('click', (event) => { event.stopPropagation(); showProjectsHeaderMenu(event.currentTarget); });
  $('#projectsHeadingMore').addEventListener('click', (event) => { event.stopPropagation(); showProjectsHeaderMenu(event.currentTarget); });
  list.querySelectorAll('[data-project-toggle]').forEach((button) => button.addEventListener('click', () => { const workspace = button.dataset.projectToggle; state.collapsedProjects[workspace] = !state.collapsedProjects[workspace]; localStorage.setItem('xacode.collapsedProjects', JSON.stringify(state.collapsedProjects)); renderSidebar(); }));
  list.querySelectorAll('[data-project-new-chat]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); clearTimeout(state.hoverTimer); $('#projectHoverCard').classList.add('hidden'); newConversation(button.dataset.projectNewChat); }));
  list.querySelectorAll('[data-project-menu]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); showProjectMenu(button.dataset.projectMenu, button); }));
  list.querySelectorAll('[data-project-hover]').forEach((row) => {
    row.addEventListener('mouseenter', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => showProjectHover(row.dataset.projectHover, row), 360); });
    row.addEventListener('mouseleave', () => { clearTimeout(state.hoverTimer); state.hoverTimer = setTimeout(() => $('#projectHoverCard').classList.add('hidden'), 130); });
  });
  list.querySelectorAll('[data-project-action-inline]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runProjectAction(button.dataset.projectActionInline, button.dataset.workspace); }));
  $('#historyButton').classList.toggle('active', state.view === 'history');
}

function positionProjectFloating(element, anchor) {
  const rect = anchor.getBoundingClientRect();
  element.style.left = `${Math.min(window.innerWidth - element.offsetWidth - 12, rect.right + 8)}px`;
  element.style.top = `${Math.min(window.innerHeight - element.offsetHeight - 12, Math.max(42, rect.top - 4))}px`;
}

function showProjectHover(workspace, anchor) {
  if (!workspace || !$('#projectMenu').classList.contains('hidden')) return;
  const conversations = state.conversations.filter((conversation) => conversation.workspace === workspace && !conversation.archived);
  const name = state.projectAliases[workspace] || folderName(workspace);
  const card = $('#projectHoverCard');
  card.innerHTML = `<div><i class="ph-bold ph-folder"></i><strong>${escapeHtml(name)}</strong>${state.pinnedProjects.includes(workspace) ? '<i class="ph-bold ph-push-pin"></i>' : ''}</div><p><i class="ph-bold ph-chat-circle"></i>${conversations.length} ${conversations.length === 1 ? 'чат' : conversations.length < 5 ? 'чата' : 'чатов'}</p><p class="project-card-path"><i class="ph-bold ph-folder-open"></i>${escapeHtml(workspace)}</p>`;
  card.classList.remove('hidden');
  requestAnimationFrame(() => positionProjectFloating(card, anchor));
  card.onmouseenter = () => clearTimeout(state.hoverTimer);
  card.onmouseleave = () => { state.hoverTimer = setTimeout(() => card.classList.add('hidden'), 100); };
}

function showProjectMenu(workspace, anchor) {
  const menu = $('#projectMenu');
  $('#projectHoverCard').classList.add('hidden');
  const opening = menu.classList.contains('hidden') || menu.dataset.workspace !== workspace;
  closeFloating(menu);
  menu.dataset.workspace = workspace;
  menu.querySelector('[data-project-action="pin"] span').textContent = state.pinnedProjects.includes(workspace) ? 'Открепить проект' : 'Закрепить проект';
  menu.classList.toggle('hidden', !opening);
  if (opening) requestAnimationFrame(() => positionProjectFloating(menu, anchor));
}

async function runProjectAction(action, workspaceOverride) {
  const menu = $('#projectMenu');
  const workspace = workspaceOverride || menu.dataset.workspace;
  if (!workspaceOverride) menu.classList.add('hidden');
  if (!workspace) return;
  if (action === 'pin') {
    state.pinnedProjects = state.pinnedProjects.includes(workspace) ? state.pinnedProjects.filter((item) => item !== workspace) : [workspace, ...state.pinnedProjects];
    localStorage.setItem('xacode.pinnedProjects', JSON.stringify(state.pinnedProjects));
  }
  if (action === 'open') { const error = await api.openPath(workspace); if (error) toast(error); }
  if (action === 'rename') { const name = window.prompt('Название проекта', state.projectAliases[workspace] || folderName(workspace)); if (name?.trim()) { state.projectAliases[workspace] = name.trim(); localStorage.setItem('xacode.projectAliases', JSON.stringify(state.projectAliases)); } }
  if (action === 'archive') { state.conversations.forEach((conversation) => { if (conversation.workspace === workspace) conversation.archived = true; }); state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null; await persist(); toast('Чаты проекта доступны в истории'); }
  if (action === 'remove') {
    const confirmed = await showConfirm({
      title: 'Убрать проект?',
      message: 'Проект и его чаты будут удалены только из XaCode. Папка и все файлы на диске останутся без изменений.',
      confirmLabel: 'Убрать',
    });
    if (confirmed) {
      const norm = (p) => (p || '').replace(/\\/g, '/').toLowerCase();
      const wsNorm = norm(workspace);
      state.conversations = state.conversations.filter((conversation) => norm(conversation.workspace) !== wsNorm);
      if (norm(state.workspace) === wsNorm) state.workspace = '';
      if (!state.conversations.some((conversation) => conversation.id === state.activeId)) state.activeId = state.conversations.find((conversation) => !conversation.archived)?.id || null;
      await persist();
    }
  }
  render();
}

function showProjectsHeaderMenu(anchor) {
  const menu = $('#projectsHeaderMenu');
  const opening = menu.classList.contains('hidden');
  closeFloating(menu);
  menu.classList.toggle('hidden', !opening);
  if (opening) requestAnimationFrame(() => positionProjectFloating(menu, anchor));
}

function showChatMenu(conversationId, x, y) {
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  const menu = $('#chatMenu');
  closeFloating(menu);
  menu.dataset.conversationId = conversationId;
  menu.querySelector('[data-chat-action="pin"] span').textContent = conversation.pinned ? 'Открепить чат' : 'Закрепить чат';
  menu.querySelector('[data-chat-action="unread"] span').textContent = conversation.unread ? 'Пометить прочитанным' : 'Пометить непрочитанным';
  menu.classList.remove('hidden');
  requestAnimationFrame(() => {
    menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 10, Math.max(8, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - menu.offsetHeight - 10, Math.max(38, y))}px`;
  });
}

async function runChatAction(action, conversationId = $('#chatMenu').dataset.conversationId) {
  $('#chatMenu').classList.add('hidden');
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  if (action === 'pin') conversation.pinned = !conversation.pinned;
  if (action === 'rename') { const name = window.prompt('Название чата', conversation.title); if (name?.trim()) conversation.title = name.trim(); }
  if (action === 'archive') conversation.archived = true;
  if (action === 'unread') conversation.unread = !conversation.unread;
  if (action === 'open' && conversation.workspace) { const error = await api.openPath(conversation.workspace); if (error) toast(error); }
  if (action === 'copy-workspace') { await navigator.clipboard.writeText(conversation.workspace || ''); toast('Путь скопирован'); }
  if (action === 'copy-id') { await navigator.clipboard.writeText(conversation.id); toast('ID чата скопирован'); }
  if (action === 'continue') { state.workspace = conversation.workspace; newConversation(); return; }
  if (action === 'delete') {
    const confirmed = await showConfirm({
      title: 'Удалить чат?',
      message: `Чат «${conversation.title}» будет удалён из XaCode. Файлы проекта останутся без изменений.`,
    });
    if (!confirmed) return;
    state.conversations = state.conversations.filter((item) => item.id !== conversation.id);
  }
  if ((action === 'archive' || action === 'delete') && state.activeId === conversation.id) state.activeId = state.conversations.find((item) => !item.archived && item.id !== conversation.id)?.id || null;
  await persist();
  render();
}

function renderMessages() {
  const conversation = activeConversation();
  if (!conversation) return;
  $('#chatTitle').textContent = conversation.title;
  $('#chatProjectName').textContent = conversation.workspace ? (state.projectAliases[conversation.workspace] || folderName(conversation.workspace)) : 'Без проекта';
  $('#workspaceLabel').textContent = shortPath(conversation.workspace || state.workspace);
  const messages = preparedMessages(conversation.messages);
  const lastExecutionIndex = messages.reduce((last, message, index) => ['status', 'reasoning'].includes(message.role) ? index : last, -1);
  $('#messages').innerHTML = messages.map((message, index) => {
    if (message.role === 'status' || message.role === 'reasoning') {
      const title = message.role === 'reasoning' ? 'Рассуждения агента' : statusTitle(message.content);
      const active = state.running && index === lastExecutionIndex;
      const failed = /ошибка|error|crashed/i.test(title);
      const complete = /выполнена|completed/i.test(title);
      const icon = `${statusIcon(message.content, message.role, active)} ${active ? 'execution-spinner' : ''}`;
      const details = /Analyzing|Анализирую/i.test(message.content) ? '' : `<div class="execution-content">${simpleMarkdown(message.content)}</div>`;
      return `<article class="message ${message.role}" data-message="${message.id}"><details class="execution-update ${active ? 'active' : ''} ${failed ? 'failed' : ''}" ${active && details ? 'open' : ''}>
        <summary><i class="ph-bold ${icon}"></i><span>${escapeHtml(title)}</span><i class="ph-bold ph-caret-down"></i></summary>
        ${details}
      </details></article>`;
    }
    const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const tokens = message.tokensUsed ? `<span class="response-tokens"><i class="ph-bold ph-chart-bar"></i>Использовано ${Number(message.tokensUsed).toLocaleString('ru-RU')} токенов</span>` : '';
    const actions = message.role === 'assistant' ? `<div class="message-actions"><button data-message-action="copy" title="Копировать"><i class="ph-bold ph-copy"></i></button><button data-message-action="like" title="Полезно"><i class="ph-bold ph-thumbs-up"></i></button><button data-message-action="dislike" title="Не полезно"><i class="ph-bold ph-thumbs-down"></i></button></div>` : '';
    let attachmentsHtml = '';
    if (message.attachments && message.attachments.length) {
      attachmentsHtml = '<div class="message-attachments">' + message.attachments.map(a => {
        if (a.image) return `<img src="${escapeHtml(a.path.replace(/\\/g, '/'))}" class="message-image" alt="Attachment" />`;
        return `<span class="message-file"><i class="ph-bold ph-file"></i>${escapeHtml(folderName(a.path))}</span>`;
      }).join('') + '</div>';
    }
    return `<article class="message ${message.role}" data-message="${message.id}"><div>
      <div class="meta">${message.role === 'user' ? 'Вы' : 'XaCode'} · ${time}</div>
      ${attachmentsHtml}
      <div class="bubble">${simpleMarkdown(message.content)}</div>
      ${message.role === 'assistant' ? `<div class="response-footer">${tokens}${actions}</div>` : ''}
    </div></article>`;
  }).join('');
  $('#messages').scrollTop = $('#messages').scrollHeight;
  renderContextIndicator();
  document.querySelectorAll('[data-message-action]').forEach((button) => button.addEventListener('click', async () => {
    const article = button.closest('[data-message]');
    const message = conversation.messages.find((item) => item.id === article.dataset.message);
    if (button.dataset.messageAction === 'copy') { await navigator.clipboard.writeText(normalizeMessage(message).content); toast('Ответ скопирован'); }
    else { article.querySelectorAll('[data-message-action="like"],[data-message-action="dislike"]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); }
  }));
}

function renderHistory() {
  const query = $('#historySearch').value.trim().toLowerCase();
  const items = state.conversations.filter((conversation) => {
    const status = conversation.archived ? 'archived' : state.running && conversation.id === state.activeId ? 'running' : 'complete';
    return state.historyStatuses[status] && (!query || `${conversation.title} ${conversation.workspace}`.toLowerCase().includes(query));
  });
  $('#historyList').innerHTML = items.length ? items.map((conversation) => `<div class="history-row ${conversation.unread ? 'unread' : ''}" data-history-row="${conversation.id}"><button type="button" class="history-row-main" data-history-conversation="${conversation.id}"><i class="ph-bold ph-chat-centered-text"></i><div><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(conversation.workspace ? (state.projectAliases[conversation.workspace] || folderName(conversation.workspace)) : 'Без проекта')}</small></div></button><time>${formatAge(conversation.updatedAt)}</time><span class="history-row-actions"><button type="button" data-history-more="${conversation.id}" title="Действия"><i class="ph-bold ph-dots-three-vertical"></i></button><button type="button" data-history-archive="${conversation.id}" title="${conversation.archived ? 'Вернуть из архива' : 'Архивировать'}"><i class="ph-bold ${conversation.archived ? 'ph-arrow-u-up-left' : 'ph-archive'}"></i></button></span></div>`).join('') : '<div class="empty-list">Чаты не найдены</div>';
  document.querySelectorAll('[data-history-conversation]').forEach((button) => button.addEventListener('click', () => openConversation(button.dataset.historyConversation)));
  document.querySelectorAll('[data-history-row]').forEach((row) => row.addEventListener('contextmenu', (event) => { event.preventDefault(); showChatMenu(row.dataset.historyRow, event.clientX, event.clientY); }));
  document.querySelectorAll('[data-history-more]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const rect = button.getBoundingClientRect(); showChatMenu(button.dataset.historyMore, rect.right, rect.bottom); }));
  document.querySelectorAll('[data-history-archive]').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); const conversation = state.conversations.find((item) => item.id === button.dataset.historyArchive); conversation.archived = !conversation.archived; await persist(); render(); }));
}

function renderMainView() {
  const conversation = activeConversation();
  const onConversation = state.view === 'conversation';
  const hasMessages = Boolean(conversation?.messages.length);
  $('#emptyState').classList.toggle('hidden', !onConversation || hasMessages);
  $('#chatView').classList.toggle('hidden', !onConversation || !hasMessages);
  $('#historyView').classList.toggle('hidden', state.view !== 'history');
  $('.composer-wrap').classList.toggle('hidden', !onConversation);
  $('#backButton').disabled = state.navigationIndex <= 0;
  $('#forwardButton').disabled = state.navigationIndex >= state.navigation.length - 1;
  if (onConversation && conversation) renderMessages();
  if (state.view === 'history') renderHistory();
  renderSidebar();
}

function render() {
  renderMainView();
  renderContextIndicator();
  const activeProfile = state.settings?.modelProfiles?.find((item) => item.id === state.settings.activeProfileId);
  const providerMetaForActive = providerMeta(activeProfile?.provider || 'deepseek');
  $('#modelLabel').textContent = activeProfile?.name || state.settings?.model || 'DeepSeek';
  $('#modelIcon').innerHTML = renderIcon(providerMetaForActive.icon);
  $('#workspaceLabel').textContent = shortPath(activeConversation()?.workspace || state.workspace);
  updateSendButton();
  $('#openProjectButton').disabled = !(activeConversation()?.workspace || state.workspace);
  $('#openProjectMenuButton').disabled = !(activeConversation()?.workspace || state.workspace);
  renderAttachments();
}

function openConversation(conversationId) {
  cleanupEmptyConversations(conversationId);
  state.activeId = conversationId;
  const conversation = activeConversation();
  if (conversation) conversation.unread = false;
  if (conversation?.workspace) state.workspace = conversation.workspace;
  setView('conversation');
  render();
}

function currentWorkspace() {
  const conversation = state.view === 'conversation' ? activeConversation() : null;
  return conversation?.workspace || state.workspace || '';
}

function newConversation(workspace = currentWorkspace()) {
  cleanupEmptyConversations();
  const targetWorkspace = typeof workspace === 'string' ? workspace : currentWorkspace();
  if (targetWorkspace) state.workspace = targetWorkspace;
  const now = new Date().toISOString();
  const conversation = { id: id('chat'), title: 'Новый чат', workspace: targetWorkspace, createdAt: now, updatedAt: now, pinned: false, messages: [] };
  state.conversations.unshift(conversation);
  state.activeId = conversation.id;
  persist();
  setView('conversation');
  render();
  setTimeout(() => $('#promptInput').focus(), 320);
}

function addMessage(role, content, conversationId = state.activeId, attachments = []) {
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) return;
  conversation.messages.push({ id: id('msg'), role, content, attachments, createdAt: new Date().toISOString() });
  conversation.updatedAt = new Date().toISOString();
  persist();
  if (conversationId === state.activeId) render(); else renderSidebar();
}

function handleAgentUpdate({ conversationId, content, context }) {
  const targetId = conversationId || state.activeId;
  const conversation = state.conversations.find((item) => item.id === targetId);
  if (!conversation) return;
  if (context) { conversation.contextUsage = context.usageTokens; conversation.contextLimit = context.maxTokens; conversation.compressionCount = context.compressionCount || 0; conversation.contextUpdatedAt = new Date().toISOString(); }
  const tokens = parseTokenMetric(content);
  if (tokens !== null) {
    const target = [...conversation.messages].reverse().find((message) => normalizeMessage(message).role === 'assistant');
    if (target) target.tokensUsed = tokens;
    conversation.lastRunTokens = tokens;
    if (/Task stopped by user/i.test(content)) conversation.messages.push({ id: id('msg'), role: 'status', content: `⏹ *Остановлено пользователем*\nИспользовано токенов: ${tokens.toLocaleString('ru-RU')}`, createdAt: new Date().toISOString(), tokensUsed: tokens });
    conversation.updatedAt = new Date().toISOString();
    persist();
    if (targetId === state.activeId) render();
    return;
  }
  const normalized = normalizeMessage({ role: 'status', content });
  addMessage(normalized.role, normalized.content, targetId);
}

async function chooseWorkspace() {
  const selected = await api.selectWorkspace();
  if (!selected) return null;
  state.workspace = selected;
  const conversation = activeConversation();
  if (conversation) conversation.workspace = selected;
  persist(); render();
  return selected;
}

function renderAttachments() {
  $('#attachmentChips').classList.toggle('hidden', !state.attachments.length);
  $('#attachmentChips').innerHTML = state.attachments.map((file, index) => {
    if (file.image) return `<div class="attachment-image-preview" style="background-image: url('${escapeHtml(file.path.replace(/\\/g, '/'))}')"><button type="button" data-remove-attachment="${index}"><i class="ph-bold ph-x"></i></button></div>`;
    return `<span class="attachment-chip"><i class="ph-bold ph-file"></i><span title="${escapeHtml(file.path)}">${escapeHtml(folderName(file.path))}</span><button data-remove-attachment="${index}"><i class="ph-bold ph-x"></i></button></span>`;
  }).join('');
  document.querySelectorAll('[data-remove-attachment]').forEach((button) => button.addEventListener('click', () => { state.attachments.splice(Number(button.dataset.removeAttachment), 1); renderAttachments(); }));
}

async function selectFiles() {
  const files = await api.selectFiles();
  for (const file of files) if (!state.attachments.some((item) => item.path === file)) state.attachments.push({ path: file });
  renderAttachments();
}

async function pasteClipboardImage(event) {
  const hasImage = [...(event.clipboardData?.items || [])].some((item) => item.type.startsWith('image/'));
  if (!hasImage) return;
  event.preventDefault();
  const imagePath = await api.pasteClipboardImage();
  if (!imagePath) { toast('Не удалось прочитать изображение из буфера'); return; }
  if (!state.attachments.some((item) => item.path === imagePath)) state.attachments.push({ path: imagePath, image: true });
  renderAttachments();
  toast('Изображение добавлено');
}

function showSlashMenu(query = '') {
  const menu = $('#slashMenu');
  const normalized = query.replace(/^\//, '').toLowerCase();
  const items = slashCommands.filter((command) => command.id.includes(normalized));
  if (!items.length) { menu.classList.add('hidden'); return; }
  menu.innerHTML = items.map((command) => `<button type="button" data-slash-command="${command.id}"><i class="ph-bold ${command.icon}"></i><strong>${command.id}</strong><span>${escapeHtml(command.description)}</span></button>`).join('');
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-slash-command]').forEach((button) => button.addEventListener('click', () => {
    const command = button.dataset.slashCommand;
    menu.classList.add('hidden');
    $('#promptInput').value = `/${command} `; $('#promptInput').focus(); updateSendButton();
  }));
}

function expandSlashPrompt(text) {
  const match = text.match(/^\/([\w-]+)\s*([\s\S]*)$/);
  if (!match) return text;
  const body = match[2].trim();
  const prefixes = {
    btw: '[QUICK SIDE QUESTION] Answer briefly without changing or abandoning the main task.',
    goal: '[GOAL MODE] Continue working until this goal is genuinely completed. Do not stop after only describing a plan.',
    browser: '[BROWSER TASK] Use available browser or web tools when needed.',
    'grill-me': '[INTERVIEW MODE] Ask focused questions one at a time to thoroughly examine this idea or plan.',
    'teamwork-preview': '[TEAMWORK PREVIEW] Break this large task into independent roles and present the proposed collaboration plan before execution.',
    learn: '[LEARNING MODE] Extract a concise reusable rule from this success, failure, or correction.',
  };
  return prefixes[match[1]] ? `${prefixes[match[1]]}\n\n${body}` : text;
}

async function sendPrompt() {
  const input = $('#promptInput');
  const text = input.value.trim();
  if (!text || state.running) return;
  if (!state.activeId) newConversation();
  const conversation = activeConversation();
  if (!conversation.workspace && !await chooseWorkspace()) return;
  if (conversation.title === 'Новый чат') conversation.title = text.slice(0, 54) + (text.length > 54 ? '…' : '');
  const attachedPaths = state.attachments.map((file) => file.path);
  const msgAttachments = [...state.attachments];
  const expandedText = expandSlashPrompt(text);
  const agentText = attachedPaths.length ? `${expandedText}\n\n[ATTACHED FILES]\n${attachedPaths.join('\n')}` : expandedText;
  input.value = ''; input.style.height = '44px'; state.attachments = [];
  addMessage('user', text, state.activeId, msgAttachments);
  state.running = true; render();
  try { await api.sendMessage({ conversationId: conversation.id, text: agentText, workspace: conversation.workspace }); }
  catch (error) { addMessage('assistant', `Ошибка: ${error.message || error}`); if (String(error).includes('API-ключ')) openSettings('models'); }
  finally { state.running = false; render(); }
}

function closeFloating(except) {
  document.querySelectorAll('.popover, .app-menu, .project-floating, .slash-menu').forEach((item) => { if (item !== except) item.classList.add('hidden'); item.classList.remove('open'); });
}

function togglePopover(element) {
  const willOpen = element.classList.contains('hidden');
  closeFloating(element);
  element.classList.toggle('hidden', !willOpen);
}

function showWorkspacePopover() {
  const workspaces = [...new Set(state.conversations.map((c) => c.workspace).filter(Boolean))];
  $('#workspaceOptions').innerHTML = workspaces.slice(0, 12).map((workspace) => `<div class="workspace-option-wrapper"><button data-workspace="${escapeHtml(workspace)}" class="${workspace === state.workspace ? 'active' : ''}"><i class="ph-bold ph-folder"></i><span>${escapeHtml(shortPath(workspace))}</span>${workspace === state.workspace ? '<i class="ph-bold ph-check"></i>' : ''}</button><button class="create-workspace-chat" data-create-workspace="${escapeHtml(workspace)}" title="Новый чат"><i class="ph-bold ph-plus"></i></button></div>`).join('') || '<div class="popover-label">Недавних проектов пока нет</div>';
  document.querySelectorAll('[data-workspace]').forEach((button) => button.addEventListener('click', () => { state.workspace = button.dataset.workspace; if (activeConversation()) activeConversation().workspace = state.workspace; persist(); closeFloating(); render(); }));
  document.querySelectorAll('[data-create-workspace]').forEach((button) => button.addEventListener('click', (e) => { e.stopPropagation(); state.workspace = button.dataset.createWorkspace; newConversation(); closeFloating(); render(); }));
  togglePopover($('#workspacePopover'));
}

function showModelPopover() {
  const profiles = state.settings.modelProfiles || [];
  $('#modelOptions').innerHTML = profiles.map((profile) => { const meta = providerMeta(profile.provider); return `<button data-profile="${escapeHtml(profile.id)}" class="model-option ${profile.id === state.settings.activeProfileId ? 'active' : ''}">${renderIcon(meta.icon)}<span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(meta.label)} · ${escapeHtml(profile.model)}</small></span>${profile.id === state.settings.activeProfileId ? '<i class="ph-bold ph-check"></i>' : ''}</button>`; }).join('');
  document.querySelectorAll('[data-profile]').forEach((button) => button.addEventListener('click', async () => { const profile = profiles.find((item) => item.id === button.dataset.profile); if (!profile) return; state.settings.activeProfileId = profile.id; Object.assign(state.settings, { provider: profile.provider, model: profile.model, apiKey: profile.apiKey, baseUrl: profile.baseUrl, showReasoning: profile.showReasoning }); state.settings = await api.saveSettings(state.settings); closeFloating(); render(); toast(`Модель: ${profile.name}`); }));
  togglePopover($('#modelPopover'));
}

function renderModelProfiles() {
  const profiles = state.settings.modelProfiles || [];
  if (!state.editingProfileId) state.editingProfileId = state.settings.activeProfileId || profiles[0]?.id;
  $('#modelProfilesList').innerHTML = profiles.map((profile) => { const meta = providerMeta(profile.provider); return `<div class="model-profile-wrap ${profile.id === state.editingProfileId ? 'selected' : ''}"><button type="button" data-edit-profile="${escapeHtml(profile.id)}" class="model-profile-row">${renderIcon(meta.icon)}<span><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(meta.label)} · ${escapeHtml(profile.model)}</small></span>${profile.id === state.settings.activeProfileId ? '<em>Активна</em>' : ''}</button><button type="button" class="delete-model-profile" data-delete-profile="${escapeHtml(profile.id)}" title="Удалить конфигурацию"><i class="ph-bold ph-trash"></i></button></div>`; }).join('');
  document.querySelectorAll('[data-edit-profile]').forEach((button) => button.addEventListener('click', () => { state.editingProfileId = button.dataset.editProfile; renderModelProfiles(); fillModelProfile(); }));
  document.querySelectorAll('[data-delete-profile]').forEach((button) => button.addEventListener('click', async () => {
    if (profiles.length <= 1) { toast('Нельзя удалить единственную конфигурацию'); return; }
    const profile = profiles.find((item) => item.id === button.dataset.deleteProfile);
    if (!await showConfirm({ title: 'Удалить конфигурацию?', message: `Конфигурация «${profile?.name || ''}» будет удалена.`, confirmLabel: 'Удалить' })) return;
    state.settings.modelProfiles = profiles.filter((item) => item.id !== button.dataset.deleteProfile);
    if (state.settings.activeProfileId === button.dataset.deleteProfile) state.settings.activeProfileId = state.settings.modelProfiles[0].id;
    state.editingProfileId = state.settings.modelProfiles[0].id; renderModelProfiles(); fillModelProfile();
  }));
}

function fillModelProfile() {
  const profile = state.settings.modelProfiles.find((item) => item.id === state.editingProfileId) || state.settings.modelProfiles[0];
  if (!profile) return;
  $('#profileNameInput').value = profile.name; $('#providerInput').value = profile.provider; $('#modelInput').value = profile.model; $('#apiKeyInput').value = profile.apiKey || ''; $('#baseUrlInput').value = profile.baseUrl; $('#maxContextInput').value = profile.maxContextTokens || 32000; updateProviderConstructor(false);
}

function currentProjectPermissions() {
  const local = state.settings.projectPermissions?.[state.workspace];
  return { ...LOCAL_PROJECT_PERMISSIONS, ...(local || {}), allowedCommands: [...(local?.allowedCommands || [])], deniedCommands: [...(local?.deniedCommands || [])], fileRules: [...(local?.fileRules || [])], commandRules: [...(local?.commandRules || [])], disabledTools: [...(local?.disabledTools || [])] };
}

function updateProviderConstructor(applyPreset = true) {
  const meta = providerMeta($('#providerInput').value);
  $('#providerDescription').textContent = $('#providerInput').value === 'anthropic' ? 'Anthropic Messages API' : $('#providerInput').value === 'ollama' ? 'Локальный OpenAI-совместимый сервер, API-ключ не нужен' : 'OpenAI-совместимый API';
  $('#modelSuggestions').innerHTML = meta.models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join('');
  if (applyPreset) { $('#baseUrlInput').value = meta.baseUrl; $('#modelInput').value = meta.model; if (!$('#profileNameInput').value.trim() || $('#profileNameInput').value === 'Новая конфигурация') $('#profileNameInput').value = meta.label; }
}

function fillPermissions() {
  const policy = currentProjectPermissions();
  $('#permissionSandboxMode').value = policy.sandboxMode; $('#permissionFileRead').value = policy.fileRead; $('#permissionFileWrite').value = policy.fileWrite; $('#permissionTerminal').value = policy.terminal; $('#permissionNetwork').value = policy.network;
  const count = (policy.allowedCommands?.length || 0) + (policy.deniedCommands?.length || 0) + (policy.fileRules?.length || 0) + (policy.commandRules?.length || 0) + (policy.disabledTools?.length || 0);
  $('#permissionRulesSummary').textContent = count ? `${count} сохранённых правил для этой папки.` : 'Индивидуальных правил пока нет.';
  
  const cmdCount = (policy.commandRules?.length || 0);
  if ($('#terminalRuleBadge')) {
    $('#terminalRuleBadge').textContent = cmdCount;
    $('#terminalRuleBadge').style.display = cmdCount > 0 ? 'inline-block' : 'none';
  }

  renderPermissionRules(policy);
  renderToolAccess(policy);
}

function renderToolAccess(policy = currentProjectPermissions()) {
  const disabled = new Set(policy.disabledTools || []);
  $('#toolAccessList').innerHTML = state.availableTools.map((tool) => `<label class="tool-access-item ${tool.required ? 'required' : ''}"><input type="checkbox" data-tool-toggle="${escapeHtml(tool.name)}" ${disabled.has(tool.name) ? '' : 'checked'} ${tool.required ? 'checked disabled' : ''}><span><strong>${escapeHtml(tool.name)}</strong><small>${escapeHtml(tool.description)}</small></span></label>`).join('');
  document.querySelectorAll('[data-tool-toggle]').forEach((input) => input.addEventListener('change', () => {
    const names = new Set(policy.disabledTools || []);
    if (input.checked) names.delete(input.dataset.toolToggle); else names.add(input.dataset.toolToggle);
    policy.disabledTools = [...names];
    state.settings.projectPermissions[state.workspace] = policy;
    $('#permissionRulesSummary').textContent = policy.disabledTools.length ? `${policy.disabledTools.length} инструментов отключено для этой папки.` : 'Все инструменты включены.';
  }));
}

function savePermissionDraft(policy) {
  state.settings.projectPermissions ||= {};
  state.settings.projectPermissions[state.workspace] = policy;
  fillPermissions();
}

function renderPermissionRules(policy = currentProjectPermissions()) {
  const effects = '<option value="allow">Разрешать</option><option value="ask">Спрашивать</option><option value="deny">Запрещать</option>';
  
  const readRulesHTML = (policy.fileRules || []).map((rule, index) => rule.access === 'read' ? `<div class="permission-rule-row"><select data-file-rule-effect="${index}">${effects}</select><input data-file-rule-path="${index}" value="${escapeHtml(rule.path)}" placeholder="C:\\путь\\к\\папке" /><button type="button" data-remove-file-rule="${index}"><i class="ph-bold ph-x"></i></button></div>` : '').join('');
  $('#fileReadsList').innerHTML = readRulesHTML || '<p class="empty-rule-list">Точечных правил чтения пока нет.</p>';
  
  const writeRulesHTML = (policy.fileRules || []).map((rule, index) => rule.access === 'write' ? `<div class="permission-rule-row"><select data-file-rule-effect="${index}">${effects}</select><input data-file-rule-path="${index}" value="${escapeHtml(rule.path)}" placeholder="C:\\путь\\к\\папке" /><button type="button" data-remove-file-rule="${index}"><i class="ph-bold ph-x"></i></button></div>` : '').join('');
  $('#fileWritesList').innerHTML = writeRulesHTML || '<p class="empty-rule-list">Точечных правил изменения пока нет.</p>';
  
  $('#commandRulesList').innerHTML = (policy.commandRules || []).map((rule, index) => `<div class="permission-rule-row command"><select data-command-rule-effect="${index}">${effects}</select><input data-command-rule-value="${index}" value="${escapeHtml(rule.command)}" placeholder="например: npm test" /><button type="button" data-remove-command-rule="${index}"><i class="ph-bold ph-x"></i></button></div>`).join('') || '<p class="empty-rule-list">Точечных правил для команд пока нет.</p>';
  
  (policy.fileRules || []).forEach((rule, index) => { const effect = document.querySelector(`[data-file-rule-effect="${index}"]`); if (effect) effect.value = rule.effect; });
  (policy.commandRules || []).forEach((rule, index) => { const effect = document.querySelector(`[data-command-rule-effect="${index}"]`); if (effect) effect.value = rule.effect; });
  
  document.querySelectorAll('[data-file-rule-effect],[data-file-rule-path]').forEach((control) => control.addEventListener('change', () => { const index = Number(control.dataset.fileRuleEffect ?? control.dataset.fileRulePath); const row = policy.fileRules[index]; row.effect = document.querySelector(`[data-file-rule-effect="${index}"]`).value; row.path = document.querySelector(`[data-file-rule-path="${index}"]`).value.trim(); state.settings.projectPermissions[state.workspace] = policy; }));
  document.querySelectorAll('[data-command-rule-effect],[data-command-rule-value]').forEach((control) => control.addEventListener('change', () => { const index = Number(control.dataset.commandRuleEffect ?? control.dataset.commandRuleValue); policy.commandRules[index].effect = document.querySelector(`[data-command-rule-effect="${index}"]`).value; policy.commandRules[index].command = document.querySelector(`[data-command-rule-value="${index}"]`).value.trim(); state.settings.projectPermissions[state.workspace] = policy; }));
  
  document.querySelectorAll('[data-remove-file-rule]').forEach((button) => button.addEventListener('click', () => { policy.fileRules.splice(Number(button.dataset.removeFileRule), 1); savePermissionDraft(policy); }));
  document.querySelectorAll('[data-remove-command-rule]').forEach((button) => button.addEventListener('click', () => { policy.commandRules.splice(Number(button.dataset.removeCommandRule), 1); savePermissionDraft(policy); }));
}

const pageDescriptions = {
  general: 'Управление папками проекта, поведением агента и разрешениями.', account: 'Доступ к API и локальные данные подключения.', permissions: 'Правила доступа агента к файлам, терминалу и сети.', appearance: 'Тема и визуальное поведение приложения.', models: 'Провайдер, модель и параметры ИИ.', customizations: 'Персональные инструкции и стили ответов.', browser: 'Параметры встроенного браузера.', app: 'Версия приложения и системные параметры.', conversations: 'Управление локальной историей разговоров.', shortcuts: 'Горячие клавиши для основных действий.', feedback: 'Локальная диагностика для обратной связи.',
};
function setSettingsPage(page) {
  state.settingsPage = page;
  document.querySelectorAll('[data-settings-page]').forEach((button) => button.classList.toggle('active', button.dataset.settingsPage === page));
  document.querySelectorAll('.settings-page').forEach((section) => section.classList.toggle('active', section.dataset.page === page));
  $('#settingsPageDescription').textContent = pageDescriptions[page] || pageDescriptions.general;
  $('.settings-pages').scrollTop = 0;
  if (page === 'permissions') fillPermissions();
  if (page === 'models') { renderModelProfiles(); fillModelProfile(); }
}
function renderSettingsProjects() {
  const unique = [...new Set(state.conversations.map((c) => c.workspace).filter(Boolean))];
  if (state.workspace && !unique.includes(state.workspace)) unique.unshift(state.workspace);
  const visible = state.showAllProjects ? unique : unique.slice(0, 5);
  $('#settingsProjectList').innerHTML = visible.map((workspace) => `<button type="button" class="settings-nav-item ${workspace === state.workspace ? 'active-project' : ''}" data-settings-project="${escapeHtml(workspace)}" title="${escapeHtml(workspace)}"><i class="ph-bold ph-folder"></i><span>${escapeHtml(state.projectAliases[workspace] || folderName(workspace))}</span></button>`).join('');
  $('#settingsShowAll span').textContent = state.showAllProjects ? 'Показать меньше' : 'Показать все';
  document.querySelectorAll('[data-settings-project]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); state.workspace = button.dataset.settingsProject; updateSettingsProjectHeader(); renderSettingsProjects(); fillPermissions(); setSettingsPage('general'); }));
}
function updateSettingsProjectHeader() { const workspace = state.workspace || activeConversation()?.workspace; $('#settingsProjectTitle').textContent = state.projectAliases[workspace] || workspace || 'XaCode'; $('#settingsFolderPath').textContent = workspace || 'Папка проекта не выбрана'; }
function openSettings(page = 'general') {
  cleanupEmptyConversations(); render(); closeFloating(); const s = state.settings;
  state.settingsSnapshot = JSON.parse(JSON.stringify(state.settings));
  state.editingProfileId = s.activeProfileId; renderModelProfiles(); fillModelProfile(); fillPermissions(); $('#reasoningInput').checked = s.showReasoning; $('#securityPreset').value = currentProjectPermissions().sandboxMode === 'full' ? 'full' : currentProjectPermissions().sandboxMode === 'strict' ? 'restricted' : 'default'; $('#reasoningPreset').value = s.showReasoning ? 'visible' : 'hidden'; $('#settingsStatus').textContent = '';
  updateSettingsProjectHeader(); renderSettingsProjects(); setSettingsPage(page); const dialog = $('#settingsDialog'); dialog.classList.remove('closing'); dialog.showModal(); dialog.classList.add('opening'); setTimeout(() => dialog.classList.remove('opening'), 220);
}
function closeSettings() {
  const dialog = $('#settingsDialog');
  if (!dialog.open || dialog.classList.contains('closing')) return;
  dialog.classList.remove('opening'); dialog.classList.add('closing');
  setTimeout(() => { dialog.close(); dialog.classList.remove('closing'); }, 170);
}
function cancelSettings() {
  if (state.settingsSnapshot) state.settings = state.settingsSnapshot;
  state.settingsSnapshot = null;
  closeSettings();
  render();
}
async function saveSettings(event) {
  event.preventDefault();
  const profile = state.settings.modelProfiles.find((item) => item.id === state.editingProfileId) || state.settings.modelProfiles[0];
  Object.assign(profile, { name: $('#profileNameInput').value.trim() || $('#modelInput').value.trim(), provider: $('#providerInput').value, model: $('#modelInput').value.trim(), apiKey: $('#apiKeyInput').value.trim(), baseUrl: $('#baseUrlInput').value.trim(), maxContextTokens: Math.max(4096, Number($('#maxContextInput').value) || 32000), showReasoning: $('#reasoningInput').checked || $('#reasoningPreset').value === 'visible' });
  const policy = { ...currentProjectPermissions(), sandboxMode: $('#permissionSandboxMode').value, fileRead: $('#permissionFileRead').value, fileWrite: $('#permissionFileWrite').value, terminal: $('#permissionTerminal').value, network: $('#permissionNetwork').value };
  state.settings.projectPermissions ||= {}; state.settings.projectPermissions[state.workspace] = policy;
  const active = state.settings.modelProfiles.find((item) => item.id === state.settings.activeProfileId) || profile;
  Object.assign(state.settings, { provider: active.provider, model: active.model, apiKey: active.apiKey, baseUrl: active.baseUrl, fullAccess: policy.sandboxMode === 'full', showReasoning: active.showReasoning });
  state.settings = await api.saveSettings(state.settings); $('#settingsStatus').textContent = 'Сохранено безопасно'; setTimeout(closeSettings, 260); render();
  state.settingsSnapshot = null;
}

function setSidebarCollapsed(collapsed) {
  const sidebar = $('#sidebar');
  sidebar.classList.toggle('collapsed', collapsed);
  $('.main-panel').classList.toggle('sidebar-collapsed', collapsed);
  $('#sidebarRestore').classList.toggle('hidden', !collapsed);
  $('#sidebarResizer').classList.toggle('hidden', collapsed);
  $('#toggleSidebar').title = collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель';
  localStorage.setItem('xacode.sidebarCollapsed', String(collapsed));
}

function toggleSidebar() {
  const collapsed = !$('#sidebar').classList.contains('collapsed');
  if (!collapsed) document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidthBeforeCollapse}px`);
  setSidebarCollapsed(collapsed);
}

function initSidebarResize() {
  const resizer = $('#sidebarResizer');
  let frame = 0;
  const applyWidth = (width) => {
    const next = Math.max(112, Math.min(520, width));
    state.sidebarWidth = next;
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    $('#sidebar').classList.toggle('near-collapse', next < 190);
  };
  resizer.addEventListener('pointerdown', (event) => {
    if ($('#sidebar').classList.contains('collapsed')) return;
    state.resizingSidebar = true;
    document.body.classList.add('resizing-sidebar');
    resizer.setPointerCapture(event.pointerId);
  });
  resizer.addEventListener('pointermove', (event) => {
    if (!state.resizingSidebar) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => applyWidth(event.clientX));
  });
  const finish = (event) => {
    if (!state.resizingSidebar) return;
    state.resizingSidebar = false;
    document.body.classList.remove('resizing-sidebar');
    if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
    if (state.sidebarWidth < 185) {
      state.sidebarWidthBeforeCollapse = 314;
      setSidebarCollapsed(true);
    } else {
      $('#sidebar').classList.remove('near-collapse');
      state.sidebarWidthBeforeCollapse = state.sidebarWidth;
      localStorage.setItem('xacode.sidebarWidth', String(Math.round(state.sidebarWidth)));
    }
  };
  resizer.addEventListener('pointerup', finish);
  resizer.addEventListener('pointercancel', finish);
}

function showTooltip(target) {
  const text = target.dataset.tooltip || target.getAttribute('title');
  if (!text) return;
  if (!target.dataset.tooltip) { target.dataset.tooltip = text; target.removeAttribute('title'); }
  clearTimeout(showTooltip.timer);
  showTooltip.timer = setTimeout(() => {
    if (!target.isConnected || !target.matches(':hover')) return;
    const tooltip = $('#uiTooltip');
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    const rect = target.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tooltip.offsetWidth - 10, Math.max(10, rect.left + (rect.width - tooltip.offsetWidth) / 2));
    const above = rect.top - tooltip.offsetHeight - 9;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${above > 36 ? above : rect.bottom + 9}px`;
  }, 360);
}

function hideTooltip() {
  clearTimeout(showTooltip.timer);
  $('#uiTooltip').classList.add('hidden');
}

function answerInlineChoice(choice) {
  if (!choice || !state.pendingChoiceId) return;
  api.answerChoice(state.pendingChoiceId, choice);
  state.pendingChoiceId = null;
  $('#inlineChoice').classList.add('hidden');
  $('#inlineChoiceInput').value = '';
}

async function openWorkspaceWith(launcher) {
  const workspace = activeConversation()?.workspace || state.workspace;
  if (!workspace) return;
  closeFloating();
  const error = await api.openWorkspaceWith(workspace, launcher);
  if (error) toast(error);
}

async function chooseWorkspaceApplication() {
  const workspace = activeConversation()?.workspace || state.workspace;
  if (!workspace) return;
  closeFloating();
  const error = await api.chooseWorkspaceApp(workspace);
  if (error) toast(error);
}

function showProjectLauncherMenu() {
  const menu = $('#projectLauncherMenu');
  const opening = menu.classList.contains('hidden');
  closeFloating(menu);
  if (!opening) { menu.classList.add('hidden'); return; }
  menu.innerHTML = state.workspaceLaunchers.map((launcher) => `<button type="button" data-workspace-launcher="${launcher.id}">${launcher.icon ? `<img src="${launcher.icon}" alt="" />` : '<i class="ph-bold ph-app-window"></i>'}<span>${escapeHtml(launcher.label)}</span>${launcher.id === 'explorer' ? '<i class="ph-bold ph-check launcher-check"></i>' : ''}</button>`).join('') + '<div class="menu-separator"></div><button type="button" id="chooseWorkspaceApplication"><i class="ph-bold ph-app-window"></i><span>Выбрать приложение…</span></button>';
  menu.classList.remove('hidden');
  const rect = $('#openProjectMenuButton').getBoundingClientRect();
  menu.style.left = `${Math.max(10, rect.right - menu.offsetWidth)}px`;
  menu.style.top = `${rect.bottom + 7}px`;
  menu.querySelectorAll('[data-workspace-launcher]').forEach((button) => button.addEventListener('click', () => openWorkspaceWith(button.dataset.workspaceLauncher)));
  $('#chooseWorkspaceApplication').addEventListener('click', chooseWorkspaceApplication);
}

async function createWorkspaceConversation() {
  const workspace = await api.createWorkspace();
  if (!workspace) return;
  state.workspace = workspace;
  newConversation(workspace);
  toast(`Создан проект ${folderName(workspace)}`);
}

async function selectWorkspaceConversation() {
  const workspace = await api.selectWorkspace();
  if (!workspace) return;
  state.workspace = workspace;
  newConversation(workspace);
  toast(`Добавлен проект ${folderName(workspace)}`);
}

function renderCommandPalette(query = '') {
  const filtered = commandDefinitions.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  $('#commandList').innerHTML = filtered.map((command, index) => `<button class="command-item ${index === 0 ? 'selected' : ''}" data-palette-command="${command.id}"><i class="ph-bold ${command.icon}"></i>${command.label}${command.shortcut ? `<kbd>${command.shortcut}</kbd>` : ''}</button>`).join('') || '<div class="empty-list">Команда не найдена</div>';
  document.querySelectorAll('[data-palette-command]').forEach((button) => button.addEventListener('click', () => { $('#commandPalette').close(); runCommand(button.dataset.paletteCommand); }));
}
function openCommandPalette() { closeFloating(); $('#commandSearch').value = ''; renderCommandPalette(); $('#commandPalette').showModal(); setTimeout(() => $('#commandSearch').focus(), 50); }

async function runCommand(command) {
  closeFloating();
  if (command === 'new-chat') newConversation();
  if (command === 'choose-folder') await chooseWorkspace();
  if (command === 'history') setView('history');
  if (command === 'toggle-sidebar') toggleSidebar();
  if (command === 'settings') openSettings('general');
  if (command === 'about') $('#aboutDialog').showModal();
  if (command === 'palette') openCommandPalette();
  if (command === 'minimize' || command === 'maximize' || command === 'close') api.windowAction(command);
  if (command === 'zoom-in') api.zoomAction('in');
  if (command === 'zoom-out') api.zoomAction('out');
  if (command === 'zoom-reset') api.zoomAction('reset');
}

function bindEvents() {
  $('#newChat').addEventListener('click', () => newConversation());
  $('#settingsButton').addEventListener('click', () => openSettings('general'));
  $('#historyButton').addEventListener('click', () => setView('history'));
  $('#backButton').addEventListener('click', () => navigate(-1));
  $('#forwardButton').addEventListener('click', () => navigate(1));
  $('#toggleSidebar').addEventListener('click', toggleSidebar);
  $('#sidebarRestore').addEventListener('click', toggleSidebar);
  $('#mobileSidebar').addEventListener('click', toggleSidebar);
  $('#chatProjectName').addEventListener('click', () => { const workspace = activeConversation()?.workspace || state.workspace; if (!workspace) return; state.workspace = workspace; newConversation(); });
  $('#workspacePicker').addEventListener('click', showWorkspacePopover);
  $('#browseWorkspace').addEventListener('click', async () => { closeFloating(); await chooseWorkspace(); });
  $('#modelButton').addEventListener('click', showModelPopover);
  $('[data-open-model-settings]').addEventListener('click', () => openSettings('models'));
  $('#attachButton').addEventListener('click', () => togglePopover($('#contextPopover')));
  $('#sendButton').addEventListener('click', async () => {
    if (state.running) { await api.stopAgent(state.activeId); state.running = false; render(); return; }
    await sendPrompt();
  });
  $('#openProjectButton').addEventListener('click', () => openWorkspaceWith('explorer'));
  $('#openProjectMenuButton').addEventListener('click', (event) => { event.stopPropagation(); showProjectLauncherMenu(); });
  $('#historySearch').addEventListener('input', renderHistory);
  $('#historyFilter').addEventListener('click', (event) => { event.stopPropagation(); const anchor = event.currentTarget; const menu = $('#historyFilterMenu'); const opening = menu.classList.contains('hidden'); closeFloating(menu); menu.classList.toggle('hidden', !opening); if (opening) requestAnimationFrame(() => { const rect = anchor.getBoundingClientRect(); menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 10, rect.left)}px`; menu.style.top = `${rect.bottom + 6}px`; }); });
  document.querySelectorAll('[data-history-status]').forEach((input) => input.addEventListener('change', () => { state.historyStatuses[input.dataset.historyStatus] = input.checked; renderHistory(); }));
  $('#historyFilterMenu').addEventListener('click', (event) => event.stopPropagation());
  $('#saveSettingsButton').addEventListener('click', saveSettings);
  $('#addModelProfile').addEventListener('click', (event) => { event.preventDefault(); const profile = { id: id('profile'), name: 'Новая конфигурация', provider: 'custom', model: '', apiKey: '', baseUrl: '', maxContextTokens: 32000, showReasoning: false }; state.settings.modelProfiles.push(profile); state.editingProfileId = profile.id; renderModelProfiles(); fillModelProfile(); $('#profileNameInput').focus(); });
  $('#providerInput').addEventListener('change', () => updateProviderConstructor(true));
  $('#resetPermissionRules').addEventListener('click', (event) => { event.preventDefault(); const policy = currentProjectPermissions(); policy.allowedCommands = []; policy.deniedCommands = []; policy.fileRules = []; policy.commandRules = []; state.settings.projectPermissions[state.workspace] = policy; fillPermissions(); });
  $('#addFileReadRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentProjectPermissions(); policy.fileRules ||= []; policy.fileRules.push({ access: 'read', effect: 'allow', path: state.workspace || '' }); savePermissionDraft(policy); });
  $('#addFileWriteRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentProjectPermissions(); policy.fileRules ||= []; policy.fileRules.push({ access: 'write', effect: 'allow', path: state.workspace || '' }); savePermissionDraft(policy); });
  $('#addCommandRule').addEventListener('click', (event) => { event.preventDefault(); const policy = currentProjectPermissions(); policy.commandRules ||= []; policy.commandRules.push({ effect: 'allow', command: '' }); savePermissionDraft(policy); });
  $('#enableAllTools').addEventListener('click', (event) => { event.preventDefault(); const policy = currentProjectPermissions(); policy.disabledTools = []; savePermissionDraft(policy); });
  $('#closeSettingsButton').addEventListener('click', cancelSettings);
  $('#cancelSettingsButton').addEventListener('click', cancelSettings);
  $('#settingsDialog').addEventListener('cancel', (event) => { event.preventDefault(); cancelSettings(); });
  $('#settingsAddFolder').addEventListener('click', async (event) => { event.preventDefault(); const selected = await chooseWorkspace(); if (selected) { updateSettingsProjectHeader(); renderSettingsProjects(); } });
  $('.remove-folder').addEventListener('click', async (event) => {
    event.preventDefault();
    const workspace = state.workspace;
    if (!workspace) return;
    const confirmed = await showConfirm({ title: 'Отключить папку?', message: 'Все чаты этого проекта будут удалены из истории XaCode. Файлы на диске не будут удалены.', confirmLabel: 'Отключить' });
    if (!confirmed) return;
    state.conversations = state.conversations.filter((conversation) => conversation.workspace !== workspace);
    state.activeId = state.conversations[0]?.id || null;
    state.workspace = '';
    await persist(); updateSettingsProjectHeader(); renderSettingsProjects(); render();
    toast('Проект отключен, история чатов удалена');
  });
  $('#confirmAccept').addEventListener('click', () => resolveConfirm(true));
  $('#confirmCancel').addEventListener('click', () => resolveConfirm(false));
  $('#confirmClose').addEventListener('click', () => resolveConfirm(false));
  $('#confirmDialog').addEventListener('cancel', (event) => { event.preventDefault(); resolveConfirm(false); });
  $('#settingsShowAll').addEventListener('click', (event) => { event.preventDefault(); state.showAllProjects = !state.showAllProjects; renderSettingsProjects(); });
  $('#renameProjectButton').addEventListener('click', (event) => { event.preventDefault(); if (!state.workspace) return; $('#renameProjectInput').value = state.projectAliases[state.workspace] || folderName(state.workspace); $('#renameProjectDialog').showModal(); setTimeout(() => { $('#renameProjectInput').focus(); $('#renameProjectInput').select(); }, 30); });
  $('#renameProjectCancel').addEventListener('click', () => $('#renameProjectDialog').close());
  $('#renameProjectForm').addEventListener('submit', (event) => { event.preventDefault(); const name = $('#renameProjectInput').value.trim(); if (!name || !state.workspace) return; state.projectAliases[state.workspace] = name; localStorage.setItem('xacode.projectAliases', JSON.stringify(state.projectAliases)); $('#renameProjectDialog').close(); updateSettingsProjectHeader(); renderSettingsProjects(); render(); toast('Название проекта изменено'); });
  $('#copyDiagnostics').addEventListener('click', async (event) => { event.preventDefault(); const diagnostics = `XaCode Desktop 1.11.0\nПлатформа: ${navigator.platform}\nПровайдер: ${state.settings.provider}\nМодель: ${state.settings.model}\nЧатов: ${state.conversations.length}`; await navigator.clipboard.writeText(diagnostics); toast('Диагностика скопирована'); });
  document.querySelectorAll('[data-project-action]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runProjectAction(button.dataset.projectAction); }));
  document.querySelectorAll('[data-chat-action]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runChatAction(button.dataset.chatAction); }));
  document.querySelectorAll('[data-projects-action]').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); closeFloating(); if (button.dataset.projectsAction === 'blank') await createWorkspaceConversation(); if (button.dataset.projectsAction === 'select') await selectWorkspaceConversation(); }));
  $('#securityPreset').addEventListener('change', () => { $('#permissionSandboxMode').value = $('#securityPreset').value === 'full' ? 'full' : $('#securityPreset').value === 'restricted' ? 'strict' : 'workspace'; });
  $('#reasoningPreset').addEventListener('change', () => { $('#reasoningInput').checked = $('#reasoningPreset').value === 'visible'; });
  $('#reasoningInput').addEventListener('change', () => { $('#reasoningPreset').value = $('#reasoningInput').checked ? 'visible' : 'hidden'; });

  document.querySelectorAll('[data-menu]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const menu = $(`[data-app-menu="${button.dataset.menu}"]`); const open = !menu.classList.contains('open'); closeFloating(menu); menu.classList.toggle('open', open); menu.classList.toggle('hidden', !open); }));
  document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => runCommand(button.dataset.command)));
  document.querySelectorAll('.settings-nav-item').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); if (button.dataset.settingsPage) setSettingsPage(button.dataset.settingsPage); }));
  document.querySelectorAll('[data-go-page]').forEach((control) => control.addEventListener('click', (event) => { event.preventDefault(); setSettingsPage(control.dataset.goPage); }));
  document.querySelectorAll('[data-context-action]').forEach((button) => button.addEventListener('click', async () => {
    const action = button.dataset.contextAction; closeFloating();
    if (action === 'media') await selectFiles();
    if (action === 'mention') { $('#promptInput').value += `@${folderName(state.workspace)} `; $('#promptInput').focus(); }
    if (action === 'action') { $('#promptInput').value += '/'; $('#promptInput').focus(); }
    if (action === 'browser') { $('#promptInput').value += '/browser '; $('#promptInput').focus(); toast('Опишите, что нужно найти в браузере'); }
    render();
  }));
  $('#commandSearch').addEventListener('input', () => renderCommandPalette($('#commandSearch').value));
  $('#commandSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { const selected = $('.command-item.selected'); if (selected) { event.preventDefault(); $('#commandPalette').close(); runCommand(selected.dataset.paletteCommand); } } });

  const input = $('#promptInput');
  input.addEventListener('input', () => { input.style.height = input.value ? 'auto' : '44px'; if (input.value) input.style.height = `${Math.min(input.scrollHeight, 220)}px`; updateSendButton(); if (input.value.startsWith('/') && !input.value.includes('\n')) showSlashMenu(input.value); else $('#slashMenu').classList.add('hidden'); handleMentionInput(); });
  input.addEventListener('paste', pasteClipboardImage);
  input.addEventListener('keydown', (event) => {
  if (mentionQuery !== null && !$('#mentionPopover').classList.contains('hidden')) {
    if (event.key === 'ArrowDown') { event.preventDefault(); mentionSelectedIndex = Math.min(mentionSelectedIndex + 1, mentionResults.length - 1); showMentionPopover(); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); mentionSelectedIndex = Math.max(mentionSelectedIndex - 1, 0); showMentionPopover(); return; }
    if (event.key === 'Enter') { event.preventDefault(); selectMention(mentionResults[mentionSelectedIndex]); return; }
  }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendPrompt(); }
});
  document.addEventListener('click', (event) => { if (!event.target.closest('.popover') && !event.target.closest('#workspacePicker,#modelButton,#attachButton') && !event.target.closest('.titlebar-drag')) closeFloating(); });
  document.addEventListener('mouseover', (event) => { const target = event.target.closest('[title], [data-tooltip]'); if (target) showTooltip(target); });
  document.addEventListener('mouseout', (event) => { const target = event.target.closest('[data-tooltip]'); if (target && !target.contains(event.relatedTarget)) hideTooltip(); });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'b') { event.preventDefault(); toggleSidebar(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); newConversation(); }
    if (event.ctrlKey && event.key === ',') { event.preventDefault(); openSettings('general'); }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') { event.preventDefault(); openCommandPalette(); }
    if (event.key === 'Escape') closeFloating();
  });

  api.onAgentUpdate(handleAgentUpdate);
  api.onAgentContext(({ conversationId, context }) => {
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !context) return;
    conversation.contextUsage = context.usageTokens; conversation.contextLimit = context.maxTokens; conversation.compressionCount = context.compressionCount || 0; conversation.contextUpdatedAt = new Date().toISOString(); persist(); if (conversationId === state.activeId) renderContextIndicator();
  });
  api.onShortcut((shortcut) => { if (shortcut === 'toggle-sidebar') toggleSidebar(); });
  api.onAgentChoice(({ requestId, question, options }) => { state.pendingChoiceId = requestId; const [title, ...details] = String(question).split('\n'); const hasOptions = options.length > 0; $('#inlineChoiceQuestion').textContent = title; $('#inlineChoiceContext').textContent = details.join('\n'); $('#inlineChoiceContext').classList.toggle('hidden', !details.length); $('#inlineChoiceOptions').innerHTML = options.map((option, index) => `<button type="button" class="inline-choice-option" value="${escapeHtml(option)}"><kbd>${index + 1}</kbd><span>${escapeHtml(option)}</span></button>`).join(''); $('#inlineChoiceOptions').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => answerInlineChoice(button.value))); $('#inlineChoice').classList.toggle('permission-choice', hasOptions); $('.inline-choice-custom').classList.toggle('hidden', hasOptions); $('#inlineChoice').classList.remove('hidden'); $('#inlineChoiceInput').placeholder = 'Введите ответ агенту'; if (!hasOptions) setTimeout(() => $('#inlineChoiceInput').focus(), 50); });
  $('#sendChoice').addEventListener('click', (event) => { event.preventDefault(); const choice = $('#customChoice').value.trim(); if (choice && state.pendingChoiceId) api.answerChoice(state.pendingChoiceId, choice); $('#choiceDialog').close(); });
  $('#inlineChoiceSend').addEventListener('click', () => answerInlineChoice($('#inlineChoiceInput').value.trim()));
  $('#inlineChoiceInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); answerInlineChoice(event.currentTarget.value.trim()); } });
  initSidebarResize();
}

async function bootstrap() {
  const data = await api.bootstrap();
  state.settings = data.settings;
  state.conversations = (data.conversations || []).filter((conversation) => !isEmptyConversation(conversation));
  state.workspace = data.workspace;
  state.workspaceLaunchers = await api.getWorkspaceLaunchers();
  state.availableTools = data.tools || [];
  
  if ($('#appPlatformText')) {
    let platformName = data.platform === 'win32' ? 'Windows' : data.platform === 'darwin' ? 'macOS' : data.platform === 'linux' ? 'Linux' : data.platform;
    $('#appPlatformText').textContent = `${platformName} ${data.osRelease || ''} ${data.arch || ''}`.trim();
  }
  if ($('#appHomeDirText')) {
    $('#appHomeDirText').textContent = data.homeDir || '';
  }
  const openDataDirBtn = $('#openDataDirButton');
  if (openDataDirBtn && data.homeDir) {
    openDataDirBtn.addEventListener('click', (e) => { e.preventDefault(); api.openPath(data.homeDir); });
  }
  const openSourceCodeBtn = $('#openSourceCodeButton');
  if (openSourceCodeBtn) {
    openSourceCodeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const tempLink = document.createElement('a');
      tempLink.href = 'https://github.com/Xani4kaGitHub/XaCodeApp';
      tempLink.target = '_blank';
      tempLink.click();
    });
  }

  const explorerLauncher = state.workspaceLaunchers.find((launcher) => launcher.id === 'explorer');
  if (explorerLauncher?.icon) $('#openProjectButton').innerHTML = `<img src="${explorerLauncher.icon}" alt="Проводник" />`;
  state.activeId = state.conversations[0]?.id || null;
  bindEvents();
  document.documentElement.style.setProperty('--sidebar-width', `${state.sidebarWidth}px`);
  if (localStorage.getItem('xacode.sidebarCollapsed') === 'true') setSidebarCollapsed(true);
  render();
  if (!state.settings.apiKey) setTimeout(() => openSettings('models'), 300);
}

bootstrap().catch((error) => toast(`Не удалось запустить XaCode: ${error.message}`));
let mentionQuery = null;
let mentionResults = [];
let mentionSelectedIndex = 0;

async function handleMentionInput() {
  const input = $('#promptInput');
  const val = input.value;
  const cursor = input.selectionStart;
  const beforeCursor = val.slice(0, cursor);
  
  const match = beforeCursor.match(/(?:^|\s)@([^\s]*)$/);
  if (match) {
    mentionQuery = match[1];
    const workspace = activeConversation()?.workspace || state.workspace;
    if (workspace) {
      try {
        mentionResults = await api.searchFiles({ workspace, query: mentionQuery });
        mentionSelectedIndex = 0;
        showMentionPopover();
      } catch (err) {
        $('#mentionPopover').classList.add('hidden');
      }
    } else {
      $('#mentionPopover').classList.add('hidden');
    }
  } else {
    $('#mentionPopover').classList.add('hidden');
    mentionQuery = null;
  }
}

function showMentionPopover() {
  const menu = $('#mentionPopover');
  if (!mentionResults.length) {
    menu.classList.add('hidden');
    return;
  }
  menu.innerHTML = mentionResults.map((file, index) => `<button type="button" class="mention-option ${index === mentionSelectedIndex ? 'active' : ''}" data-mention-index="${index}"><i class="ph-bold ph-file-code"></i><span>${escapeHtml(file.replace(/^.*[\\\\\\/]/, ''))}</span><small>${escapeHtml(file)}</small></button>`).join('');
  menu.classList.remove('hidden');
  menu.querySelectorAll('.mention-option').forEach(btn => {
    btn.addEventListener('click', () => {
      selectMention(mentionResults[Number(btn.dataset.mentionIndex)]);
    });
  });
  
  // Position it above the composer
  const rect = $('#composer').getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.bottom = `${window.innerHeight - rect.top + 10}px`;
}

function selectMention(filePath) {
  if (!state.attachments.some(item => item.path === filePath)) {
    state.attachments.push({ path: filePath, image: false });
    renderAttachments();
  }
  const input = $('#promptInput');
  const val = input.value;
  const cursor = input.selectionStart;
  const beforeCursor = val.slice(0, cursor);
  const afterCursor = val.slice(cursor);
  const newBefore = beforeCursor.replace(/(^|\s)@[^\s]*$/, '$1');
  input.value = newBefore + afterCursor;
  input.selectionStart = input.selectionEnd = newBefore.length;
  $('#mentionPopover').classList.add('hidden');
  mentionQuery = null;
}
