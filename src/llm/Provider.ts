import OpenAI from 'openai';
import { config } from '../config';
import { logger } from '../logger';
import { metricsTracker } from '../metrics/MetricsTracker';

export interface LLMRequest {
  messages: any[];
  tools?: any[];
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: any[];
  reasoningContent?: string;
  anthropicContent?: any[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  chatComplete(request: LLMRequest): Promise<LLMResponse>;
}

export interface LLMProviderOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxContextTokens: number;
  temperatureEnabled: boolean;
  temperature: number;
  enableHyperagentHeader?: boolean;
  hyperagentSecret?: string;
  enableDeepseekThinking?: boolean;
  reasoningEffort?: 'disabled' | 'low' | 'medium' | 'high' | 'max';
}

function sanitizeErrorText(text: string): string {
  if (!text) return '';
  const sanitized = text
    .replace(/(Bearer\s+|sk-)[a-zA-Z0-9_-]+/gi, '$1***MASKED***')
    .replace(/("apiKey"|"key"|"secret"|"token")\s*:\s*"[^"]+"/gi, '$1:"***MASKED***"');
  return sanitized.length > 300 ? sanitized.substring(0, 300) + '... [Текст ошибки урезан]' : sanitized;
}

function extractFallbackToolCalls(content: string | null | undefined, nativeToolCalls?: any[]): { toolCalls: any[] | undefined; cleanedContent: string | null } {
  if (nativeToolCalls && nativeToolCalls.length > 0) {
    return { toolCalls: nativeToolCalls, cleanedContent: content || null };
  }
  if (!content || typeof content !== 'string') {
    return { toolCalls: undefined, cleanedContent: content || null };
  }

  const toolCalls: any[] = [];
  let cleaned = content;

  const toolCallRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|<\/arg_value>|$)/gi;
  let match: RegExpExecArray | null;
  let idCounter = 1;

  while ((match = toolCallRegex.exec(content)) !== null) {
    const rawInner = match[1].trim();
    if (!rawInner) continue;

    let fnName = '';
    let fnArgs = '{}';

    if (rawInner.startsWith('{')) {
      try {
        const parsed = JSON.parse(rawInner);
        fnName = parsed.name || parsed.function?.name || '';
        fnArgs = typeof parsed.arguments === 'object' ? JSON.stringify(parsed.arguments) : String(parsed.arguments || '{}');
      } catch (e) {}
    }

    if (!fnName) {
      const fnMatch = rawInner.match(/^([a-zA-Z0-9_-]+)([\s\S]*)$/);
      if (fnMatch) {
        fnName = fnMatch[1];
        let rest = fnMatch[2].trim();
        rest = rest.replace(/<\/?[^>]+>/g, '').trim();
        if (rest.startsWith('{') && rest.endsWith('}')) {
          fnArgs = rest;
        } else if (rest) {
          fnArgs = JSON.stringify({ SearchPath: rest, arg: rest });
        }
      }
    }

    if (fnName) {
      toolCalls.push({
        id: `fallback_tc_${Date.now()}_${idCounter++}`,
        type: 'function',
        function: {
          name: fnName,
          arguments: fnArgs
        }
      });
      cleaned = cleaned.replace(match[0], '').trim();
    }
  }

  return {
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    cleanedContent: cleaned || null
  };
}

function currentOptions(name: string): LLMProviderOptions {
  const anthropic = ['anthropic', 'claude', 'openmodel'].includes(name.toLowerCase());
  return {
    apiKey: anthropic ? config.ANTHROPIC_API_KEY : config.DEEPSEEK_API_KEY,
    baseUrl: anthropic ? config.ANTHROPIC_BASE_URL : config.DEEPSEEK_BASE_URL,
    model: anthropic ? (config.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022') : (config.DEEPSEEK_MODEL || 'deepseek-chat'),
    maxContextTokens: config.MAX_CONTEXT_TOKENS || 4096,
    temperatureEnabled: config.TEMPERATURE_ENABLED,
    temperature: config.TEMPERATURE,
    enableHyperagentHeader: config.HYPERAGENT_HEADER_ENABLED,
    hyperagentSecret: config.HYPERAGENT_SECRET,
    enableDeepseekThinking: config.ENABLE_DEEPSEEK_THINKING,
    reasoningEffort: (config.REASONING_EFFORT as any) || 'high',
  };
}

class DeepSeekProvider implements LLMProvider {
  private openai: OpenAI;
  private readonly maxRetries = 5;
  private readonly options: LLMProviderOptions;

  private isRateLimit(error: any): boolean {
    return error?.status === 429 || error?.response?.status === 429;
  }

  private getRetryAfter(error: any): number {
    const header = error?.response?.headers?.['retry-after'] || error?.headers?.['retry-after'];
    if (header) {
      const parsed = parseInt(header, 10);
      if (!isNaN(parsed)) return parsed * 1000;
    }
    return 0;
  }

  constructor(options: LLMProviderOptions) {
    this.options = { ...options };
    const rawApiKey = (this.options.apiKey || '').trim();
    const apiKey = (rawApiKey === '-' || !rawApiKey) ? '' : rawApiKey;
    const defaultHeaders: Record<string, string> = {
      'HTTP-Referer': 'https://github.com/Xani4kaGitHub/XaCode',
      'X-Title': 'XaCode Agent'
    };
    if (this.options.enableHyperagentHeader) {
      defaultHeaders['X-Hyperagent-Webhook-Secret'] = this.options.hyperagentSecret || '';
    }
    if (!apiKey) {
      defaultHeaders['Authorization'] = '';
    }
    this.openai = new OpenAI({
      apiKey: apiKey || 'none',
      baseURL: this.options.baseUrl,
      defaultHeaders
    });
  }

  async chatComplete(request: LLMRequest): Promise<LLMResponse> {
    let attempt = 0;
    let delay = 1000;

    const modelName = String(this.options.model || '').trim();
    const omitModel = modelName === '-';
    const modelParam = omitModel ? undefined : (modelName || 'deepseek-chat');

    while (attempt < this.maxRetries) {
      try {
        const start = Date.now();
        const thinkingEnabled = this.options.enableDeepseekThinking !== false;
        const effort = this.options.reasoningEffort || 'high';

        const payload: any = {
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.tools && request.tools.length > 0 ? 'auto' : 'none',
          ...(this.options.temperatureEnabled ? { temperature: this.options.temperature } : {}),
        };

        if (thinkingEnabled && effort !== 'disabled') {
          payload.thinking = { type: 'enabled', reasoning_effort: effort };
          payload.reasoning_effort = effort;
        } else if (effort === 'disabled' || !thinkingEnabled) {
          payload.thinking = { type: 'disabled' };
        }

        if (!omitModel) {
          payload.model = modelParam;
        }

        if (config.ENABLE_TOKEN_STREAMING && request.onToken) {
          const stream = await this.openai.chat.completions.create({
            ...payload,
            stream: true,
          }, { signal: request.signal });

          let fullContent = '';
          let fullReasoningContent = '';
          const toolCallsMap = new Map<number, any>();

          for await (const chunk of stream as any) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.reasoning_content) {
              fullReasoningContent += delta.reasoning_content;
            }
            if (delta?.content) {
              fullContent += delta.content;
              request.onToken(delta.content);
            }
            if (delta?.tool_calls) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index || 0;
                if (!toolCallsMap.has(idx)) {
                  toolCallsMap.set(idx, { id: tcDelta.id || '', type: 'function', function: { name: '', arguments: '' } });
                }
                const existing = toolCallsMap.get(idx);
                if (tcDelta.id) existing.id = tcDelta.id;
                if (tcDelta.function?.name) existing.function.name += tcDelta.function.name;
                if (tcDelta.function?.arguments) existing.function.arguments += tcDelta.function.arguments;
              }
            }
          }

          const assembledTools = Array.from(toolCallsMap.values());
          const fallback = extractFallbackToolCalls(fullContent, assembledTools.length > 0 ? assembledTools : undefined);
          return {
            content: fallback.cleanedContent,
            reasoningContent: fullReasoningContent || undefined,
            toolCalls: fallback.toolCalls,
          };
        }

        const response = await this.openai.chat.completions.create(payload, {
          signal: request.signal
        });

        const executionTime = Date.now() - start;
        logger.debug(`DeepSeek API call took ${executionTime}ms`);

        const msg = response.choices[0].message;
        const usage = response.usage;

        if (usage) {
          // Rough estimate API cost: deepseek-chat is usually around $0.14 per 1M tokens input, $0.28 output
          const costEstimate = (usage.prompt_tokens / 1000000) * 0.14 + (usage.completion_tokens / 1000000) * 0.28;
          metricsTracker.addTokens(usage.total_tokens, costEstimate);
        }

        const fallback = extractFallbackToolCalls(msg.content, msg.tool_calls);

        return {
          content: fallback.cleanedContent,
          reasoningContent: (msg as any).reasoning_content,
          toolCalls: fallback.toolCalls,
          usage: usage ? {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } : undefined,
        };

      } catch (error: any) {
        if (request.signal?.aborted || error?.name === 'AbortError') throw error;
        attempt++;
        metricsTracker.addRetry();
        logger.warn(`LLM Provider error (Attempt ${attempt}/${this.maxRetries}):`, error.message);

        if (attempt >= this.maxRetries) {
          throw new Error(`LLM Provider failed after ${this.maxRetries} attempts: ${error.message}`);
        }

        if (this.isRateLimit(error)) {
          const retryAfter = this.getRetryAfter(error);
          const jitter = Math.random() * 1000;
          const waitTime = retryAfter > 0 ? retryAfter + jitter : delay + jitter;
          logger.warn(`Rate limit hit. Waiting for ${Math.round(waitTime)}ms before retrying...`);
          await new Promise(res => setTimeout(res, waitTime));
          delay *= 3;
        } else {
          // Exponential backoff
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
        }
      }
    }
    throw new Error('Unexpected LLM Provider failure');
  }
}

class AnthropicProvider implements LLMProvider {
  private readonly maxRetries = 3;
  constructor(private readonly options: LLMProviderOptions) {}

  async chatComplete(request: LLMRequest): Promise<LLMResponse> {
    let attempt = 0;
    let delay = 1000;

    // Convert OpenAI messages to Anthropic format
    let systemPrompt = '';
    const anthropicMessages: any[] = [];

    // Process messages
    let lastRole = '';
    for (const msg of request.messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
      } else if (msg.role === 'tool') {
        // Anthropic expects tool results from the user
        const toolResult = {
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content
        };

        // If last message was user, append. Otherwise create new user message.
        if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === 'user') {
           const lastMsg = anthropicMessages[anthropicMessages.length - 1];
           if (Array.isArray(lastMsg.content)) {
             lastMsg.content.push(toolResult);
           } else {
             lastMsg.content = [{ type: 'text', text: lastMsg.content }, toolResult];
           }
        } else {
           anthropicMessages.push({
             role: 'user',
             content: [toolResult]
           });
        }
      } else if (msg.role === 'assistant') {
        if (msg.anthropic_content) {
          // Sanitize thinking blocks to prevent 'missing field thinking' API errors
          const safeContent = msg.anthropic_content.map((block: any) => {
            if (block.type === 'thinking' && typeof block.thinking !== 'string') {
              return { ...block, thinking: block.reasoning || "..." };
            }
            return block;
          });
          anthropicMessages.push({ role: 'assistant', content: safeContent });
        } else {
          const content = [];
          if (msg.content) content.push({ type: 'text', text: msg.content });
          if (msg.tool_calls) {
            for (const tc of msg.tool_calls) {
                 let parsedInput = {};
                 if (typeof tc.function.arguments === 'string') {
                   try {
                     parsedInput = JSON.parse(tc.function.arguments);
                   } catch (e) {
                     logger.warn(`Failed to parse tool arguments for ${tc.function.name}:`, tc.function.arguments);
                     parsedInput = { raw: tc.function.arguments }; // fallback
                   }
                 } else {
                   parsedInput = tc.function.arguments;
                 }
                 content.push({
                   type: 'tool_use',
                   id: tc.id,
                   name: tc.function.name,
                   input: parsedInput
                 });
            }
          }
          anthropicMessages.push({ role: 'assistant', content });
        }
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Convert OpenAI tools to Anthropic format
    const anthropicTools = request.tools ? request.tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters
    })) : undefined;

    while (attempt < this.maxRetries) {
      try {
        const start = Date.now();
        const rawApiKey = (this.options.apiKey || '').trim();
        const apiKey = (rawApiKey === '-' || !rawApiKey) ? '' : rawApiKey;
        const headers: any = {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        };

        if (apiKey) {
          headers['x-api-key'] = apiKey;
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        if (this.options.enableHyperagentHeader) {
          headers['X-Hyperagent-Webhook-Secret'] = this.options.hyperagentSecret || '';
        }

        if (this.options.baseUrl.includes('freemodel')) {
          headers['Origin'] = 'https://freemodel.dev';
          headers['Referer'] = 'https://freemodel.dev/';
        }

        const modelName = String(this.options.model || '').trim();
        const omitModel = modelName === '-';

        const body: any = {
          max_tokens: this.options.maxContextTokens || 4096,
          messages: anthropicMessages,
        };

        if (!omitModel) {
          body.model = modelName || 'deepseek-chat';
        }

        if (systemPrompt) body.system = systemPrompt;
        if (this.options.temperatureEnabled) body.temperature = this.options.temperature;
        if (anthropicTools && anthropicTools.length > 0) {
          body.tools = anthropicTools;
          body.tool_choice = { type: 'auto' };
        }

        const fetchRes = await fetch(this.options.baseUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: request.signal
        });

        if (!fetchRes.ok) {
          const errText = await fetchRes.text();
          const safeMsg = sanitizeErrorText(errText);
          const err: any = new Error(`API Error ${fetchRes.status}: ${safeMsg}`);
          err.status = fetchRes.status;
          err.retryAfterHeader = fetchRes.headers.get('retry-after');
          throw err;
        }

        const response = await fetchRes.json();

        const executionTime = Date.now() - start;
        logger.debug(`Anthropic API call took ${executionTime}ms`);

        // Convert Anthropic response back to OpenAI format
        let textContent = '';
        const toolCalls: any[] = [];

        for (const block of response.content || []) {
          if (block.type === 'text') {
            textContent += block.text;
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input)
              }
            });
          }
        }

        const usage = response.usage;
        if (usage) {
          // Anthropic standard metric mapping roughly
          const promptTokens = usage.input_tokens || 0;
          const completionTokens = usage.output_tokens || 0;
          metricsTracker.addTokens(promptTokens + completionTokens, 0); // Cost estimate omitted for now
        }

        return {
          content: textContent,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          anthropicContent: response.content,
          usage: usage ? {
            promptTokens: usage.input_tokens || 0,
            completionTokens: usage.output_tokens || 0,
            totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
          } : undefined,
        };

      } catch (error: any) {
        if (request.signal?.aborted || error?.name === 'AbortError') throw error;
        attempt++;
        metricsTracker.addRetry();
        logger.warn(`LLM Provider error (Attempt ${attempt}/${this.maxRetries}):`, error.message);
        if (attempt >= this.maxRetries) {
          throw new Error(`LLM Provider failed after ${this.maxRetries} attempts: ${error.message}`);
        }

        if (error.status === 429) {
          let retryAfter = 0;
          if (error.retryAfterHeader) {
            const parsed = parseInt(error.retryAfterHeader, 10);
            if (!isNaN(parsed)) retryAfter = parsed * 1000;
          }
          const jitter = Math.random() * 1000;
          const waitTime = retryAfter > 0 ? retryAfter + jitter : delay + jitter;
          logger.warn(`Rate limit hit. Waiting for ${Math.round(waitTime)}ms before retrying...`);
          await new Promise(res => setTimeout(res, waitTime));
          delay *= 3;
        } else {
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
        }
      }
    }
    throw new Error('Unexpected LLM Provider failure');
  }
}

// Factory to allow switching providers in the future easily
export class LLMFactory {
  static getProvider(name: string = 'deepseek', options: LLMProviderOptions = currentOptions(name)): LLMProvider {
    switch(name.toLowerCase()) {
      case 'deepseek':
      case 'openai':
      case 'google':
      case 'openrouter':
      case 'ollama':
      case 'custom':
      case 'freemodel':
        return new DeepSeekProvider(options);
      case 'anthropic':
      case 'claude':
      case 'openmodel':
        return new AnthropicProvider(options);
      default:
        throw new Error(`Unsupported LLM provider: ${name}`);
    }
  }
}

export let llmProvider = LLMFactory.getProvider(config.LLM_PROVIDER);

export function createLLMProvider(name: string, options: LLMProviderOptions) {
  return LLMFactory.getProvider(name, options);
}

export function refreshLLMProvider() {
  llmProvider = LLMFactory.getProvider(config.LLM_PROVIDER);
  return llmProvider;
}
