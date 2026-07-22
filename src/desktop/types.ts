export type ProviderType = 'deepseek' | 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'custom';
export type PermissionMode = 'ask' | 'allow' | 'deny';
export type SandboxMode = 'workspace' | 'strict' | 'full';

export interface ModelProfile {
  id: string;
  name: string;
  icon?: string;
  provider: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxContextTokens: number;
  showReasoning: boolean;
}

export interface InstructionProfile {
  id: string;
  name: string;
  prompt: string;
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
  customInstructionsEnabled: boolean;
  activeInstructionProfileId: string;
  instructionProfiles: InstructionProfile[];
  temperatureEnabled: boolean;
  temperature: number;
  permissionDefaults: ProjectPermissions;
  projectPermissions: Record<string, ProjectPermissions>;
  projectPermissionOverrides: Record<string, boolean>;
  enableChromeIntegration?: boolean;
  maxExecutionLoops?: number;
  enableProtectionSystem?: boolean;
  enableTokenStreaming?: boolean;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'status' | 'reasoning';
  content: string;
  createdAt: string;
  tokensUsed?: number;
  attachments?: Array<{ path: string; image?: boolean; mention?: boolean }>;
  promptParts?: Array<{ type: 'text' | 'token'; text?: string; tokenType?: 'command' | 'file'; id?: string; path?: string; label?: string; icon?: string }>;
}

export interface Conversation {
  id: string;
  title: string;
  modelProfileId?: string;
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
  totalTokensUsed?: number;
  currentRunId?: string;
  lastCountedRunId?: string;
  messages: ConversationMessage[];
}
