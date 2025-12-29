/**
 * Orchestrator Service - Consolidated Orchestration Gateway
 * Autonomous agent orchestration with self-healing and auto-scaling
 */

import { MCPService } from '../mcp/mcpService';
import { AIService } from '../ai/aiService';
import { MemoryService } from '../memory/memoryService';
import { MonitoringService } from '../monitoring/monitoringService';

export interface OrchestratorConfig {
  mcpService: MCPService;
  aiService: AIService;
  memoryService: MemoryService;
  monitoringService: MonitoringService;
  maxConcurrentTasks?: number;
  taskTimeout?: number; // seconds
  autoScalingEnabled?: boolean;
  selfHealingEnabled?: boolean;
}

export interface Task {
  id: string;
  type: 'ai' | 'mcp' | 'workflow' | 'monitoring';
  priority: 'low' | 'medium' | 'high' | 'critical';
  payload: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  retries: number;
  maxRetries: number;
  timeout?: number;
  dependencies?: string[]; // Task IDs this task depends on
  dependents?: string[]; // Task IDs that depend on this task
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  tasks: Task[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export class OrchestratorService {
  private config: OrchestratorConfig;
  private tasks: Map<string, Task> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private runningTasks: Set<string> = new Set();
  private taskQueue: Task[] = [];
  private isAutonomousMode: boolean = false;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: OrchestratorConfig) {
    this.config = {
      maxConcurrentTasks: 10,
      taskTimeout: 300, // 5 minutes
      autoScalingEnabled: true,
      selfHealingEnabled: true,
      ...config
    };
  }

  public async orchestrate(request: any): Promise<any> {
    const workflow = await this.createWorkflow(request);
    return await this.executeWorkflow(workflow.id);
  }

  public async createWorkflow(request: any): Promise<Workflow> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Analyze request and create appropriate tasks
    const tasks = await this.analyzeAndCreateTasks(request);

    const workflow: Workflow = {
      id: workflowId,
      name: request.name || `Workflow ${workflowId}`,
      description: request.description,
      tasks,
      status: 'pending',
      createdAt: new Date()
    };

    this.workflows.set(workflowId, workflow);

    // Store in memory for persistence
    await this.config.memoryService.store({
      key: `workflow:${workflowId}`,
      value: workflow,
      ttl: 86400 // 24 hours
    });

    return workflow;
  }

  public async executeWorkflow(workflowId: string): Promise<any> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    workflow.status = 'running';
    workflow.startedAt = new Date();

    try {
      // Execute tasks in dependency order
      const executedTasks = new Set<string>();
      const results: any = {};

      while (executedTasks.size < workflow.tasks.length) {
        const readyTasks = workflow.tasks.filter(task =>
          !executedTasks.has(task.id) &&
          (!task.dependencies || task.dependencies.every(dep => executedTasks.has(dep)))
        );

        if (readyTasks.length === 0) {
          throw new Error('Circular dependency detected or no tasks ready to execute');
        }

        // Execute ready tasks concurrently
        const taskPromises = readyTasks.map(task => this.executeTask(task));
        const taskResults = await Promise.allSettled(taskPromises);

        for (let i = 0; i < readyTasks.length; i++) {
          const task = readyTasks[i];
          const result = taskResults[i];

          executedTasks.add(task.id);

          if (result.status === 'fulfilled') {
            results[task.id] = result.value;
          } else {
            throw new Error(`Task ${task.id} failed: ${result.reason}`);
          }
        }
      }

      workflow.status = 'completed';
      workflow.completedAt = new Date();
      workflow.result = results;

      return results;
    } catch (error) {
      workflow.status = 'failed';
      workflow.completedAt = new Date();
      workflow.error = (error as Error).message;
      throw error;
    } finally {
      // Update workflow in memory
      await this.config.memoryService.store({
        key: `workflow:${workflowId}`,
        value: workflow,
        ttl: 86400
      });
    }
  }

  private async analyzeAndCreateTasks(request: any): Promise<Task[]> {
    const tasks: Task[] = [];

    // AI Task Analysis
    if (request.prompt || request.messages) {
      const aiTask: Task = {
        id: `task_ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'ai',
        priority: request.priority || 'medium',
        payload: request,
        status: 'pending',
        createdAt: new Date(),
        retries: 0,
        maxRetries: 3
      };
      tasks.push(aiTask);
    }

    // MCP Tool Tasks
    if (request.tools && Array.isArray(request.tools)) {
      for (const tool of request.tools) {
        const mcpTask: Task = {
          id: `task_mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'mcp',
          priority: tool.priority || 'medium',
          payload: tool,
          status: 'pending',
          createdAt: new Date(),
          retries: 0,
          maxRetries: 3
        };
        tasks.push(mcpTask);
      }
    }

    // Workflow Dependencies
    if (request.dependencies) {
      // Set up task dependencies based on request
      this.setupTaskDependencies(tasks, request.dependencies);
    }

    return tasks;
  }

  private setupTaskDependencies(tasks: Task[], dependencies: any): void {
    // Simple dependency setup - in production, use more sophisticated logic
    for (const dep of dependencies) {
      const dependentTask = tasks.find(t => t.id === dep.dependent);
      const dependencyTask = tasks.find(t => t.id === dep.dependency);

      if (dependentTask && dependencyTask) {
        if (!dependentTask.dependencies) dependentTask.dependencies = [];
        dependentTask.dependencies.push(dependencyTask.id);

        if (!dependencyTask.dependents) dependencyTask.dependents = [];
        dependencyTask.dependents.push(dependentTask.id);
      }
    }
  }

  private async executeTask(task: Task): Promise<any> {
    task.status = 'running';
    task.startedAt = new Date();

    try {
      let result: any;

      switch (task.type) {
        case 'ai':
          result = await this.executeAITask(task);
          break;
        case 'mcp':
          result = await this.executeMCPTask(task);
          break;
        case 'workflow':
          result = await this.executeWorkflowTask(task);
          break;
        case 'monitoring':
          result = await this.executeMonitoringTask(task);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      return result;
    } catch (error) {
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = (error as Error).message;

      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        // In production, add to retry queue with exponential backoff
        console.log(`Retrying task ${task.id}, attempt ${task.retries}`);
      }

      throw error;
    }
  }

  private async executeAITask(task: Task): Promise<any> {
    const payload = task.payload;

    if (payload.messages) {
      return await this.config.aiService.chat(payload.messages, payload.options);
    } else if (payload.prompt) {
      return await this.config.aiService.complete(payload.prompt, payload.options);
    } else {
      return await this.config.aiService.execute(payload);
    }
  }

  private async executeMCPTask(task: Task): Promise<any> {
    const payload = task.payload;
    return await this.config.mcpService.executeTool(payload.tool, payload.input);
  }

  private async executeWorkflowTask(task: Task): Promise<any> {
    const payload = task.payload;
    return await this.executeWorkflow(payload.workflowId);
  }

  private async executeMonitoringTask(task: Task): Promise<any> {
    const payload = task.payload;
    return await this.config.monitoringService.getMetrics();
  }

  // Autonomous Operations
  public async startAutonomousMode(): Promise<void> {
    this.isAutonomousMode = true;
    console.log('🤖 Starting autonomous orchestration mode...');

    // Start health monitoring
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 30000); // Every 30 seconds

    // Start task processing
    this.processTaskQueue();

    // Start auto-scaling if enabled
    if (this.config.autoScalingEnabled) {
      this.startAutoScaling();
    }

    // Start self-healing if enabled
    if (this.config.selfHealingEnabled) {
      this.startSelfHealing();
    }
  }

  public async stopAutonomousMode(): Promise<void> {
    this.isAutonomousMode = false;
    console.log('🛑 Stopping autonomous orchestration mode...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  private async performHealthCheck(): Promise<void> {
    try {
      // Check service health
      const services = {
        mcp: await this.checkServiceHealth('mcp'),
        ai: await this.checkServiceHealth('ai'),
        memory: await this.checkServiceHealth('memory'),
        monitoring: await this.checkServiceHealth('monitoring')
      };

      // Record health metrics
      await this.config.monitoringService.recordMetric('orchestrator.health_check', {
        services,
        timestamp: new Date().toISOString()
      });

      // Alert on unhealthy services
      for (const [service, healthy] of Object.entries(services)) {
        if (!healthy) {
          await this.config.monitoringService.recordAlert({
            type: 'service_unhealthy',
            service,
            message: `${service} service is unhealthy`,
            severity: 'high'
          });
        }
      }
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }

  private async checkServiceHealth(service: string): Promise<boolean> {
    try {
      switch (service) {
        case 'mcp':
          await this.config.mcpService.listTools();
          return true;
        case 'ai':
          await this.config.aiService.getModelHealth();
          return true;
        case 'memory':
          await this.config.memoryService.getStats();
          return true;
        case 'monitoring':
          await this.config.monitoringService.getMetrics();
          return true;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  private async processTaskQueue(): Promise<void> {
    if (!this.isAutonomousMode) return;

    // Process pending tasks
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'pending')
      .sort((a, b) => this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority));

    const availableSlots = this.config.maxConcurrentTasks! - this.runningTasks.size;

    for (let i = 0; i < Math.min(pendingTasks.length, availableSlots); i++) {
      const task = pendingTasks[i];
      this.runningTasks.add(task.id);

      // Execute task asynchronously
      this.executeTask(task).finally(() => {
        this.runningTasks.delete(task.id);
      });
    }

    // Schedule next processing
    setTimeout(() => this.processTaskQueue(), 1000);
  }

  private startAutoScaling(): void {
    setInterval(async () => {
      const metrics = await this.config.monitoringService.getMetrics();
      const queueLength = this.taskQueue.length;
      const runningCount = this.runningTasks.size;

      // Auto-scale logic
      if (queueLength > 20 && runningCount < this.config.maxConcurrentTasks!) {
        // Increase capacity
        this.config.maxConcurrentTasks! += 2;
        console.log(`📈 Auto-scaled up to ${this.config.maxConcurrentTasks} concurrent tasks`);
      } else if (queueLength < 5 && runningCount > 5 && this.config.maxConcurrentTasks! > 5) {
        // Decrease capacity
        this.config.maxConcurrentTasks! -= 1;
        console.log(`📉 Auto-scaled down to ${this.config.maxConcurrentTasks} concurrent tasks`);
      }
    }, 60000); // Every minute
  }

  private startSelfHealing(): void {
    setInterval(async () => {
      // Check for failed tasks and retry
      const failedTasks = Array.from(this.tasks.values())
        .filter(task => task.status === 'failed' && task.retries < task.maxRetries);

      for (const task of failedTasks) {
        console.log(`🔄 Self-healing: Retrying failed task ${task.id}`);
        task.status = 'pending';
        task.retries++;
      }

      // Check for stuck tasks (running too long)
      const stuckTasks = Array.from(this.tasks.values())
        .filter(task => {
          if (task.status !== 'running' || !task.startedAt) return false;
          const runtime = Date.now() - task.startedAt.getTime();
          return runtime > (task.timeout || this.config.taskTimeout!) * 1000;
        });

      for (const task of stuckTasks) {
        console.log(`⚠️ Self-healing: Cancelling stuck task ${task.id}`);
        task.status = 'failed';
        task.error = 'Task timed out';
        this.runningTasks.delete(task.id);
      }
    }, 30000); // Every 30 seconds
  }

  public async autoScale(request: any): Promise<any> {
    // Intelligent scaling based on request complexity
    const complexity = this.analyzeComplexity(request);

    let recommendations = {
      concurrentTasks: this.config.maxConcurrentTasks!,
      priority: 'medium' as const,
      timeout: this.config.taskTimeout!
    };

    if (complexity === 'high') {
      recommendations.concurrentTasks = Math.max(recommendations.concurrentTasks, 20);
      recommendations.priority = 'high';
      recommendations.timeout = 600; // 10 minutes
    } else if (complexity === 'low') {
      recommendations.concurrentTasks = Math.min(recommendations.concurrentTasks, 5);
      recommendations.priority = 'low';
      recommendations.timeout = 60; // 1 minute
    }

    return recommendations;
  }

  private analyzeComplexity(request: any): 'low' | 'medium' | 'high' {
    // Simple complexity analysis
    const textLength = JSON.stringify(request).length;
    const hasDependencies = request.dependencies && request.dependencies.length > 0;
    const taskCount = request.tools ? request.tools.length : 1;

    if (textLength > 10000 || hasDependencies || taskCount > 5) return 'high';
    if (textLength > 1000 || taskCount > 2) return 'medium';
    return 'low';
  }

  private getPriorityWeight(priority: string): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  public async isReady(): Promise<boolean> {
    try {
      // Check if all services are healthy
      const services = ['mcp', 'ai', 'memory', 'monitoring'];
      for (const service of services) {
        if (!await this.checkServiceHealth(service)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // Task management methods
  public getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  public getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  public listTasks(status?: string): Task[] {
    const tasks = Array.from(this.tasks.values());
    return status ? tasks.filter(task => task.status === status) : tasks;
  }

  public listWorkflows(status?: string): Workflow[] {
    const workflows = Array.from(this.workflows.values());
    return status ? workflows.filter(workflow => workflow.status === status) : workflows;
  }
}