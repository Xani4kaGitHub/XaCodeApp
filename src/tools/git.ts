import { execFileSync } from 'child_process';
import path from 'path';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

export interface GitOptions {
  action: 'status' | 'commit' | 'diff' | 'log' | 'branch';
  message?: string;
  path?: string;
  maxCount?: number;
}

export async function handleGit(args: GitOptions, basePath: string = process.cwd()): Promise<any> {
  const { action, message, path: targetPath, maxCount } = args;
  const resolvedBasePath = path.resolve(basePath);

  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolvedBasePath)) {
    throw new Error(`Git base path is outside the selected project sandbox: ${resolvedBasePath}`);
  }

  if (targetPath) {
    const resolvedTargetPath = path.resolve(resolvedBasePath, targetPath);
    if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolvedTargetPath)) {
      throw new Error(`Git target path is outside the selected project sandbox: ${resolvedTargetPath}`);
    }
  }

  const runGit = (gitArgs: string[]): string => {
    try {
      return execFileSync('git', gitArgs, { cwd: resolvedBasePath, encoding: 'utf8', stdio: 'pipe', shell: false }).trim();
    } catch (e: any) {
      throw new Error(`Git command failed: ${e.message}\nOutput: ${e.stdout?.toString() || ''}\nError: ${e.stderr?.toString() || ''}`);
    }
  };

  if (action === 'status') {
    const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    const statusLines = runGit(['status', '-s']).split('\n').filter(Boolean);

    const modified: string[] = [];
    const staged: string[] = [];
    const untracked: string[] = [];

    for (const line of statusLines) {
      const code = line.substring(0, 2);
      const file = line.substring(3).trim();

      if (code === '??') untracked.push(file);
      else if (code[0] !== ' ' && code[0] !== '?') staged.push(file);
      else if (code[1] !== ' ' && code[1] !== '?') modified.push(file);
    }

    let behind = 0;
    try {
      runGit(['fetch']);
      const tracking = runGit(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
      behind = parseInt(tracking.split('\t')[1], 10);
    } catch (e) {}

    return { branch, modified, staged, untracked, behind };
  }

  if (action === 'commit') {
    if (!message) throw new Error("Commit message is required.");
    const out = runGit(['commit', '-a', '-m', message]);
    return out;
  }

  if (action === 'diff') {
    const diffArgs = ['diff', 'HEAD'];
    if (targetPath) diffArgs.push(targetPath);
    return runGit(diffArgs);
  }

  if (action === 'log') {
    const count = Math.max(1, Math.min(100, Number(maxCount) || 5));
    const logStr = runGit(['log', '-n', String(count), '--pretty=format:%h|%an|%ar|%s']);
    return logStr.split('\n').filter(Boolean).map(line => {
      const [hash, author, time, msg] = line.split('|');
      return { hash, author, time, message: msg };
    });
  }

  if (action === 'branch') {
    return runGit(['branch', '-a']);
  }

  throw new Error("Invalid git action.");
}
