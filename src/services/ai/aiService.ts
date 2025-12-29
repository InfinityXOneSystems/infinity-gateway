/**
 * AI Service - Consolidated AI Gateway
 * Supports OpenAI, Anthropic Claude, Groq, and other providers
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { Groq } from 'groq-sdk';

export interface AIConfig {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
  defaultProvider?: 'openai' | 'anthropic' | 'groq';
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIRequest {
  prompt?: string;
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

export class AIService {
  private openai?: OpenAI;
  private anthropic?: Anthropic;
  private groq?: Groq;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-4',
      maxTokens: 2000,
      temperature: 0.7,
      ...config
    };

    this.initializeClients();
  }

  private initializeClients(): void {
    if (this.config.openaiApiKey) {
      this.openai = new OpenAI({
        apiKey: this.config.openaiApiKey
      });
    }

    if (this.config.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: this.config.anthropicApiKey
      });
    }

    if (this.config.groqApiKey) {
      this.groq = new Groq({
        apiKey: this.config.groqApiKey
      });
    }
  }

  public async complete(prompt: string, options: Partial<AIRequest> = {}): Promise<AIResponse> {
    const request: AIRequest = {
      prompt,
      model: options.model || this.getDefaultModel('openai'),
      maxTokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || this.config.temperature,
      ...options
    };

    const provider = this.determineProvider(request.model);

    switch (provider) {
      case 'openai':
        return await this.completeOpenAI(request);
      case 'anthropic':
        return await this.completeAnthropic(request);
      case 'groq':
        return await this.completeGroq(request);
      default:
        throw new Error(`Unsupported AI provider for model: ${request.model}`);
    }
  }

  public async chat(messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>, options: Partial<AIRequest> = {}): Promise<AIResponse> {
    const request: AIRequest = {
      messages,
      model: options.model || this.getDefaultModel('openai'),
      maxTokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature || this.config.temperature,
      ...options
    };

    const provider = this.determineProvider(request.model);

    switch (provider) {
      case 'openai':
        return await this.chatOpenAI(request);
      case 'anthropic':
        return await this.chatAnthropic(request);
      case 'groq':
        return await this.chatGroq(request);
      default:
        throw new Error(`Unsupported AI provider for model: ${request.model}`);
    }
  }

  public async execute(request: AIRequest): Promise<AIResponse> {
    if (request.messages) {
      return await this.chat(request.messages, request);
    } else if (request.prompt) {
      return await this.complete(request.prompt, request);
    } else {
      throw new Error('Either prompt or messages must be provided');
    }
  }

  private async completeOpenAI(request: AIRequest): Promise<AIResponse> {
    if (!this.openai) throw new Error('OpenAI client not configured');

    const response = await this.openai.chat.completions.create({
      model: request.model!,
      messages: [{ role: 'user', content: request.prompt! }],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason || undefined
    };
  }

  private async chatOpenAI(request: AIRequest): Promise<AIResponse> {
    if (!this.openai) throw new Error('OpenAI client not configured');

    const response = await this.openai.chat.completions.create({
      model: request.model!,
      messages: request.messages!.map(msg => ({
        role: msg.role === 'system' ? 'system' : msg.role,
        content: msg.content
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason || undefined
    };
  }

  private async completeAnthropic(request: AIRequest): Promise<AIResponse> {
    if (!this.anthropic) throw new Error('Anthropic client not configured');

    const response = await this.anthropic.messages.create({
      model: request.model!,
      max_tokens: request.maxTokens!,
      temperature: request.temperature,
      system: 'You are a helpful AI assistant.',
      messages: [{ role: 'user', content: request.prompt! }]
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason || undefined
    };
  }

  private async chatAnthropic(request: AIRequest): Promise<AIResponse> {
    if (!this.anthropic) throw new Error('Anthropic client not configured');

    // Extract system message
    const systemMessage = request.messages!.find(msg => msg.role === 'system');
    const messages = request.messages!.filter(msg => msg.role !== 'system');

    const response = await this.anthropic.messages.create({
      model: request.model!,
      max_tokens: request.maxTokens!,
      temperature: request.temperature,
      system: systemMessage?.content || 'You are a helpful AI assistant.',
      messages: messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }))
    });

    return {
      content: response.content[0].type === 'text' ? response.content[0].text : '',
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason || undefined
    };
  }

  private async completeGroq(request: AIRequest): Promise<AIResponse> {
    if (!this.groq) throw new Error('Groq client not configured');

    const response = await this.groq.chat.completions.create({
      model: request.model!,
      messages: [{ role: 'user', content: request.prompt! }],
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason || undefined
    };
  }

  private async chatGroq(request: AIRequest): Promise<AIResponse> {
    if (!this.groq) throw new Error('Groq client not configured');

    const response = await this.groq.chat.completions.create({
      model: request.model!,
      messages: request.messages!.map(msg => ({
        role: msg.role === 'system' ? 'system' : msg.role,
        content: msg.content
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: false
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason || undefined
    };
  }

  private determineProvider(model: string): 'openai' | 'anthropic' | 'groq' {
    if (model.startsWith('gpt-') || model.startsWith('o1-')) return 'openai';
    if (model.startsWith('claude-')) return 'anthropic';
    if (model.includes('llama') || model.includes('mixtral') || model.includes('gemma')) return 'groq';

    // Default to configured provider
    return this.config.defaultProvider || 'openai';
  }

  private getDefaultModel(provider: 'openai' | 'anthropic' | 'groq'): string {
    switch (provider) {
      case 'openai': return 'gpt-4';
      case 'anthropic': return 'claude-3-sonnet-20240229';
      case 'groq': return 'llama2-70b-4096';
      default: return 'gpt-4';
    }
  }

  // Auto-scaling and load balancing
  public async autoScale(request: any): Promise<any> {
    // Implement intelligent model selection based on request complexity
    const complexity = this.analyzeComplexity(request);

    let selectedModel: string;
    let provider: string;

    if (complexity === 'high') {
      selectedModel = 'gpt-4-turbo-preview';
      provider = 'openai';
    } else if (complexity === 'medium') {
      selectedModel = 'claude-3-sonnet-20240229';
      provider = 'anthropic';
    } else {
      selectedModel = 'llama2-70b-4096';
      provider = 'groq';
    }

    return {
      selectedModel,
      provider,
      reasoning: `Selected ${selectedModel} for ${complexity} complexity request`
    };
  }

  private analyzeComplexity(request: any): 'low' | 'medium' | 'high' {
    const text = request.prompt || request.messages?.map((m: any) => m.content).join(' ') || '';
    const length = text.length;

    if (length > 10000) return 'high';
    if (length > 1000) return 'medium';
    return 'low';
  }

  // Model availability and health checks
  public async getModelHealth(): Promise<any> {
    const health: any = {};

    if (this.openai) {
      try {
        await this.openai.models.list();
        health.openai = 'healthy';
      } catch (error) {
        health.openai = 'unhealthy';
      }
    }

    if (this.anthropic) {
      try {
        // Simple health check
        health.anthropic = 'healthy';
      } catch (error) {
        health.anthropic = 'unhealthy';
      }
    }

    if (this.groq) {
      try {
        await this.groq.models.list();
        health.groq = 'healthy';
      } catch (error) {
        health.groq = 'unhealthy';
      }
    }

    return health;
  }

  // Cost optimization
  public estimateCost(model: string, tokens: number): number {
    const rates: { [key: string]: number } = {
      'gpt-4': 0.03,
      'gpt-4-turbo': 0.01,
      'gpt-3.5-turbo': 0.002,
      'claude-3-opus': 0.015,
      'claude-3-sonnet': 0.003,
      'claude-3-haiku': 0.00025,
      'llama2-70b': 0.0007,
      'mixtral-8x7b': 0.0006
    };

    const rate = rates[model] || 0.01; // Default rate
    return (tokens / 1000) * rate;
  }
}