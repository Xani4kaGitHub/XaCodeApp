const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { securityManager } = require('../dist/security');
const { permissionSystem } = require('../dist/security/PermissionSystem');
const { validateCommandSandbox } = require('../dist/terminal');
const { handleArchive } = require('../dist/tools/archive');

const policy = (overrides = {}) => ({
  sandboxMode: 'workspace', terminal: 'allow', fileRead: 'allow', fileWrite: 'allow', network: 'allow',
  allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], ...overrides,
});

(async () => {
  const workspace = path.resolve(process.cwd(), 'sandbox', 'security-smoke');
  assert(workspace.startsWith(path.resolve(process.cwd()) + path.sep));
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.mkdirSync(workspace, { recursive: true });
  securityManager.setSandboxDir(workspace);
  permissionSystem.configure(workspace, policy(), policy());

  assert.throws(() => validateCommandSandbox('Get-ChildItem C:\\Windows', workspace), /outside/);
  assert.throws(() => validateCommandSandbox('Get-ChildItem ..\\outside', workspace), /Parent-directory/);
  validateCommandSandbox(`Get-ChildItem "${workspace}"`, workspace);
  validateCommandSandbox(`Get-ChildItem "${path.join(workspace, 'space dir')}"`, workspace);

  permissionSystem.configure(workspace, policy(), policy({ fileWrite: 'deny' }));
  assert.strictEqual(await permissionSystem.authorizeTool('undo_file', { targetPath: path.join(workspace, 'file.txt') }), false);

  const allowedRoot = path.join(workspace, 'safe');
  permissionSystem.configure(workspace, policy(), policy({ fileRead: 'deny', fileRules: [{ access: 'read', effect: 'allow', path: allowedRoot }] }));
  assert.strictEqual(await permissionSystem.authorizeTool('read_file', { targetPath: path.join(allowedRoot, 'file.txt') }), true);
  assert.strictEqual(await permissionSystem.authorizeTool('read_file', { targetPath: `${allowedRoot}-other\\file.txt` }), false);

  permissionSystem.configure(workspace, policy(), policy());
  fs.writeFileSync(path.join(workspace, 'input.txt'), 'archive smoke', 'utf8');
  await handleArchive({ action: 'compress', sources: ['input.txt'], output: 'output.zip', format: 'zip' }, workspace);
  await handleArchive({ action: 'extract', source: 'output.zip', destination: 'extracted' }, workspace);
  assert.strictEqual(fs.readFileSync(path.join(workspace, 'extracted', 'input.txt'), 'utf8'), 'archive smoke');
  await assert.rejects(() => handleArchive({ action: 'extract', source: path.resolve(workspace, '..', 'outside.zip') }, workspace), /outside/);

  permissionSystem.configure(workspace, policy(), policy({ sandboxMode: 'full', disabledTools: ['db_query'] }));
  const fullContext = permissionSystem.captureContext();
  permissionSystem.configure(workspace, policy(), policy({ sandboxMode: 'workspace', disabledTools: ['docker'] }));
  const restrictedContext = permissionSystem.captureContext();
  const [fullResult, restrictedResult] = await Promise.all([
    permissionSystem.runWithContext(fullContext, async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return { full: permissionSystem.isFullAccess(), tools: permissionSystem.getDisabledTools() }; }),
    permissionSystem.runWithContext(restrictedContext, async () => { await new Promise((resolve) => setTimeout(resolve, 1)); return { full: permissionSystem.isFullAccess(), tools: permissionSystem.getDisabledTools() }; }),
  ]);
  assert.deepStrictEqual(fullResult, { full: true, tools: ['db_query'] });
  assert.deepStrictEqual(restrictedResult, { full: false, tools: ['docker'] });

  fs.rmSync(workspace, { recursive: true, force: true });
  console.log(JSON.stringify({ commandSandbox: true, undoPermission: true, pathBoundary: true, archive: true, isolatedPermissionContexts: true }));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
