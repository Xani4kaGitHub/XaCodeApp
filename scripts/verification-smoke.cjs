const assert = require('assert');
const path = require('path');
const { securityManager } = require('../dist/security');
const { permissionSystem } = require('../dist/security/PermissionSystem');
const { verificationPipeline } = require('../dist/agent/VerificationPipeline');

const root = path.resolve(__dirname, '..');
const policy = { sandboxMode: 'workspace', terminal: 'allow', fileRead: 'allow', fileWrite: 'allow', network: 'allow', allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [] };
securityManager.setSandboxDir(root);
permissionSystem.configure(root, policy, policy);

verificationPipeline.runVerification(root, 9001).then((result) => {
  assert.strictEqual(result.success, true, result.output);
  console.log(JSON.stringify({ verificationPipeline: true }));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
