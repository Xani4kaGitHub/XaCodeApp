import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

export interface ArchiveOptions {
  action: 'extract' | 'compress';
  source?: string;
  sources?: string[];
  destination?: string;
  output?: string;
  format?: 'zip' | 'tar.gz';
}

function resolveAllowed(basePath: string, targetPath: string): string {
  const resolved = path.resolve(basePath, targetPath);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolved)) {
    throw new Error(`Archive path is outside the selected project sandbox: ${resolved}`);
  }
  return resolved;
}

function run(executable: string, args: string[], cwd: string): string {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${executable} exited with code ${result.status}`).trim());
  return result.stdout || '';
}

function archiveEntries(source: string, extension: string, cwd: string): string[] {
  const output = extension === '.zip' && process.platform !== 'win32'
    ? run('unzip', ['-Z1', source], cwd)
    : run('tar', ['-tf', source], cwd);
  return output.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function assertSafeEntries(entries: string[]) {
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, '/');
    if (path.posix.isAbsolute(normalized) || /^[a-zA-Z]:\//.test(normalized) || normalized.split('/').includes('..')) {
      throw new Error(`Archive contains an unsafe path: ${entry}`);
    }
  }
}

export async function handleArchive(args: ArchiveOptions, basePath: string = process.cwd()): Promise<any> {
  const resolvedBase = path.resolve(basePath);

  if (args.action === 'extract') {
    if (!args.source) throw new Error('Source file is required for extraction.');
    const source = resolveAllowed(resolvedBase, args.source);
    const destination = resolveAllowed(resolvedBase, args.destination || '.');
    const lowerSource = source.toLowerCase();
    const extension = lowerSource.endsWith('.tar.gz') || lowerSource.endsWith('.tgz') ? '.tar.gz' : path.extname(lowerSource);
    if (extension !== '.zip' && extension !== '.tar.gz') throw new Error('Unsupported archive format. Only .zip and .tar.gz are supported.');

    fs.mkdirSync(destination, { recursive: true });
    assertSafeEntries(archiveEntries(source, extension, resolvedBase));
    if (extension === '.zip' && process.platform !== 'win32') run('unzip', ['-o', source, '-d', destination], resolvedBase);
    else run('tar', ['-xf', source, '-C', destination], resolvedBase);
    return { status: 'success', message: `Extracted ${source} to ${destination}` };
  }

  if (args.action === 'compress') {
    if (!args.sources?.length) throw new Error('Sources are required for compression.');
    if (!args.output) throw new Error('Output file name is required for compression.');
    const sources = args.sources.map((source) => resolveAllowed(resolvedBase, source));
    const output = resolveAllowed(resolvedBase, args.output);
    const format = args.format || (output.toLowerCase().endsWith('.zip') ? 'zip' : 'tar.gz');
    if (format !== 'zip' && format !== 'tar.gz') throw new Error('Unsupported compression format. Use zip or tar.gz.');
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const relativeSources = sources.map((source) => path.relative(resolvedBase, source));
    if (format === 'zip') {
      if (process.platform === 'win32') run('tar', ['-a', '-cf', output, ...relativeSources], resolvedBase);
      else run('zip', ['-r', output, ...relativeSources], resolvedBase);
    } else {
      run('tar', ['-czf', output, ...relativeSources], resolvedBase);
    }
    return { status: 'success', message: `Compressed files to ${output}` };
  }

  throw new Error('Invalid action. Must be extract or compress.');
}
