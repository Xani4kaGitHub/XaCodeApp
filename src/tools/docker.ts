import { spawnSync } from 'child_process';
import path from 'path';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

export interface DockerOptions {
  action: 'ps' | 'logs' | 'compose';
  container?: string;
  lines?: number;
  composeAction?: 'config' | 'ps' | 'up' | 'down' | 'build' | 'pull' | 'restart' | 'logs';
  services?: string[];
  detached?: boolean;
}

function runDocker(args: string[], cwd: string) {
  const result = spawnSync('docker', args, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
  if (result.error) throw new Error(`Docker is unavailable: ${result.error.message}`);
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `Docker exited with code ${result.status}`).trim());
  return result.stdout.trim();
}

export async function handleDocker(args: DockerOptions, basePath: string = process.cwd()): Promise<any> {
  const cwd = path.resolve(basePath);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(cwd)) throw new Error(`Docker working directory is outside the sandbox: ${cwd}`);
  runDocker(['--version'], cwd);

  if (args.action === 'ps') {
    const output = runDocker(['ps', '--format', '{{json .}}'], cwd);
    return output.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  if (args.action === 'logs') {
    if (!args.container) throw new Error('Container name/id is required for logs.');
    return runDocker(['logs', '--tail', String(Math.min(Math.max(args.lines || 50, 1), 5000)), args.container], cwd);
  }
  if (args.action === 'compose') {
    if (!args.composeAction) throw new Error('composeAction is required.');
    const composeArgs = ['compose', args.composeAction];
    if (args.detached && args.composeAction === 'up') composeArgs.push('-d');
    composeArgs.push(...(args.services || []));
    return runDocker(composeArgs, cwd);
  }
  throw new Error('Invalid Docker action.');
}
