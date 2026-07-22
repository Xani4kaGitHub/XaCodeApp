import path from 'path';
import { securityManager } from '../security';
import { permissionSystem } from '../security/PermissionSystem';

export function querySqlite(dbPath: string, query: string) {
  const resolvedPath = path.resolve(dbPath);
  if (!permissionSystem.isFullAccess() && !securityManager.isPathAllowed(resolvedPath)) throw new Error(`Database path is outside the selected project sandbox: ${resolvedPath}`);
  
  const cleanedQuery = query
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .toUpperCase();

  if (/\bATTACH\b/.test(cleanedQuery) || /\bDETACH\b/.test(cleanedQuery)) {
    throw new Error('SQLite Sandbox Protection: Использование команд ATTACH/DETACH запрещено в целях безопасности.');
  }

  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: new (file: string) => any };
  const database = new DatabaseSync(resolvedPath);
  try {
    const statement = database.prepare(query);
    const returnsRows = statement.columns().length > 0;
    return returnsRows ? { rows: statement.all() } : { changes: statement.run().changes };
  } finally {
    database.close();
  }
}
