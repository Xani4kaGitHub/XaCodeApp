import fs from 'fs';
import path from 'path';
import { app, safeStorage } from 'electron';
import { Conversation, DesktopSettings, ModelProfile, ProjectPermissions } from './types';
import { ensureXaCodeHome, xacodePath } from '../config/paths';

const DEFAULT_PERMISSIONS: ProjectPermissions = {
  sandboxMode: 'workspace',
  terminal: 'ask',
  fileRead: 'allow',
  fileWrite: 'ask',
  network: 'ask',
  allowedCommands: [],
  deniedCommands: [],
  fileRules: [],
  commandRules: [],
  disabledTools: [],
};

const DEFAULT_PROFILE: ModelProfile = {
  id: 'deepseek-default', name: 'DeepSeek', provider: 'deepseek', apiKey: '',
  baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', maxContextTokens: 32000, showReasoning: false,
};

const DEFAULT_INSTRUCTION_PROFILE = { id: 'instructions-default', name: 'Основной', prompt: '' };

const DEFAULT_SETTINGS: DesktopSettings = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  fullAccess: false,
  showReasoning: false,
  activeProfileId: DEFAULT_PROFILE.id,
  modelProfiles: [DEFAULT_PROFILE],
  customInstructionsEnabled: false,
  activeInstructionProfileId: DEFAULT_INSTRUCTION_PROFILE.id,
  instructionProfiles: [DEFAULT_INSTRUCTION_PROFILE],
  temperatureEnabled: false,
  temperature: 0.7,
  permissionDefaults: DEFAULT_PERMISSIONS,
  projectPermissions: {},
  projectPermissionOverrides: {},
  enableChromeIntegration: false,
  maxExecutionLoops: 100,
  enableProtectionSystem: true,
};

function normalizePermissions(value?: Partial<ProjectPermissions>): ProjectPermissions {
  return {
    ...DEFAULT_PERMISSIONS,
    ...(value || {}),
    allowedCommands: [...(value?.allowedCommands || [])],
    deniedCommands: [...(value?.deniedCommands || [])],
    fileRules: [...(value?.fileRules || [])],
    commandRules: [...(value?.commandRules || [])],
    disabledTools: [...(value?.disabledTools || [])],
  };
}

function differsFromLegacyDefault(value: ProjectPermissions) {
  return JSON.stringify(value) !== JSON.stringify(DEFAULT_PERMISSIONS);
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

export class DesktopStore {
  constructor() {
    ensureXaCodeHome();
    this.migrateLegacyFile('settings.json');
    this.migrateLegacyFile('conversations.json');
  }

  private get settingsPath() { return xacodePath('settings.json'); }
  private get conversationsPath() { return xacodePath('conversations.json'); }

  private migrateLegacyFile(fileName: string) {
    const destination = xacodePath(fileName);
    const legacy = path.join(app.getPath('userData'), fileName);
    if (!fs.existsSync(destination) && legacy !== destination && fs.existsSync(legacy)) {
      fs.copyFileSync(legacy, destination);
    }
  }

  private encryptApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Защищённое хранилище Windows недоступно: API-ключ не был сохранён.');
    }
    return safeStorage.encryptString(apiKey).toString('base64');
  }

  getSettings(): DesktopSettings {
    const stored = readJson<Partial<DesktopSettings> & { encryptedApiKey?: string; modelProfiles?: Array<Partial<ModelProfile> & { encryptedApiKey?: string }> }>(this.settingsPath, {});
    let apiKey = '';
    if (stored.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(Buffer.from(stored.encryptedApiKey, 'base64')); } catch {}
    }
    const storedProfiles: Array<Partial<ModelProfile> & { encryptedApiKey?: string }> = stored.modelProfiles?.length ? stored.modelProfiles : [{ ...DEFAULT_PROFILE, provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, showReasoning: stored.showReasoning, encryptedApiKey: stored.encryptedApiKey }];
    const profiles = storedProfiles.map((profile, index) => {
      let profileKey = index === 0 ? apiKey : '';
      if (profile.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
        try { profileKey = safeStorage.decryptString(Buffer.from(profile.encryptedApiKey, 'base64')); } catch {}
      }
      const { encryptedApiKey: _encrypted, ...plainProfile } = profile;
      return { ...DEFAULT_PROFILE, ...plainProfile, apiKey: profileKey } as ModelProfile;
    });
    const activeProfileId = stored.activeProfileId && profiles.some((profile) => profile.id === stored.activeProfileId) ? stored.activeProfileId : profiles[0].id;
    const active = profiles.find((profile) => profile.id === activeProfileId) || profiles[0];
    const instructionProfiles = stored.instructionProfiles?.length
      ? stored.instructionProfiles.map((profile, index) => ({ id: String(profile.id || `instructions-${index}`), name: String(profile.name || 'Инструкции'), prompt: String(profile.prompt || '') }))
      : [{ ...DEFAULT_INSTRUCTION_PROFILE }];
    const activeInstructionProfileId = stored.activeInstructionProfileId && instructionProfiles.some((profile) => profile.id === stored.activeInstructionProfileId)
      ? stored.activeInstructionProfileId
      : instructionProfiles[0].id;
    const permissionDefaults = normalizePermissions(stored.permissionDefaults);
    const projectPermissions = Object.fromEntries(Object.entries(stored.projectPermissions || {}).map(([workspace, policy]) => [workspace, normalizePermissions(policy)]));
    const projectPermissionOverrides = stored.projectPermissionOverrides || Object.fromEntries(
      Object.entries(projectPermissions).map(([workspace, policy]) => [workspace, differsFromLegacyDefault(policy)]),
    );
    return {
      ...DEFAULT_SETTINGS, ...stored, activeProfileId, modelProfiles: profiles, activeInstructionProfileId, instructionProfiles,
      provider: active.provider, apiKey: active.apiKey, baseUrl: active.baseUrl, model: active.model, showReasoning: active.showReasoning,
      temperature: Math.max(0, Math.min(2, Number(stored.temperature ?? DEFAULT_SETTINGS.temperature))),
      permissionDefaults,
      projectPermissions,
      projectPermissionOverrides,
    };
  }

  saveSettings(settings: DesktopSettings): DesktopSettings {
    const clean = { ...DEFAULT_SETTINGS, ...settings };
    const { apiKey, modelProfiles, ...persisted } = clean;
    const encryptedApiKey = this.encryptApiKey(apiKey);
    const persistedProfiles = modelProfiles.map(({ apiKey: profileKey, ...profile }) => ({
      ...profile,
      encryptedApiKey: this.encryptApiKey(profileKey),
    }));
    writeJson(this.settingsPath, { ...persisted, encryptedApiKey, modelProfiles: persistedProfiles });
    return clean;
  }

  getConversations(): Conversation[] {
    return readJson<Conversation[]>(this.conversationsPath, []);
  }

  saveConversations(conversations: Conversation[]) {
    const meaningful = conversations.filter((conversation) => conversation.messages.length > 0);
    writeJson(this.conversationsPath, meaningful.slice(0, 100));
  }

}
