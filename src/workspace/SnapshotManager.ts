import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger';
import { workspaceStatePath } from '../config/paths';

const execFileAsync = promisify(execFile);

export class SnapshotManager {
  private snapshotsDir: string;

  constructor() {
    this.snapshotsDir = workspaceStatePath(process.cwd(), 'snapshots');
  }

  async init() {
    try {
      await fs.mkdir(this.snapshotsDir, { recursive: true });
    } catch (e) {}
  }

  async createSnapshot(taskId: string, description: string): Promise<string | null> {
    const snapshotName = `${taskId}_${Date.now()}`;
    const snapshotPath = path.join(this.snapshotsDir, snapshotName);

    try {
      await fs.mkdir(snapshotPath, { recursive: true });
      // In a real system we might copy modified files or use `git stash` / `git commit`
      // For a generalized snapshot, we rely on git if available
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--binary'], {
          cwd: process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
        });
        await fs.writeFile(path.join(snapshotPath, 'diff.patch'), stdout, 'utf8');
      } catch (e) {
        logger.warn('Git diff failed during snapshot (maybe not a git repo)');
      }

      await fs.writeFile(path.join(snapshotPath, 'meta.json'), JSON.stringify({ description, timestamp: Date.now() }));
      logger.info(`Created snapshot: ${snapshotName}`);
      return snapshotName;
    } catch (e: any) {
      logger.error('Failed to create snapshot:', e.message);
      return null;
    }
  }

  async rollbackSnapshot(snapshotName: string): Promise<boolean> {
    logger.warn(`Attempting to rollback to snapshot: ${snapshotName}`);
    const snapshotPath = path.join(this.snapshotsDir, snapshotName);
    const patchPath = path.join(snapshotPath, 'diff.patch');

    try {
      const stat = await fs.stat(patchPath);
      if (stat.isFile()) {
        await execFileAsync('git', ['apply', '-R', '--', patchPath], { cwd: process.cwd() });
        logger.info(`Successfully rolled back using snapshot patch: ${snapshotName}`);
        return true;
      }
    } catch (e) {
      logger.error('Rollback failed (patch not found or apply failed):', String(e));
    }
    return false;
  }
}

export const snapshotManager = new SnapshotManager();
