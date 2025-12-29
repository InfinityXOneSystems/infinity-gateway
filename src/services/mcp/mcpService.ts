/**
 * MCP Service - Model Context Protocol Implementation
 * Consolidated from MCP repo with enhanced capabilities
 */

import { AIService } from '../ai/aiService';
import { MemoryService } from '../memory/memoryService';
import { SecurityService } from '../security/securityService';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (input: any) => Promise<any>;
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  content: any;
}

export class MCPService {
  private tools: Map<string, MCPTool> = new Map();
  private resources: Map<string, MCPResource> = new Map();
  private aiService: AIService;
  private memoryService: MemoryService;
  private securityService: SecurityService;

  constructor(deps: {
    aiService: AIService;
    memoryService: MemoryService;
    securityService: SecurityService;
  }) {
    this.aiService = deps.aiService;
    this.memoryService = deps.memoryService;
    this.securityService = deps.securityService;

    this.initializeTools();
    this.initializeResources();
  }

  private initializeTools(): void {
    // AI Tools
    this.registerTool({
      name: 'ai_complete',
      description: 'Complete text using AI models',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string', enum: ['gpt-4', 'claude-3', 'groq'] },
          maxTokens: { type: 'number' }
        },
        required: ['prompt']
      },
      handler: async (input) => {
        return await this.aiService.complete(input.prompt, {
          model: input.model,
          maxTokens: input.maxTokens
        });
      }
    });

    this.registerTool({
      name: 'ai_chat',
      description: 'Have a conversation with AI',
      inputSchema: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                content: { type: 'string' }
              }
            }
          },
          model: { type: 'string', enum: ['gpt-4', 'claude-3', 'groq'] }
        },
        required: ['messages']
      },
      handler: async (input) => {
        return await this.aiService.chat(input.messages, {
          model: input.model
        });
      }
    });

    // Memory Tools
    this.registerTool({
      name: 'memory_store',
      description: 'Store data in persistent memory',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'any' },
          ttl: { type: 'number' } // Time to live in seconds
        },
        required: ['key', 'value']
      },
      handler: async (input) => {
        return await this.memoryService.store({
          key: input.key,
          value: input.value,
          ttl: input.ttl
        });
      }
    });

    this.registerTool({
      name: 'memory_retrieve',
      description: 'Retrieve data from memory',
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      },
      handler: async (input) => {
        return await this.memoryService.retrieve(input.key);
      }
    });

    this.registerTool({
      name: 'memory_search',
      description: 'Search memory by pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          limit: { type: 'number', default: 10 }
        },
        required: ['pattern']
      },
      handler: async (input) => {
        return await this.memoryService.search(input.pattern, input.limit);
      }
    });

    // Security Tools
    this.registerTool({
      name: 'security_encrypt',
      description: 'Encrypt sensitive data',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string' }
        },
        required: ['data']
      },
      handler: async (input) => {
        return await this.securityService.encrypt(input.data);
      }
    });

    this.registerTool({
      name: 'security_decrypt',
      description: 'Decrypt data',
      inputSchema: {
        type: 'object',
        properties: {
          encryptedData: { type: 'string' }
        },
        required: ['encryptedData']
      },
      handler: async (input) => {
        return await this.securityService.decrypt(input.encryptedData);
      }
    });

    // Code Generation Tools
    this.registerTool({
      name: 'code_generate',
      description: 'Generate code using AI',
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          task: { type: 'string' },
          requirements: { type: 'array', items: { type: 'string' } }
        },
        required: ['language', 'task']
      },
      handler: async (input) => {
        const prompt = `Generate ${input.language} code for: ${input.task}
Requirements: ${input.requirements?.join(', ') || 'None specified'}

Provide clean, well-documented code with proper error handling.`;

        return await this.aiService.complete(prompt, {
          model: 'gpt-4',
          maxTokens: 2000
        });
      }
    });

    // File System Tools
    this.registerTool({
      name: 'fs_read',
      description: 'Read file contents',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string', default: 'utf8' }
        },
        required: ['path']
      },
      handler: async (input) => {
        const fs = require('fs').promises;
        return await fs.readFile(input.path, input.encoding || 'utf8');
      }
    });

    this.registerTool({
      name: 'fs_write',
      description: 'Write to file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { type: 'string', default: 'utf8' }
        },
        required: ['path', 'content']
      },
      handler: async (input) => {
        const fs = require('fs').promises;
        await fs.writeFile(input.path, input.content, input.encoding || 'utf8');
        return { success: true };
      }
    });

    // HTTP Tools
    this.registerTool({
      name: 'http_request',
      description: 'Make HTTP requests',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          url: { type: 'string' },
          headers: { type: 'object' },
          body: { type: 'any' }
        },
        required: ['method', 'url']
      },
      handler: async (input) => {
        const axios = require('axios');
        const config: any = {
          method: input.method,
          url: input.url,
          headers: input.headers || {}
        };

        if (input.body && ['POST', 'PUT', 'PATCH'].includes(input.method)) {
          config.data = input.body;
        }

        const response = await axios(config);
        return {
          status: response.status,
          headers: response.headers,
          data: response.data
        };
      }
    });

    // Database Tools (using memory service as simple key-value store)
    this.registerTool({
      name: 'db_query',
      description: 'Query data store',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
          query: { type: 'object' },
          limit: { type: 'number', default: 10 }
        },
        required: ['collection']
      },
      handler: async (input) => {
        const key = `db:${input.collection}`;
        const data = await this.memoryService.retrieve(key) || [];
        let results = data;

        if (input.query) {
          results = data.filter((item: any) => {
            return Object.entries(input.query).every(([field, value]) => {
              return item[field] === value;
            });
          });
        }

        return results.slice(0, input.limit || 10);
      }
    });

    this.registerTool({
      name: 'db_insert',
      description: 'Insert data into collection',
      inputSchema: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
          data: { type: 'object' }
        },
        required: ['collection', 'data']
      },
      handler: async (input) => {
        const key = `db:${input.collection}`;
        const existing = await this.memoryService.retrieve(key) || [];
        const newData = [...existing, { ...input.data, id: Date.now().toString(), createdAt: new Date() }];
        await this.memoryService.store({ key, value: newData });
        return { success: true, id: newData[newData.length - 1].id };
      }
    });
  }

  private initializeResources(): void {
    // System resources
    this.registerResource({
      uri: 'infinity://system/info',
      name: 'System Information',
      description: 'Current system status and capabilities',
      mimeType: 'application/json',
      content: {
        version: '1.0.0',
        capabilities: ['mcp', 'ai', 'memory', 'orchestrator', 'security', 'monitoring'],
        timestamp: new Date().toISOString()
      }
    });

    this.registerResource({
      uri: 'infinity://tools/list',
      name: 'Available Tools',
      description: 'List of all available MCP tools',
      mimeType: 'application/json',
      content: Array.from(this.tools.keys())
    });

    this.registerResource({
      uri: 'infinity://memory/stats',
      name: 'Memory Statistics',
      description: 'Current memory usage and statistics',
      mimeType: 'application/json',
      content: async () => {
        return await this.memoryService.getStats();
      }
    });
  }

  public registerTool(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  public registerResource(resource: MCPResource): void {
    this.resources.set(resource.uri, resource);
  }

  public async executeTool(toolName: string, input: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    // Validate input against schema
    this.validateInput(input, tool.inputSchema);

    try {
      return await tool.handler(input);
    } catch (error) {
      console.error(`Tool execution failed: ${toolName}`, error);
      throw error;
    }
  }

  public async listTools(): Promise<MCPTool[]> {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  public async listResources(): Promise<MCPResource[]> {
    const resources = [];
    for (const resource of this.resources.values()) {
      if (typeof resource.content === 'function') {
        resources.push({
          ...resource,
          content: await resource.content()
        });
      } else {
        resources.push(resource);
      }
    }
    return resources;
  }

  public async getResource(uri: string): Promise<MCPResource | null> {
    const resource = this.resources.get(uri);
    if (!resource) return null;

    if (typeof resource.content === 'function') {
      return {
        ...resource,
        content: await resource.content()
      };
    }

    return resource;
  }

  private validateInput(input: any, schema: any): void {
    // Basic validation - in production, use a proper JSON schema validator
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in input)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }
    }

    // Type checking
    if (schema.properties) {
      for (const [field, fieldSchema] of Object.entries(schema.properties)) {
        if (field in input) {
          const value = input[field];
          const expectedType = (fieldSchema as any).type;

          if (expectedType === 'string' && typeof value !== 'string') {
            throw new Error(`Field '${field}' must be a string`);
          }
          if (expectedType === 'number' && typeof value !== 'number') {
            throw new Error(`Field '${field}' must be a number`);
          }
          if (expectedType === 'boolean' && typeof value !== 'boolean') {
            throw new Error(`Field '${field}' must be a boolean`);
          }
          if (expectedType === 'array' && !Array.isArray(value)) {
            throw new Error(`Field '${field}' must be an array`);
          }
          if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            throw new Error(`Field '${field}' must be an object`);
          }
        }
      }
    }
  }

  // Additional MCP protocol methods
  public async initialize(): Promise<any> {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true },
        resources: { listChanged: true, subscribe: true }
      },
      serverInfo: {
        name: 'infinity-gateway',
        version: '1.0.0'
      }
    };
  }

  public async ping(): Promise<any> {
    return {};
  }
}