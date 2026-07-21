import * as fs from 'fs';
import * as path from 'path';

// Simplified search to get files fast for mentions
export async function searchFiles(dir: string, query: string, limit = 20): Promise<{name: string, path: string}[]> {
  const results: {name: string, path: string}[] = [];
  const queryLower = query.toLowerCase();

  async function walk(currentDir: string) {
    if (results.length >= limit) return;
    
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.xacode'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        const nameLower = entry.name.toLowerCase();
        if (nameLower.includes(queryLower)) {
          results.push({ name: entry.name, path: fullPath });
        }
      }
    }
  }

  await walk(dir);
  return results;
}
