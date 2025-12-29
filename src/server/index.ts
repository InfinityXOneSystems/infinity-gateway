/**
 * Infinity Gateway - FAANG-grade Enterprise Gateway Hub
 *
 * Consolidated from: MCP, Memory Gateway, Orchestrator, Gateway, and Admin
 * Primary deployment: Google Cloud Run
 * Capabilities: MCP/API/Omni Gateway, AI Gateway, HTTPS Gateway, PubSub Gateway,
 *               GitHub App Gateway, Credentials Gateway, Memory Gateway, Orchestrator
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createClient as createRedisClient } from 'redis';

// Import consolidated services
import { MCPService } from './services/mcp/mcpService';
import { AIService } from './services/ai/aiService';
import { MemoryService } from './services/memory/memoryService';
import { OrchestratorService } from './services/orchestrator/orchestratorService';
import { SecurityService } from './services/security/securityService';
import { MonitoringService } from './services/monitoring/monitoringService';
import { PubSubService } from './services/pubsub/pubsubService';
import { GitHubService } from './services/github/githubService';
import { GoogleWorkspaceService } from './services/google-workspace/googleWorkspaceService';
import { AdminService } from './services/admin/adminService';
import { createAdminRoutes } from './services/admin/adminRoutes';

// Load environment variables
dotenv.config();

// Configuration
const config = {
  port: parseInt(process.env.PORT || '8080'),
  nodeEnv: process.env.NODE_ENV || 'development',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'infinity-gateway-secret',
  encryptionKey: process.env.ENCRYPTION_KEY || 'infinity-encryption-key',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT,
  githubAppId: process.env.GITHUB_APP_ID,
  githubPrivateKey: process.env.GITHUB_PRIVATE_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  groqApiKey: process.env.GROQ_API_KEY,
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
};

class InfinityGateway {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private redis: any;

  // Core services
  private mcpService: MCPService;
  private aiService: AIService;
  private memoryService: MemoryService;
  private orchestratorService: OrchestratorService;
  private securityService: SecurityService;
  private monitoringService: MonitoringService;
  private pubsubService: PubSubService;
  private githubService: GitHubService;
  private googleWorkspaceService: GoogleWorkspaceService;
  private adminService: AdminService;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: { origin: config.corsOrigins }
    });

    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private async initializeServices(): Promise<void> {
    console.log('🚀 Initializing Infinity Gateway services...');

    // Initialize Redis
    this.redis = createRedisClient({ url: config.redisUrl });
    await this.redis.connect();

    // Initialize core services
    this.securityService = new SecurityService({
      jwtSecret: config.jwtSecret,
      encryptionKey: config.encryptionKey
    });

    this.monitoringService = new MonitoringService(this.redis);

    this.memoryService = new MemoryService({
      redis: this.redis,
      encryptionKey: config.encryptionKey
    });

    this.aiService = new AIService({
      openaiApiKey: config.openaiApiKey,
      anthropicApiKey: config.anthropicApiKey,
      groqApiKey: config.groqApiKey,
      defaultProvider: 'openai'
    });

    this.mcpService = new MCPService({
      aiService: this.aiService,
      memoryService: this.memoryService,
      securityService: this.securityService
    });

    this.orchestratorService = new OrchestratorService({
      mcpService: this.mcpService,
      aiService: this.aiService,
      memoryService: this.memoryService,
      monitoringService: this.monitoringService
    });

    this.pubsubService = new PubSubService({
      projectId: config.googleCloudProject,
      redis: this.redis
    });

    this.githubService = new GitHubService({
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey
    });

    this.googleWorkspaceService = new GoogleWorkspaceService({
      projectId: config.googleCloudProject
    });

    this.adminService = new AdminService({
      orchestratorService: this.orchestratorService,
      monitoringService: this.monitoringService,
      securityService: this.securityService,
      config: config
    });

    console.log('✅ All services initialized');
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: config.corsOrigins,
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMaxRequests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.monitoringService.recordRequest(req, res, duration);
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health checks
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          mcp: true,
          ai: true,
          memory: true,
          orchestrator: true,
          security: true,
          monitoring: true,
          pubsub: true,
          github: !!config.githubAppId,
          googleWorkspace: !!config.googleCloudProject
        }
      });
    });

    this.app.get('/ready', async (req, res) => {
      try {
        const isReady = await this.orchestratorService.isReady();
        res.status(isReady ? 200 : 503).json({
          status: isReady ? 'ready' : 'not ready',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(503).json({ status: 'error', error: (error as Error).message });
      }
    });

    // MCP Routes
    this.app.post('/mcp/tools/:tool', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.mcpService.executeTool(req.params.tool, req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.get('/mcp/resources', this.securityService.authenticate, async (req, res) => {
      try {
        const resources = await this.mcpService.listResources();
        res.json(resources);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // AI Routes
    this.app.post('/ai/execute', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.aiService.execute(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.post('/ai/scale', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.orchestratorService.autoScale(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Memory Routes
    this.app.post('/memory/store', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.memoryService.store(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.get('/memory/retrieve/:key', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.memoryService.retrieve(req.params.key);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Orchestrator Routes
    this.app.post('/orchestrate', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.orchestratorService.orchestrate(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // PubSub Routes
    this.app.post('/pubsub/publish', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.pubsubService.publish(req.body.topic, req.body.message);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.post('/pubsub/subscribe', this.securityService.authenticate, async (req, res) => {
      try {
        const result = await this.pubsubService.subscribe(req.body.topic, req.body.handler);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // GitHub Routes
    this.app.post('/github/webhook', async (req, res) => {
      try {
        const result = await this.githubService.handleWebhook(req.headers, req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.app.get('/github/repos', this.securityService.authenticate, async (req, res) => {
      try {
        const repos = await this.githubService.listRepositories();
        res.json(repos);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Google Workspace Routes
    this.app.get('/google/files', this.securityService.authenticate, async (req, res) => {
      try {
        const files = await this.googleWorkspaceService.listFiles();
        res.json(files);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Monitoring Routes
    this.app.get('/metrics', this.securityService.authenticate, async (req, res) => {
      try {
        const metrics = await this.monitoringService.getMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Admin Routes
    const adminRoutes = createAdminRoutes(this.adminService, this.securityService);
    this.app.use('/admin/api', adminRoutes);

    this.app.get('/admin', this.securityService.authenticate, this.securityService.requireAdmin, (req, res) => {
      res.sendFile(__dirname + '/public/admin/index.html');
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Unhandled error:', err);
      this.monitoringService.recordError(err, req);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('🔌 Client connected:', socket.id);

      // Real-time metrics
      const metricsInterval = setInterval(async () => {
        try {
          const metrics = await this.monitoringService.getMetrics();
          socket.emit('metrics', metrics);
        } catch (error) {
          console.error('Failed to send metrics:', error);
        }
      }, 5000);

      // Real-time logs
      const logsInterval = setInterval(async () => {
        try {
          const logs = await this.monitoringService.getRecentLogs();
          socket.emit('logs', logs);
        } catch (error) {
          console.error('Failed to send logs:', error);
        }
      }, 2000);

      socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        clearInterval(metricsInterval);
        clearInterval(logsInterval);
      });

      // Admin commands
      socket.on('admin-command', async (data) => {
        try {
          const result = await this.adminService.executeCommand(data);
          socket.emit('command-result', { id: data.id, result });
        } catch (error) {
          socket.emit('command-error', { id: data.id, error: (error as Error).message });
        }
      });
    });
  }

  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Infinity Gateway...');
      console.log(`📍 Environment: ${config.nodeEnv}`);
      console.log(`🔌 Port: ${config.port}`);
      console.log(`☁️  Google Cloud Project: ${config.googleCloudProject || 'Not configured'}`);

      // Start autonomous operations
      await this.orchestratorService.startAutonomousMode();

      // Start server
      this.server.listen(config.port, () => {
        console.log(`✅ Infinity Gateway running on port ${config.port}`);
        console.log(`🏥 Health check: http://localhost:${config.port}/health`);
        console.log(`📊 Admin dashboard: http://localhost:${config.port}/admin`);
      });

    } catch (error) {
      console.error('❌ Failed to start Infinity Gateway:', error);
      process.exit(1);
    }
  }

  public async stop(): Promise<void> {
    console.log('🛑 Stopping Infinity Gateway...');

    if (this.redis) {
      await this.redis.disconnect();
    }

    this.server.close(() => {
      console.log('✅ Infinity Gateway stopped');
    });
  }

  // Getters for testing and external access
  public getApp(): express.Application {
    return this.app;
  }

  public getServices() {
    return {
      mcp: this.mcpService,
      ai: this.aiService,
      memory: this.memoryService,
      orchestrator: this.orchestratorService,
      security: this.securityService,
      monitoring: this.monitoringService,
      pubsub: this.pubsubService,
      github: this.githubService,
      googleWorkspace: this.googleWorkspaceService,
      admin: this.adminService
    };
  }
}

// Export for testing
export { InfinityGateway };

// Start server if run directly
if (require.main === module) {
  const gateway = new InfinityGateway();
  gateway.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGTERM', () => gateway.stop());
  process.on('SIGINT', () => gateway.stop());
}