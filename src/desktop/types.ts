export type ProviderType = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom';
export type PermissionMode = 'ask' | 'allow' | 'deny';
export type SandboxMode = 'workspace' | 'strict' | 'full';

export interface ModelProfile {
  id: string;
  name: string;
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxContextTokens: number;
  showReasoning: boolean;
}

export interface ProjectPermissions {
  sandboxMode: SandboxMode;
  terminal: PermissionMode;
  fileRead: PermissionMode;
  fileWrite: PermissionMode;
  network: PermissionMode;
  allowedCommands: string[];
  deniedCommands: string[];
  fileRules: Array<{ access: 'read' | 'write'; effect: PermissionMode; path: string }>;
  commandRules: Array<{ effect: PermissionMode; command: string }>;
  disabledTools: string[];
}

export interface DesktopSettings {
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  fullAccess: boolean;
  showReasoning: boolean;
  activeProfileId: string;
  modelProfiles: ModelProfile[];
  permissionDefaults: ProjectPermissions;
  projectPermissions: Record<string, ProjectPermissions>;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'status' | 'reasoning';
  content: string;
  createdAt: string;
  tokensUsed?: number;
}

export interface Conversation {
  id: string;
  title: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived?: boolean;
  unread?: boolean;
  contextUsage?: number;
  contextLimit?: number;
  compressionCount?: number;
  contextUpdatedAt?: string;
  lastRunTokens?: number;
  messages: ConversationMessage[];
}
