import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerConfig } from '../desktop/types';

export interface McpToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

class McpManager {
  private clients = new Map<string, { client: Client; transport: StdioClientTransport; config: McpServerConfig; tools: McpToolDefinition[] }>();
  private globalEnabled: boolean = true;

  constructor() {}

  public async syncServers(enabled: boolean, serverConfigs: Record<string, McpServerConfig>) {
    this.globalEnabled = enabled;

    // Disconnect old servers that are removed or disabled
    for (const [serverId, { client, transport }] of this.clients.entries()) {
      const config = serverConfigs[serverId];
      if (!this.globalEnabled || !config || config.disabled) {
        try {
          await transport.close();
        } catch (e) {
          console.error(`Error closing MCP server ${serverId}:`, e);
        }
        this.clients.delete(serverId);
      }
    }

    if (!this.globalEnabled) return;

    // Connect new servers
    for (const [serverId, config] of Object.entries(serverConfigs)) {
      if (config.disabled) continue;

      if (!this.clients.has(serverId)) {
        try {
          const transport = new StdioClientTransport({
            command: config.command,
            args: config.args || [],
            env: { ...process.env, ...(config.env || {}) } as Record<string, string>
          });

          const client = new Client({
            name: 'xacode-client',
            version: '1.0.0'
          }, {
            capabilities: {}
          });

          await client.connect(transport);

          const toolsResult = await client.listTools();
          const tools: McpToolDefinition[] = toolsResult.tools.map((t: any) => ({
            type: 'function',
            function: {
              name: `mcp_${serverId}_${t.name}`, // namespace tools by server ID to avoid conflicts
              description: t.description || '',
              parameters: t.inputSchema || { type: 'object', properties: {} }
            }
          }));

          this.clients.set(serverId, { client, transport, config, tools });
          console.log(`Connected to MCP server: ${serverId} with ${tools.length} tools`);
        } catch (e) {
          console.error(`Failed to connect to MCP server ${serverId}:`, e);
        }
      }
    }
  }

  public getMcpToolDefinitions(): McpToolDefinition[] {
    if (!this.globalEnabled) return [];
    
    const allTools: McpToolDefinition[] = [];
    for (const { tools } of this.clients.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  public async executeMcpTool(namespacedName: string, args: any): Promise<any> {
    if (!this.globalEnabled) {
      throw new Error('MCP is globally disabled.');
    }

    // Parse the namespaced tool name: mcp_{serverId}_{toolName}
    const match = namespacedName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match) {
      throw new Error(`Invalid MCP tool name format: ${namespacedName}`);
    }

    const serverId = match[1];
    const originalToolName = match[2];

    const serverData = this.clients.get(serverId);
    if (!serverData) {
      throw new Error(`MCP server ${serverId} is not connected or disabled.`);
    }

    try {
      const result = await serverData.client.callTool({
        name: originalToolName,
        arguments: args
      });
      return result;
    } catch (e: any) {
      throw new Error(`MCP Tool Error (${namespacedName}): ${e.message || String(e)}`);
    }
  }
}

export const mcpManager = new McpManager();
