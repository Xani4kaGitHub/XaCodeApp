import { config } from '../config';
import path from 'path';
import { askUserChoice } from '../events/interaction';
import type { PermissionMode, ProjectPermissions } from '../desktop/types';

export enum RiskLevel { SAFE = 'SAFE', MODERATE = 'MODERATE', DANGEROUS = 'DANGEROUS', BLOCKED = 'BLOCKED' }

const DEFAULT_POLICY: ProjectPermissions = { sandboxMode: 'workspace', terminal: 'ask', fileRead: 'allow', fileWrite: 'ask', network: 'ask', allowedCommands: [], deniedCommands: [], fileRules: [], commandRules: [], disabledTools: [] };

export class PermissionSystem {
  private fullAccessEnabled = false;
  private fullAccessTimeout: NodeJS.Timeout | null = null;
  private fullAccessExpiry = 0;
  private defaults: ProjectPermissions = { ...DEFAULT_POLICY };
  private project: ProjectPermissions = { ...DEFAULT_POLICY };
  private onPolicyChange?: (scope: 'project' | 'global', policy: ProjectPermissions) => void;

  configure(_workspace: string, defaults: ProjectPermissions, project?: Partial<ProjectPermissions>, onPolicyChange?: (scope: 'project' | 'global', policy: ProjectPermissions) => void) {
    this.defaults = { ...DEFAULT_POLICY, ...defaults };
    this.project = { ...DEFAULT_POLICY, ...project, allowedCommands: project?.allowedCommands || [], deniedCommands: project?.deniedCommands || [], fileRules: project?.fileRules || [], commandRules: project?.commandRules || [], disabledTools: project?.disabledTools || [] };
    this.onPolicyChange = onPolicyChange;
  }
  enableFullAccess(durationMs = 15 * 60 * 1000) { this.fullAccessEnabled = true; const duration = Math.min(durationMs, 2147483647); this.fullAccessExpiry = Date.now() + duration; if (this.fullAccessTimeout) clearTimeout(this.fullAccessTimeout); this.fullAccessTimeout = setTimeout(() => this.disableFullAccess(), duration); }
  disableFullAccess() { this.fullAccessEnabled = false; this.fullAccessExpiry = 0; if (this.fullAccessTimeout) clearTimeout(this.fullAccessTimeout); this.fullAccessTimeout = null; }
  isFullAccess() { return config.ALWAYS_FULL_ACCESS || this.fullAccessEnabled || this.project.sandboxMode === 'full'; }
  getFullAccessRemainingMinutes() { return config.ALWAYS_FULL_ACCESS ? Infinity : Math.max(0, Math.round((this.fullAccessExpiry - Date.now()) / 60000)); }
  getDisabledTools() { return [...this.project.disabledTools]; }
  assessCommandRisk(command: string): RiskLevel {
    const cmd = command.toLowerCase().trim();
    const blocked = ['mkfs', 'dd if=', ':(){ :|:& };:', '> /dev/sda', 'format c:', 'diskpart', 'cipher /w:', 'bcdedit /delete', 'remove-item c:\\ -recurse', 'del /s /q c:\\', 'rd /s /q c:\\'];
    if (blocked.some((pattern) => cmd.includes(pattern))) return RiskLevel.BLOCKED;
    const dangerous = ['rm -rf', 'chmod', 'chown', 'iptables', 'systemctl', 'stop-process', 'taskkill /f', 'reg delete', 'shutdown /s', '-encodedcommand'];
    if (dangerous.some((pattern) => cmd.includes(pattern))) return RiskLevel.DANGEROUS;
    const moderate = ['npm install', 'pip install', 'winget install', 'curl ', 'invoke-webrequest'];
    return moderate.some((pattern) => cmd.includes(pattern)) ? RiskLevel.MODERATE : RiskLevel.SAFE;
  }
  canExecute(command: string) { return this.assessCommandRisk(command) !== RiskLevel.BLOCKED; }
  private category(name: string): keyof Pick<ProjectPermissions, 'terminal' | 'fileRead' | 'fileWrite' | 'network'> | null {
    if (['run_command', 'interactive_shell', 'run_in_background', 'process_list', 'db_query', 'docker', 'git_operation', 'read_lints'].includes(name)) return 'terminal';
    if (['write_file', 'edit_file', 'delete_file', 'apply_patch', 'rename_file', 'create_directory', 'archive', 'undo_file'].includes(name)) return 'fileWrite';
    if (['read_file', 'read_files', 'list_directory', 'search_code', 'find_files', 'file_info', 'inspect_workspace'].includes(name)) return 'fileRead';
    if (['web_search', 'read_url', 'http_request'].includes(name)) return 'network';
    return null;
  }
  async authorizeTool(name: string, args: any, chatId = 0): Promise<boolean> {
    const category = this.category(name); if (!category) return true;
    const command = String(args?.command || args?.query || args?.url || args?.targetPath || name).trim();
    if (category === 'terminal' && this.assessCommandRisk(command) === RiskLevel.BLOCKED) return false;
    const matchesCommand = (value: string) => { const rule = value.trim().toLowerCase(); return rule === '*' || (Boolean(rule) && command.toLowerCase().startsWith(rule)); };
    if (this.project.deniedCommands.some(matchesCommand)) return false;
    if (this.project.allowedCommands.some(matchesCommand)) return true;
    if (category === 'terminal') {
      const rule = [...this.project.commandRules].reverse().find((item) => item.command.trim() && matchesCommand(item.command));
      if (rule?.effect === 'allow') return true;
      if (rule?.effect === 'deny') return false;
    }
    if (category === 'fileRead' || category === 'fileWrite') {
      const access = category === 'fileRead' ? 'read' : 'write';
      const normalized = path.resolve(command).toLowerCase();
      const matchesPath = (value: string) => {
        if (value.trim() === '*') return true;
        const rulePath = path.resolve(value).toLowerCase();
        return normalized === rulePath || normalized.startsWith(rulePath + path.sep);
      };
      const rule = [...this.project.fileRules].reverse().find((item) => item.path.trim() && item.access === access && matchesPath(item.path));
      if (rule?.effect === 'allow') return true;
      if (rule?.effect === 'deny') return false;
      const globalRule = [...this.defaults.fileRules].reverse().find((item) => item.path.trim() && item.access === access && matchesPath(item.path));
      if (globalRule?.effect === 'allow') return true;
      if (globalRule?.effect === 'deny') return false;
    }
    if (this.defaults.deniedCommands.some(matchesCommand)) return false;
    if (this.defaults.allowedCommands.some(matchesCommand)) return true;
    if (category === 'terminal') {
      const globalRule = [...this.defaults.commandRules].reverse().find((item) => item.command.trim() && matchesCommand(item.command));
      if (globalRule?.effect === 'allow') return true;
      if (globalRule?.effect === 'deny') return false;
    }
    const risk = category === 'terminal' ? this.assessCommandRisk(command) : RiskLevel.SAFE;
    const localMode = this.project[category] as PermissionMode;
    const mode = risk === RiskLevel.DANGEROUS ? 'ask' : (localMode === 'ask' ? this.defaults[category] : localMode) as PermissionMode;
    if (mode === 'allow') return true; if (mode === 'deny') return false;
    const labels: Record<string, string> = { terminal: 'выполнение команды', fileRead: 'чтение файлов', fileWrite: 'изменение файлов', network: 'сетевой запрос' };
    const choice = await askUserChoice(chatId, `Разрешить ${labels[category]}?\n${command}`, ['Разрешить один раз', 'Всегда разрешать в этом проекте', 'Всегда разрешать во всех проектах', 'Запретить']);
    if (choice === 'Всегда разрешать в этом проекте') { this.project.allowedCommands = [...new Set([...this.project.allowedCommands, command])]; this.onPolicyChange?.('project', { ...this.project }); return true; }
    if (choice === 'Всегда разрешать во всех проектах') { this.defaults.allowedCommands = [...new Set([...this.defaults.allowedCommands, command])]; this.onPolicyChange?.('global', { ...this.defaults }); return true; }
    if (choice === 'Запретить') { this.project.deniedCommands = [...new Set([...this.project.deniedCommands, command])]; this.onPolicyChange?.('project', { ...this.project }); return false; }
    return choice === 'Разрешить один раз';
  }
}
export const permissionSystem = new PermissionSystem();
