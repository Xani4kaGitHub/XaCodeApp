import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

function run(executable: string, args: string[], cwd: string) {
  const useCommandInterpreter = process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd');
  const result = useCommandInterpreter
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [executable, ...args].join(' ')], { cwd, encoding: 'utf8', windowsHide: true, shell: false })
    : spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true, shell: false });
  return { exitCode: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || result.error?.message || '' };
}

export async function readLints(workspace = process.cwd()): Promise<any> {
  const cwd = path.resolve(workspace);
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    const result = run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit', '--pretty', 'false'], cwd);
    const diagnostics: any[] = [];
    const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm;
    for (const match of result.stdout.matchAll(regex)) diagnostics.push({ file: match[1], line: Number(match[2]), column: Number(match[3]), severity: match[4], code: match[5], message: match[6] });
    return { checker: 'typescript', ...result, diagnostics };
  }
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return { checker: 'cargo', ...run('cargo', ['check', '--message-format=short'], cwd) };
  if (fs.existsSync(path.join(cwd, 'go.mod'))) return { checker: 'go', ...run('go', ['vet', './...'], cwd) };
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt'))) return { checker: 'python', ...run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'compileall', '-q', '.'], cwd) };
  return { checker: 'none', exitCode: 0, stdout: '', stderr: '', diagnostics: [], message: 'No supported project manifest found.' };
}
