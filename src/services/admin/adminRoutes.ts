/**
 * Admin Routes - REST API endpoints for admin dashboard
 */

import express from 'express';
import { AdminService } from '../admin/adminService';
import { SecurityService } from '../security/securityService';

export function createAdminRoutes(adminService: AdminService, securityService: SecurityService) {
  const router = express.Router();

  // Middleware to check admin permissions
  const requireAdmin = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const user = await securityService.verifyToken(token);
      if (!user || !user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      (req as any).user = user;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  // Get dashboard data
  router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
      const data = await adminService.getDashboardData();
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get system configuration
  router.get('/config', requireAdmin, async (req, res) => {
    try {
      const config = await adminService.getConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update system configuration
  router.put('/config', requireAdmin, async (req, res) => {
    try {
      await adminService.updateConfig(req.body);
      res.json({ success: true, message: 'Configuration updated successfully' });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Execute admin command
  router.post('/command', requireAdmin, async (req, res) => {
    try {
      const { command, parameters } = req.body;
      const userId = (req as any).user.id;

      const result = await adminService.executeCommand({
        command,
        parameters,
        userId
      });

      res.json({ success: true, result });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Get system status
  router.get('/status', requireAdmin, async (req, res) => {
    try {
      const status = await adminService.executeCommand({ command: 'get_system_status' });
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get recent logs
  router.get('/logs', requireAdmin, async (req, res) => {
    try {
      const { service, lines = 100 } = req.query;
      const logs = await adminService.executeCommand({
        command: 'get_logs',
        parameters: { service, lines: parseInt(lines as string) }
      });
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Clear logs
  router.delete('/logs', requireAdmin, async (req, res) => {
    try {
      const { service } = req.body;
      const result = await adminService.executeCommand({
        command: 'clear_logs',
        parameters: { service }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Run health check
  router.get('/health/:service?', requireAdmin, async (req, res) => {
    try {
      const { service } = req.params;
      const result = await adminService.executeCommand({
        command: 'run_health_check',
        parameters: { service }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Service management
  router.post('/services/:service/restart', requireAdmin, async (req, res) => {
    try {
      const { service } = req.params;
      const result = await adminService.executeCommand({
        command: 'restart_service',
        parameters: { service }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/services/:service/scale', requireAdmin, async (req, res) => {
    try {
      const { service } = req.params;
      const { replicas } = req.body;
      const result = await adminService.executeCommand({
        command: 'scale_service',
        parameters: { service, replicas }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.put('/services/:service/config', requireAdmin, async (req, res) => {
    try {
      const { service } = req.params;
      const { config } = req.body;
      const result = await adminService.executeCommand({
        command: 'update_service_config',
        parameters: { service, config }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Cache management
  router.delete('/cache/:type', requireAdmin, async (req, res) => {
    try {
      const { type } = req.params;
      const result = await adminService.executeCommand({
        command: 'clear_cache',
        parameters: { type }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Backup management
  router.post('/backup/:type', requireAdmin, async (req, res) => {
    try {
      const { type } = req.params;
      const result = await adminService.executeCommand({
        command: 'backup_data',
        parameters: { type }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // User management
  router.get('/users', requireAdmin, async (req, res) => {
    try {
      const users = await adminService.getUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.get('/users/:userId', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await adminService.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/users', requireAdmin, async (req, res) => {
    try {
      const userData = req.body;
      const result = await adminService.executeCommand({
        command: 'create_user',
        parameters: userData
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post('/users/:userId/reset-password', requireAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const result = await adminService.executeCommand({
        command: 'reset_password',
        parameters: { userId }
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Configuration export/import
  router.get('/config/export', requireAdmin, async (req, res) => {
    try {
      const config = await adminService.executeCommand({ command: 'export_config' });
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/config/import', requireAdmin, async (req, res) => {
    try {
      const { config } = req.body;
      const result = await adminService.executeCommand({
        command: 'import_config',
        parameters: { config }
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  // Audit trail
  router.get('/audit', requireAdmin, async (req, res) => {
    try {
      const { userId, action, limit = 100 } = req.query;
      const auditTrail = await adminService.getAuditTrail({
        userId: userId as string,
        action: action as string,
        limit: parseInt(limit as string)
      });
      res.json(auditTrail);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}