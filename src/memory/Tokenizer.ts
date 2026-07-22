export class Tokenizer {
  // A lightweight heuristic tokenizer for fallback when tiktoken is unavailable or not loaded
  // DeepSeek roughly aligns with OpenAI's cl100k_base.
  // On average, 1 token ≈ 4 characters in English code, or slightly fewer for Cyrillic.

  estimateTokenCount(text: string): number {
    if (!text) return 0;
    const nonAsciiCount = (text.match(/[^\x00-\x7F]/g) || []).length;
    const asciiCount = text.length - nonAsciiCount;
    return Math.ceil(asciiCount / 3.5 + nonAsciiCount * 1.2);
  }

  estimateMessagesTokenCount(messages: any[]): number {
    let tokens = 0;
    for (const msg of messages) {
      // Base tokens per message (role + formatting overhead)
      tokens += 4;
      if (msg.content) {
        tokens += this.estimateTokenCount(msg.content);
      }
      if (msg.name) {
        tokens += this.estimateTokenCount(msg.name);
      }
      if (msg.tool_calls) {
        tokens += this.estimateTokenCount(JSON.stringify(msg.tool_calls));
      }
    }
    // Base tokens for completion overhead
    tokens += 3;
    return tokens;
  }
}

export const tokenizer = new Tokenizer();
