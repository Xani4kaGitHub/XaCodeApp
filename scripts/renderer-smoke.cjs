const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- Running UI & Renderer Smoke Tests ---');

const projectRoot = path.join(__dirname, '..');
const rendererJsPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'renderer.js');
const indexHtmlPath = path.join(projectRoot, 'src', 'desktop', 'renderer', 'index.html');

// 1. Check renderer.js syntax
try {
  execSync(`node -c "${rendererJsPath}"`, { cwd: projectRoot, encoding: 'utf8' });
  console.log('✅ renderer.js syntax check passed.');
} catch (e) {
  console.error('❌ renderer.js syntax check failed:', e.message);
  process.exit(1);
}

// 2. Check for required global functions in renderer.js
const rendererCode = fs.readFileSync(rendererJsPath, 'utf8');
const requiredFunctions = [
  'bindEvents',
  'syncInlineChoiceVisibility',
  'notifyConversation',
  'handleAgentUpdate',
  'openSettings',
  'renderTeamSettings',
  'validateTeamSettings',
  'duplicateModelProfile',
  'sendPrompt',
  'newConversation',
  'render'
];

for (const fnName of requiredFunctions) {
  const fnRegex = new RegExp(`function\\s+${fnName}\\s*\\(`);
  if (!fnRegex.test(rendererCode)) {
    console.error(`❌ Critical function missing in renderer.js: ${fnName}`);
    process.exit(1);
  }
}
console.log(`✅ All ${requiredFunctions.length} critical UI functions verified in renderer.js.`);

const saveDraftStart = rendererCode.indexOf('function saveModelProfileDraft(');
const duplicateStart = rendererCode.indexOf('function duplicateModelProfile(');
const sidebarStart = rendererCode.indexOf('function setSidebarCollapsed(', duplicateStart);
const saveDraftCode = rendererCode.slice(saveDraftStart, duplicateStart);
const duplicateCode = rendererCode.slice(duplicateStart, sidebarStart);
if (!saveDraftCode.includes('if (persistDraft) void api.saveSettings(state.settings);')) {
  console.error('❌ Model draft persistence guard is missing.');
  process.exit(1);
}
if (!duplicateCode.includes('void api.saveSettings(state.settings);') || duplicateCode.includes('if (persistDraft)')) {
  console.error('❌ Duplicated model profile is not persisted safely.');
  process.exit(1);
}
console.log('✅ Model profile duplication persistence verified.');

// 3. Verify DOM IDs in renderer.js exist in index.html
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const htmlIds = new Set();
const idRegex = /id="([a-zA-Z0-9_-]+)"/g;
let m;
while ((m = idRegex.exec(indexHtmlContent)) !== null) {
  htmlIds.add(m[1]);
}

const selectorIdRegex = /\$('#([a-zA-Z0-9_-]+)')/g;
const missingDomIds = new Set();
while ((m = selectorIdRegex.exec(rendererCode)) !== null) {
  const id = m[1];
  if (!htmlIds.has(id)) {
    missingDomIds.add(id);
  }
}

if (missingDomIds.size > 0) {
  console.error('❌ Missing DOM IDs in index.html referenced by renderer.js:', Array.from(missingDomIds));
  process.exit(1);
}

console.log('✅ DOM ID selectors 100% in sync with index.html.');
console.log('🎉 UI & Renderer Smoke Tests completed successfully!');
