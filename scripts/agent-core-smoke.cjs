const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { securityManager } = require('../dist/security');
const { permissionSystem } = require('../dist/security/PermissionSystem');
const { executeTool, getEnabledToolDefinitions, validateToolArguments } = require('../dist/tools');
const { eventBus, EVENTS } = require('../dist/events/EventBus');
require('../dist/agent/ProtectionSystem');

const policy = (overrides = {}) => ({
  sandboxMode: 'workspace', terminal: 'allow', fileRead: 'allow', fileWrite: 'allow', network: 'allow',
  allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [], ...overrides,
});

(async () => {
  const workspace = path.resolve(process.cwd(), 'sandbox', 'agent-core-smoke');
  assert(workspace.startsWith(path.resolve(process.cwd()) + path.sep));
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'sample.txt'), 'one\ntwo\nthree\n', 'utf8');
  securityManager.setSandboxDir(workspace);
  permissionSystem.configure(workspace, policy(), policy({ disabledTools: ['docker', 'archive'] }));
  process.chdir(workspace);

  const enabled = getEnabledToolDefinitions(permissionSystem.getDisabledTools()).map((tool) => tool.function.name);
  assert(!enabled.includes('docker') && !enabled.includes('archive'));
  assert(enabled.includes('finish_task'));
  assert.strictEqual(validateToolArguments('read_file', { targetPath: 'sample.txt', unexpected: true }).valid, false);

  const readResult = JSON.parse(await executeTool('read_file', { targetPath: 'sample.txt', startLine: 2, endLine: 3 }));
  assert.strictEqual(readResult.ok, true);
  assert(readResult.data[0].content.includes('2: two'));

  const inspectResult = JSON.parse(await executeTool('inspect_workspace', { targetPath: workspace, depth: 1 }));
  assert.strictEqual(inspectResult.ok, true);
  assert(inspectResult.data.entries.includes('sample.txt'));

  const server = http.createServer((_request, response) => response.end('download smoke'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const downloadResult = JSON.parse(await executeTool('http_download', { url: `http://127.0.0.1:${address.port}/file`, destination: 'downloaded.txt', maxBytes: 1024 }));
  await new Promise((resolve) => server.close(resolve));
  assert.strictEqual(downloadResult.ok, true);
  assert.strictEqual(fs.readFileSync(path.join(workspace, 'downloaded.txt'), 'utf8'), 'download smoke');

  const dbPath = path.join(workspace, 'smoke.sqlite');
  assert.strictEqual(JSON.parse(await executeTool('db_query', { dbPath, query: 'CREATE TABLE values_test (value TEXT)' })).ok, true);
  assert.strictEqual(JSON.parse(await executeTool('db_query', { dbPath, query: "INSERT INTO values_test VALUES ('ready')" })).ok, true);
  const queryResult = JSON.parse(await executeTool('db_query', { dbPath, query: 'SELECT value FROM values_test' }));
  assert.deepStrictEqual(queryResult.data.rows, [{ value: 'ready' }]);

  const finishResult = JSON.parse(await executeTool('finish_task', { summary: 'Smoke complete' }));
  assert.strictEqual(finishResult.ok, true);
  let protectionTriggered = false;
  eventBus.on(EVENTS.PROTECTION_HALT_EXECUTION, ({ chatId }) => { if (chatId === 4242) protectionTriggered = true; });
  await eventBus.emit(EVENTS.TASK_STARTED, { chatId: 4242 });
  for (let index = 0; index < 50; index += 1) await eventBus.emit(EVENTS.TOOL_EXECUTED, { chatId: 4242, name: 'smoke' });
  assert.strictEqual(protectionTriggered, true);
  process.chdir(path.resolve(workspace, '..', '..'));
  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(JSON.stringify({ dynamicTools: true, validation: true, structuredResults: true, readRanges: true, inspectWorkspace: true, httpDownload: true, sqlite: true, finishTask: true, protectionSystem: true }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
