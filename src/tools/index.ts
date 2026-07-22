import { readFile, writeFile, editFile, listDirectory, searchCode, findFiles, readFiles, runInBackground, getTaskOutput, deleteFile, fileInfo, manageBackgroundTask, applyPatchToFile, renameFile, createDirectory } from './fs';
import { terminalManager } from '../terminal';
import { webSearch, readUrl } from './search';
import { interactiveShell } from './shell';
import { manageTodos } from './todos';
import { askUserChoice } from '../events/interaction';
import { httpDownload, httpRequest } from './http';
import { readLints } from './lint';
import { handleArchive } from './archive';
import { handleDocker } from './docker';
import { handleGit } from './git';
import { permissionSystem } from '../security/PermissionSystem';
import { inspectWorkspace } from './workspace';
import { querySqlite } from './db';
import { webBrowser } from './webBrowser';
import { chromeNavigate, chromeGetContent, chromeClick, chromeType, chromeStatus, chromeScroll, chromeHighlight } from './chrome';
import Ajv, { ValidateFunction } from 'ajv';

// Define the tools for DeepSeek (OpenAI compatible format)
export const toolDefinitions: any[] = [
  {
    type: 'function',
    function: {
      name: 'web_browser',
      description: 'Open, browse, and fetch content from any website or search web pages directly without requiring Google Chrome extension.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The website URL to open and read' },
          search: { type: 'string', description: 'Optional web search query' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_navigate',
      description: 'Navigate user Google Chrome browser to a specific URL via XaCode Chrome Bridge extension (triggered via @chrome).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to open in Chrome' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_get_content',
      description: 'Get text content and URL of active tab in user Google Chrome browser via XaCode Chrome Bridge extension.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_click',
      description: 'Click on an element by CSS selector in user active Chrome tab via XaCode Chrome Bridge extension.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of element to click' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_type',
      description: 'Type text into an input element by CSS selector in user active Chrome tab via XaCode Chrome Bridge extension.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of input element' },
          text: { type: 'string', description: 'Text to type into input' }
        },
        required: ['selector', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_status',
      description: 'Check connection status of XaCode Chrome Bridge extension.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_scroll',
      description: 'Scroll active tab in user Google Chrome browser smoothly.',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['down', 'up'], description: 'Scroll direction (down or up)' },
          amount: { type: 'number', description: 'Pixels to scroll (default 400)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'chrome_highlight',
      description: 'Visually highlight an element by CSS selector in active Chrome tab.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to highlight' }
        },
        required: ['selector']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read one or multiple text files, optionally restricting a single file to an inclusive line range.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Path to one file' },
          paths: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20, description: 'Paths to multiple files' },
          startLine: { type: 'integer', minimum: 1, description: 'Optional first line for targetPath' },
          endLine: { type: 'integer', minimum: 1, description: 'Optional last line for targetPath' }
        },
        oneOf: [{ required: ['targetPath'] }, { required: ['paths'] }]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write new content to a file (overwrites if exists).',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'The path to the file' },
          content: { type: 'string', description: 'The exact content to write' }
        },
        required: ['targetPath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Edit a file by replacing a specific string with another.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'The path to the file' },
          search: { type: 'string', description: 'The exact string to find and replace' },
          replace: { type: 'string', description: 'The new string to replace it with' }
        },
        required: ['targetPath', 'search', 'replace']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the terminal.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The command to execute (PowerShell on Windows)' },
          cwd: { type: 'string', description: 'Optional. The working directory' },
          stdin: { type: 'string', description: 'Optional input to pipe via stdin' },
          timeoutMs: { type: 'number', description: 'Optional timeout in ms (default is from config)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'process_list',
      description: 'List running OS processes.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'db_query',
      description: 'Run a SQLite query using sqlite3 CLI.',
      parameters: {
        type: 'object',
        properties: {
          dbPath: { type: 'string', description: 'Path to sqlite database file' },
          query: { type: 'string', description: 'SQL query to execute' }
        },
        required: ['dbPath', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'undo_file',
      description: 'Restore the last backup of a file.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Path to the file to restore' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List contents of a directory.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'The path to the directory' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Search for a regex pattern within files.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search' },
          basePath: { type: 'string', description: 'Optional path to search in (default is current)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description: 'Find files by glob pattern.',
      parameters: {
        type: 'object',
        properties: {
          globPattern: { type: 'string', description: 'Glob pattern like src/**/*.ts' },
          basePath: { type: 'string', description: 'Optional base path' }
        },
        required: ['globPattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_in_background',
      description: 'Run a shell command in the background.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to run' },
          cwd: { type: 'string', description: 'Optional working directory' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_task_output',
      description: 'Get the stdout and stderr of a background task.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'The task ID' }
        },
        required: ['taskId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'interactive_shell',
      description: 'Run commands in a persistent stateful shell session.',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID (null for a new session)' },
          command: { type: 'string', description: 'Command to execute in the session' },
          timeoutMs: { type: 'number', description: 'Optional wait time in ms (default 1500)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_todos',
      description: 'Manage a persistent todo list for the agent.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'list', 'complete', 'delete'], description: 'Action to perform' },
          textOrId: { type: 'string', description: 'Text of todo for "add", or ID for "complete"/"delete"' }
        },
        required: ['action'],
        allOf: [
          { if: { properties: { action: { enum: ['add', 'complete', 'delete'] } } }, then: { required: ['textOrId'] } }
        ]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a clarifying question or present a plan for approval. Execution will pause until the user responds.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question or plan to ask the user' }
        },
        required: ['question']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_user_choice',
      description: 'Ask the user a multiple choice question and wait for their response.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question to ask' },
          options: { type: 'array', items: { type: 'string' }, description: 'Array of choices/buttons' }
        },
        required: ['question', 'options']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'http_request',
      description: 'Make an HTTP/API request using native fetch.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
          url: { type: 'string', description: 'The URL to request' },
          headers: { type: 'object', additionalProperties: { type: 'string' }, description: 'Key-value pairs of headers' },
          body: { type: 'string', description: 'Optional request body string (JSON, etc.)' },
          timeoutMs: { type: 'number', description: 'Optional timeout in ms' }
        },
        required: ['method', 'url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory recursively.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'The path to delete' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description: 'Fetch and extract readable text from a web page URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The web page URL' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_info',
      description: 'Check if a file exists and get its metadata (size, type).',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'The path to the file or directory' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'manage_background_task',
      description: 'List, check status, or kill background tasks.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'kill', 'status'], description: 'Action to perform' },
          taskId: { type: 'string', description: 'The task ID (required for kill and status)' }
        },
        required: ['action'],
        allOf: [
          { if: { properties: { action: { enum: ['kill', 'status'] } } }, then: { required: ['taskId'] } }
        ]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_patch',
      description: 'Apply a unified diff patch to a file.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Path to the file to patch' },
          patchString: { type: 'string', description: 'The unified diff patch string' }
        },
        required: ['targetPath', 'patchString']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_lints',
      description: 'Run project diagnostics for TypeScript, Python, Rust, or Go and return structured output.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_file',
      description: 'Rename or move a file/directory.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path' },
          to: { type: 'string', description: 'Destination path' },
          overwrite: { type: 'boolean', description: 'Whether to overwrite the destination if it exists' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory recursively.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Path to the new directory' }
        },
        required: ['targetPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'archive',
      description: 'Extract or compress zip/tar.gz archives. Only supports .zip and .tar.gz.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['extract', 'compress'] },
          source: { type: 'string', description: 'File to extract' },
          sources: { type: 'array', items: { type: 'string' }, description: 'Files to compress' },
          destination: { type: 'string', description: 'Where to extract' },
          output: { type: 'string', description: 'Name of the output archive' },
          format: { type: 'string', enum: ['zip', 'tar.gz'] }
        },
        required: ['action'],
        allOf: [
          { if: { properties: { action: { const: 'extract' } } }, then: { required: ['source'] } },
          { if: { properties: { action: { const: 'compress' } } }, then: { required: ['sources', 'output'] } }
        ]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'docker',
      description: 'Run docker commands (ps, logs, compose). Use ONLY if docker is installed.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['ps', 'logs', 'compose'] },
          container: { type: 'string', description: 'Container id/name for logs' },
          lines: { type: 'number', description: 'Number of lines for logs' },
          composeAction: { type: 'string', enum: ['config', 'ps', 'up', 'down', 'build', 'pull', 'restart', 'logs'], description: 'Allowed docker compose operation' },
          services: { type: 'array', items: { type: 'string' }, maxItems: 20, description: 'Optional compose service names' },
          detached: { type: 'boolean', description: 'Run docker compose up in detached mode' }
        },
        required: ['action'],
        allOf: [
          { if: { properties: { action: { const: 'logs' } } }, then: { required: ['container'] } },
          { if: { properties: { action: { const: 'compose' } } }, then: { required: ['composeAction'] } }
        ]
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspect_workspace',
      description: 'Inspect the project tree, package scripts, dependencies, and concise Git status before planning changes.',
      parameters: {
        type: 'object',
        properties: {
          targetPath: { type: 'string', description: 'Workspace path, defaults to the current workspace' },
          depth: { type: 'integer', minimum: 0, maximum: 4, description: 'Directory tree depth, default 2' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'http_download',
      description: 'Download an HTTP or HTTPS file into the workspace with a strict size limit.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri', description: 'HTTP or HTTPS URL' },
          destination: { type: 'string', description: 'Destination path inside the workspace' },
          maxBytes: { type: 'integer', minimum: 1, maximum: 104857600, description: 'Maximum download size, default 25 MiB' }
        },
        required: ['url', 'destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'finish_task',
      description: 'Declare the task ready only after required edits and verification are complete. XaCode may run automatic verification before accepting completion.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', minLength: 1, description: 'Concise outcome for the user' },
          verification: { type: 'string', description: 'Checks already run and their outcome' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_operation',
      description: 'Run structured git operations. USE ONLY IF THE USER EXPLICITLY REQUESTED A GIT OPERATION. NEVER COMMIT OR PUSH WITHOUT PERMISSION.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'commit', 'diff', 'log', 'branch'] },
          message: { type: 'string', description: 'Commit message' },
          path: { type: 'string', description: 'Path for diff' },
          maxCount: { type: 'number', description: 'Max commits for log' }
        },
        required: ['action']
      }
    }
  }
];

const REQUIRED_TOOLS = new Set(['finish_task', 'ask_user', 'ask_user_choice']);
const TOOL_CATEGORIES: Record<string, string> = {
  read_file: 'files', write_file: 'files', edit_file: 'files', undo_file: 'files', list_directory: 'files', search_code: 'files', find_files: 'files', delete_file: 'files', file_info: 'files', apply_patch: 'files', rename_file: 'files', create_directory: 'files', archive: 'files', inspect_workspace: 'files',
  run_command: 'terminal', process_list: 'terminal', run_in_background: 'terminal', get_task_output: 'terminal', interactive_shell: 'terminal', manage_background_task: 'terminal', read_lints: 'terminal',
  db_query: 'database',
  web_search: 'network', http_request: 'network', read_url: 'network', http_download: 'network',
  docker: 'devops', git_operation: 'devops',
  manage_todos: 'agent', ask_user: 'agent', ask_user_choice: 'agent', finish_task: 'agent',
};
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validators = new Map<string, ValidateFunction>();

export function getToolCatalog() {
  return toolDefinitions.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    required: REQUIRED_TOOLS.has(tool.function.name),
    category: TOOL_CATEGORIES[tool.function.name] || 'other',
  }));
}

export function getEnabledToolDefinitions(disabledTools: string[] = [], enableChrome: boolean = false) {
  const disabled = new Set(disabledTools);
  if (!enableChrome) {
    ['chrome_navigate', 'chrome_get_content', 'chrome_click', 'chrome_type', 'chrome_status', 'chrome_scroll', 'chrome_highlight'].forEach((t) => disabled.add(t));
  }
  return toolDefinitions.filter((tool) => REQUIRED_TOOLS.has(tool.function.name) || !disabled.has(tool.function.name));
}

export function validateToolArguments(name: string, args: unknown): { valid: boolean; errors: string[] } {
  const definition = toolDefinitions.find((tool) => tool.function.name === name);
  if (!definition) return { valid: false, errors: [`Unknown tool: ${name}`] };
  let validator = validators.get(name);
  if (!validator) {
    validator = ajv.compile({ ...definition.function.parameters, additionalProperties: false });
    validators.set(name, validator);
  }
  const valid = validator(args);
  return { valid: Boolean(valid), errors: (validator.errors || []).map((error) => `${error.instancePath || 'arguments'} ${error.message}`) };
}

function structuredResult(ok: boolean, name: string, data?: unknown, error?: string) {
  const payload = ok ? { ok: true, tool: name, data } : { ok: false, tool: name, error: { message: error || 'Unknown error' } };
  const serialized = JSON.stringify(payload);
  if (serialized.length <= 16000) return serialized;
  if (!ok) return JSON.stringify({ ok: false, tool: name, error: { message: (error || 'Unknown error').slice(0, 15000), truncated: true } });
  const dataText = JSON.stringify(data);
  return JSON.stringify({ ok: true, tool: name, data: { truncated: true, originalCharacters: serialized.length, start: dataText.slice(0, 5000), end: dataText.slice(-9000) } });
}

// Execute the tool based on the name and arguments
export async function executeTool(name: string, args: any, chatId?: number, signal?: AbortSignal): Promise<string> {
  let result: unknown = null;
  try {
    if (signal?.aborted) {
      return structuredResult(false, name, undefined, 'USER_INTERRUPTED_EXECUTION');
    }
    const validation = validateToolArguments(name, args);
    if (!validation.valid) return structuredResult(false, name, undefined, `Invalid arguments: ${validation.errors.join('; ')}`);
    if (name === 'read_file' && args.paths) {
      for (const targetPath of args.paths) {
        if (!await permissionSystem.authorizeTool('read_file', { targetPath }, chatId)) return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
      }
    } else if (name === 'db_query') {
      const permissionTool = /^\s*(select|pragma|explain)\b/i.test(args.query) ? 'read_file' : 'write_file';
      if (!await permissionSystem.authorizeTool(permissionTool, { targetPath: args.dbPath }, chatId)) return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
    } else if (name === 'archive') {
      const readPaths: string[] = args.action === 'extract' ? [args.source].filter(Boolean) : (args.sources || []);
      const writePath = args.action === 'extract' ? (args.destination || '.') : args.output;
      for (const targetPath of readPaths) {
        if (!await permissionSystem.authorizeTool('read_file', { targetPath }, chatId)) return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
      }
      if (!writePath || !await permissionSystem.authorizeTool('write_file', { targetPath: writePath }, chatId)) return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
    } else if (name === 'http_download') {
      if (!await permissionSystem.authorizeTool('http_request', { url: args.url }, chatId)
        || !await permissionSystem.authorizeTool('write_file', { targetPath: args.destination }, chatId)) return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
    } else if (!await permissionSystem.authorizeTool(name, args, chatId)) {
      return structuredResult(false, name, undefined, 'PERMISSION_DENIED_BY_USER');
    }
    switch (name) {
      case 'read_file': {
        const paths: string[] = args.paths || [args.targetPath];
        const contents = await readFiles(paths);
        result = paths.map((filePath, index) => {
          let content = contents[index];
          if (paths.length === 1 && (args.startLine || args.endLine)) {
            const lines = content.split(/\r?\n/);
            const start = Math.max(1, args.startLine || 1);
            const end = Math.min(lines.length, args.endLine || lines.length);
            if (end < start) throw new Error('endLine must be greater than or equal to startLine.');
            content = lines.slice(start - 1, end).map((line, offset) => `${start + offset}: ${line}`).join('\n');
          }
          return { path: filePath, content };
        });
        break;
      }
      case 'write_file':
        result = await writeFile(args.targetPath, args.content);
        break;
      case 'edit_file':
        result = await editFile(args.targetPath, args.search, args.replace);
        break;
      case 'list_directory':
        const dir = await listDirectory(args.targetPath);
        result = dir.join('\n');
        break;
      case 'run_command':
        const termRes = await terminalManager.runCommand(args.command, args.cwd, args.stdin, signal, args.timeoutMs);
        result = `Exit Code: ${termRes.code}\nStdout:\n${termRes.stdout}\nStderr:\n${termRes.stderr}`;
        break;
      case 'search_code':
        const searchMatches = await searchCode(args.pattern, args.basePath);
        result = searchMatches.length > 0 ? searchMatches.join('\n') : 'No matches found.';
        break;
      case 'find_files':
        const globMatches = await findFiles(args.globPattern, args.basePath);
        result = globMatches.length > 0 ? globMatches.join('\n') : 'No files found.';
        break;
      case 'run_in_background':
        const taskId = runInBackground(args.command, args.cwd);
        result = `Background task started with ID: ${taskId}`;
        break;
      case 'get_task_output':
        const taskOut = getTaskOutput(args.taskId);
        if (taskOut) {
          result = `Stdout:\n${taskOut.stdout}\n\nStderr:\n${taskOut.stderr}`;
        } else {
          result = `Error: Task ID ${args.taskId} not found.`;
        }
        break;
      case 'web_search':
        result = await webSearch(args.query);
        break;
      case 'interactive_shell':
        result = await interactiveShell(args.sessionId || null, args.command, signal, args.timeoutMs);
        break;
      case 'manage_todos':
        result = await manageTodos(args.action, args.textOrId);
        break;
      case 'ask_user_choice':
        if (!chatId) throw new Error('chatId is required for interactive user choice');
        result = await askUserChoice(chatId, args.question, args.options);
        break;
      case 'ask_user':
        if (!chatId) throw new Error('chatId is required for an interactive question');
        result = await askUserChoice(chatId, args.question, []);
        break;
      case 'http_request':
        const httpRes = await httpRequest(args.method, args.url, args.headers, args.body, args.timeoutMs);
        result = httpRes;
        break;
      case 'http_download':
        result = await httpDownload(args.url, args.destination, args.maxBytes, signal);
        break;
      case 'delete_file':
        result = await deleteFile(args.targetPath);
        break;
      case 'read_url':
        result = await readUrl(args.url);
        break;
      case 'file_info':
        result = await fileInfo(args.targetPath);
        break;
      case 'manage_background_task':
        result = manageBackgroundTask(args.action, args.taskId);
        break;
      case 'apply_patch':
        result = await applyPatchToFile(args.targetPath, args.patchString);
        break;
      case 'read_lints':
        result = await readLints();
        break;
      case 'rename_file':
        result = await renameFile(args.from, args.to, args.overwrite);
        break;
      case 'create_directory':
        result = await createDirectory(args.targetPath);
        break;
      case 'archive':
        result = await handleArchive(args);
        break;
      case 'docker':
        result = await handleDocker(args);
        break;
      case 'git_operation':
        result = await handleGit(args);
        break;
      case 'inspect_workspace':
        result = await inspectWorkspace(args.targetPath, args.depth);
        break;
      case 'finish_task':
        result = { accepted: true, summary: args.summary, verification: args.verification || '' };
        break;
      case 'process_list': {
        const cmd = process.platform === 'win32' ? 'tasklist' : 'ps aux';
        const res = await terminalManager.runCommand(cmd, undefined, undefined, signal, 5000);
        result = res.stdout || res.stderr;
        break;
      }
      case 'db_query': {
        result = querySqlite(args.dbPath, args.query);
        break;
      }
      case 'undo_file': {
        const { undoFile } = await import('./fs');
        result = await undoFile(args.targetPath);
        break;
      }
      
      case 'chrome_navigate': {
        result = await chromeNavigate(args.url, signal);
        break;
      }
      case 'chrome_get_content': {
        result = await chromeGetContent(signal);
        break;
      }
      case 'chrome_click': {
        result = await chromeClick(args.selector, signal);
        break;
      }
      case 'chrome_type': {
        result = await chromeType(args.selector, args.text, signal);
        break;
      }
      case 'chrome_status': {
        result = chromeStatus();
        break;
      }
      case 'chrome_scroll': {
        result = await chromeScroll(args.direction || 'down', args.amount || 400, signal);
        break;
      }
      case 'chrome_highlight': {
        result = await chromeHighlight(args.selector, signal);
        break;
      }
      
      case 'web_browser': {
        result = await webBrowser(args.url || '', args.search);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    if (signal?.aborted || error.message?.includes('USER KILLED')) {
      return structuredResult(false, name, undefined, 'USER_INTERRUPTED_EXECUTION');
    }
    return structuredResult(false, name, undefined, error.message || String(error));
  }
  return structuredResult(true, name, result);
}
