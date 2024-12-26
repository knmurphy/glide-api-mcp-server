#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

// Abstract base class for Glide API versions
abstract class GlideApiClient {
  protected client: AxiosInstance;
  
  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: this.getBaseUrl(),
      headers: this.getAuthHeaders(apiKey),
    });
  }
  
  abstract getBaseUrl(): string;
  abstract getAuthHeaders(apiKey: string): Record<string, string>;
  
  public async makeRequest(method: 'GET' | 'POST', endpoint: string, data?: any) {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
      });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Glide API error: ${error.response?.data?.message || error.message}`
        );
      }
      throw error;
    }
  }
}

// V1 API implementation
class GlideApiV1Client extends GlideApiClient {
  getBaseUrl(): string {
    return 'https://api.glideapp.io';
  }
  
  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    };
  }
}

// V2 API implementation
class GlideApiV2Client extends GlideApiClient {
  getBaseUrl(): string {
    return 'https://api.glideapp.com/api/v2';
  }
  
  getAuthHeaders(apiKey: string): Record<string, string> {
    return {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
  }
}

class GlideApiServer {
  private server: Server;
  private apiClient: GlideApiClient | null = null;
  private readonly apiVersions = {
    v1: GlideApiV1Client,
    v2: GlideApiV2Client,
  };

  constructor() {
    // Initialize with environment variables if available
    const envApiKey = process.env.GLIDE_API_KEY;
    const envApiVersion = process.env.GLIDE_API_VERSION as 'v1' | 'v2' | undefined;

    if (envApiKey && envApiVersion && this.apiVersions[envApiVersion]) {
      console.error(`Initializing Glide API with version ${envApiVersion} from environment`);
      const ClientClass = this.apiVersions[envApiVersion];
      this.apiClient = new ClientClass(envApiKey);
    } else {
      console.error('No environment configuration found. API version and key must be set using set_api_version tool.');
    }

    this.server = new Server(
      {
        name: 'glide-api-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    
    this.server.onerror = (error: Error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'set_api_version',
          description: 'Set the Glide API version and authentication to use',
          inputSchema: {
            type: 'object',
            properties: {
              version: {
                type: 'string',
                enum: ['v1', 'v2'],
                description: 'API version to use',
              },
              apiKey: {
                type: 'string',
                description: 'API key for authentication',
              },
            },
            required: ['version', 'apiKey'],
          },
        },
        {
          name: 'get_app',
          description: 'Get information about a Glide app',
          inputSchema: {
            type: 'object',
            properties: {
              appId: {
                type: 'string',
                description: 'ID of the Glide app',
              },
            },
            required: ['appId'],
          },
        },
        {
          name: 'get_tables',
          description: 'Get tables for a Glide app',
          inputSchema: {
            type: 'object',
            properties: {
              appId: {
                type: 'string',
                description: 'ID of the Glide app',
              },
            },
            required: ['appId'],
          },
        },
        {
          name: 'get_table_rows',
          description: 'Get rows from a table in a Glide app',
          inputSchema: {
            type: 'object',
            properties: {
              appId: {
                type: 'string',
                description: 'ID of the Glide app',
              },
              tableId: {
                type: 'string',
                description: 'ID of the table',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of rows to return',
                minimum: 1,
              },
              offset: {
                type: 'number',
                description: 'Number of rows to skip',
                minimum: 0,
              },
            },
            required: ['appId', 'tableId'],
          },
        },
        {
          name: 'add_table_row',
          description: 'Add a new row to a table in a Glide app',
          inputSchema: {
            type: 'object',
            properties: {
              appId: {
                type: 'string',
                description: 'ID of the Glide app',
              },
              tableId: {
                type: 'string',
                description: 'ID of the table',
              },
              values: {
                type: 'object',
                description: 'Column values for the new row',
                additionalProperties: true,
              },
            },
            required: ['appId', 'tableId', 'values'],
          },
        },
        {
          name: 'update_table_row',
          description: 'Update an existing row in a table',
          inputSchema: {
            type: 'object',
            properties: {
              appId: {
                type: 'string',
                description: 'ID of the Glide app',
              },
              tableId: {
                type: 'string',
                description: 'ID of the table',
              },
              rowId: {
                type: 'string',
                description: 'ID of the row to update',
              },
              values: {
                type: 'object',
                description: 'New column values for the row',
                additionalProperties: true,
              },
            },
            required: ['appId', 'tableId', 'rowId', 'values'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'set_api_version' && request.params.arguments) {
        // Allow overriding environment variables with explicit settings
        const args = request.params.arguments as {
          version: 'v1' | 'v2';
          apiKey: string;
        };

        // Validate API key is not empty
        if (!args.apiKey.trim()) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'API key cannot be empty'
          );
        }

        const ClientClass = this.apiVersions[args.version];
        if (!ClientClass) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid API version: ${args.version}`
          );
        }

        this.apiClient = new ClientClass(args.apiKey);
        
        return {
          content: [
            {
              type: 'text',
              text: `Glide API version set to ${args.version}`,
            },
          ],
        };
      }

      if (!this.apiClient) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'API version not set. Call set_api_version first.'
        );
      }

      switch (request.params.name) {
        case 'get_app': {
          const { appId } = request.params.arguments as { appId: string };
          const result = await this.apiClient.makeRequest('GET', `/apps/${appId}`);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'get_tables': {
          const { appId } = request.params.arguments as { appId: string };
          const result = await this.apiClient.makeRequest('GET', `/apps/${appId}/tables`);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'get_table_rows': {
          const { appId, tableId, limit, offset } = request.params.arguments as {
            appId: string;
            tableId: string;
            limit?: number;
            offset?: number;
          };
          const params = new URLSearchParams();
          if (limit) params.append('limit', limit.toString());
          if (offset) params.append('offset', offset.toString());
          
          const result = await this.apiClient.makeRequest(
            'GET',
            `/apps/${appId}/tables/${tableId}/rows${params.toString() ? '?' + params.toString() : ''}`
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'add_table_row': {
          const { appId, tableId, values } = request.params.arguments as {
            appId: string;
            tableId: string;
            values: Record<string, any>;
          };
          const result = await this.apiClient.makeRequest(
            'POST',
            `/apps/${appId}/tables/${tableId}/rows`,
            values
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        case 'update_table_row': {
          const { appId, tableId, rowId, values } = request.params.arguments as {
            appId: string;
            tableId: string;
            rowId: string;
            values: Record<string, any>;
          };
          const result = await this.apiClient.makeRequest(
            'POST',
            `/apps/${appId}/tables/${tableId}/rows/${rowId}`,
            values
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Glide API MCP server running on stdio');
  }
}

const server = new GlideApiServer();
server.run().catch(console.error);
