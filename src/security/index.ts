import { config } from '../config';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';

export class SecurityManager {
  private sandboxDir: string;
  private readonly sandboxContexts = new AsyncLocalStorage<string>();

  constructor() {
    this.sandboxDir = path.resolve(config.SANDBOX_DIR);
  }

  setSandboxDir(dir: string) {
    this.sandboxDir = path.resolve(dir);
  }

  runWithSandbox<T>(dir: string, task: () => T): T {
    return this.sandboxContexts.run(path.resolve(dir), task);
  }

  /**
   * Ensures the given file path is within the sandbox directory.
   */
  isPathAllowed(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath);
    const sandboxDir = this.sandboxContexts.getStore() || this.sandboxDir;
    // Ensure the path is exactly the sandbox dir or is inside it
    if (resolvedPath === sandboxDir) return true;
    return resolvedPath.startsWith(sandboxDir + path.sep);
  }

  /**
   * Validates if a shell command is safe to run.
   */
  isCommandAllowed(command: string): boolean {
    const lowerCmd = command.toLowerCase().trim();

    // Blacklisted commands
    const blacklisted = [
      'rm -rf /',
      'mkfs',
      'dd if=',
      ':(){ :|:& };:', // fork bomb
      '> /dev/sda'
    ];

    for (const b of blacklisted) {
      if (lowerCmd.includes(b)) {
        return false;
      }
    }

    return true;
  }
}

export const securityManager = new SecurityManager();
