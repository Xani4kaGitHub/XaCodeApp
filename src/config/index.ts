export interface Config {
  DEEPSEEK_API_KEY: string;
  DEEPSEEK_MODEL: string;
  DEEPSEEK_BASE_URL: string;
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_BASE_URL: string;
  LLM_PROVIDER: string;
  SANDBOX_DIR: string;
  MAX_EXECUTION_TIMEOUT_MS: number;
  MAX_LOOPS: number;
  MAX_CONTEXT_TOKENS: number;
  SHOW_REASONING: boolean;
  DISABLE_LOOP_LIMIT: boolean;
  ALWAYS_FULL_ACCESS: boolean;
  SMART_MEMORY_MODE: boolean;
  STUCK_LOOP_THRESHOLD: number;
  AUTO_RESTORE_SESSION: boolean;
  CUSTOM_INSTRUCTIONS: string;
  TEMPERATURE_ENABLED: boolean;
  TEMPERATURE: number;
  ENABLE_CHROME_INTEGRATION: boolean;
  MAX_EXECUTION_LOOPS: number;
  ENABLE_TOKEN_STREAMING: boolean;
  HYPERAGENT_HEADER_ENABLED: boolean;
  HYPERAGENT_SECRET: string;
}

export const config: Config = {
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
  DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.deepseek.com',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || process.env.DEEPSEEK_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.anthropic.com/v1/messages',
  LLM_PROVIDER: process.env.LLM_PROVIDER || 'deepseek',
  SANDBOX_DIR: process.env.SANDBOX_DIR || process.cwd(),
  MAX_EXECUTION_TIMEOUT_MS: parseInt(process.env.MAX_EXECUTION_TIMEOUT_MS || '30000', 10),
  MAX_LOOPS: parseInt(process.env.MAX_LOOPS || '30', 10),
  MAX_CONTEXT_TOKENS: parseInt(process.env.MAX_CONTEXT_TOKENS || '32000', 10),
  SHOW_REASONING: process.env.SHOW_REASONING === 'true',
  DISABLE_LOOP_LIMIT: process.env.DISABLE_LOOP_LIMIT === 'true',
  ALWAYS_FULL_ACCESS: process.env.ALWAYS_FULL_ACCESS === 'true',
  SMART_MEMORY_MODE: process.env.SMART_MEMORY_MODE !== 'false', // default true
  STUCK_LOOP_THRESHOLD: parseInt(process.env.STUCK_LOOP_THRESHOLD || '3', 10),
  AUTO_RESTORE_SESSION: process.env.AUTO_RESTORE_SESSION === 'true',
  CUSTOM_INSTRUCTIONS: '',
  TEMPERATURE_ENABLED: false,
  TEMPERATURE: 0.7,
  ENABLE_CHROME_INTEGRATION: false,
  MAX_EXECUTION_LOOPS: 100,
  ENABLE_TOKEN_STREAMING: false,
  HYPERAGENT_HEADER_ENABLED: false,
  HYPERAGENT_SECRET: '',
};

export function validateDesktopConfig() {
  if (!config.DEEPSEEK_API_KEY && !config.ANTHROPIC_API_KEY) {
    throw new Error('Добавьте API-ключ в настройках XaCode.');
  }
}
