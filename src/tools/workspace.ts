import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'release', '.xacode', '.venv']);

export async function inspectWorkspace(targetPath = process.cwd(), depth = 2) {
  const root = path.resolve(targetPath);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(root)) throw new Error(`Workspace inspection outside the sandbox is forbidden: ${root}`);
  const entries: string[] = [];

  async function walk(directory: string, level: number) {
    if (level > Math.min(Math.max(depth, 0), 4) || entries.length >= 500) return;
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(child.name) || child.name.startsWith('release-')) continue;
      const fullPath = path.join(directory, child.name);
      const relative = path.relative(root, fullPath).replace(/\\/g, '/');
      entries.push(child.isDirectory() ? `${relative}/` : relative);
      if (child.isDirectory()) await walk(fullPath, level + 1);
      if (entries.length >= 500) break;
    }
  }
  await walk(root, 0);

  let packageInfo: any = null;
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    packageInfo = { name: pkg.name, version: pkg.version, scripts: pkg.scripts || {}, dependencies: Object.keys(pkg.dependencies || {}), devDependencies: Object.keys(pkg.devDependencies || {}) };
  } catch {}

  let git: any = null;
  const gitResult = spawnSync('git', ['status', '--short', '--branch'], { cwd: root, encoding: 'utf8', windowsHide: true, shell: false });
  if (!gitResult.error && gitResult.status === 0) git = { status: gitResult.stdout.trim().split(/\r?\n/).filter(Boolean).slice(0, 200) };

  return { root, entries, truncated: entries.length >= 500, package: packageInfo, git };
}
