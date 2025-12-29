/**
 * Monitoring Service - Enterprise-grade Monitoring Gateway
 * Real-time metrics, alerts, logging, and health monitoring
 */

import { RedisClientType } from 'redis';

export interface MonitoringConfig {
  redis?: RedisClientType;
  metricsRetention?: number; // hours
  logsRetention?: number; // hours
  alertsRetention?: number; // hours
  enablePrometheus?: boolean;
  prometheusPort?: number;
}

export interface Metric {
  id: string;
  name: string;
  value: number;
  tags: { [key: string]: string };
  timestamp: Date;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
}

export interface LogEntry {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  service: string;
  timestamp: Date;
  metadata?: any;
  traceId?: string;
  spanId?: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  service: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
  metadata?: any;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  responseTime?: number;
  error?: string;
  metadata?: any;
}

export class MonitoringService {
  private config: MonitoringConfig;
  private redis?: RedisClientType;
  private metrics: Metric[] = [];
  private logs: LogEntry[] = [];
  private alerts: Alert[] = [];
  private healthChecks: HealthCheck[] = [];
  private prometheusServer?: any;

  constructor(config: MonitoringConfig = {}) {
    this.config = {
      metricsRetention: 24,
      logsRetention: 72,
      alertsRetention: 168, // 7 days
      enablePrometheus: false,
      prometheusPort: 9090,
      ...config
    };

    this.redis = config.redis;

    if (this.config.enablePrometheus) {
      this.initializePrometheus();
    }

    // Start cleanup intervals
    this.startCleanupIntervals();
  }

  private initializePrometheus(): void {
    try {
      // Prometheus integration would go here
      // For now, we'll just log that it's enabled
      console.log('📊 Prometheus integration enabled');
    } catch (error) {
      console.error('Failed to initialize Prometheus:', error);
    }
  }

  private startCleanupIntervals(): void {
    // Clean up old data every hour
    setInterval(() => {
      this.cleanupOldData();
    }, 60 * 60 * 1000);
  }

  private cleanupOldData(): void {
    const now = new Date();

    // Cleanup metrics
    const metricsRetentionMs = this.config.metricsRetention! * 60 * 60 * 1000;
    this.metrics = this.metrics.filter(m => now.getTime() - m.timestamp.getTime() < metricsRetentionMs);

    // Cleanup logs
    const logsRetentionMs = this.config.logsRetention! * 60 * 60 * 1000;
    this.logs = this.logs.filter(l => now.getTime() - l.timestamp.getTime() < logsRetentionMs);

    // Cleanup alerts
    const alertsRetentionMs = this.config.alertsRetention! * 60 * 60 * 1000;
    this.alerts = this.alerts.filter(a => now.getTime() - a.timestamp.getTime() < alertsRetentionMs);

    // Cleanup health checks (keep last 100 per service)
    const healthCheckMap = new Map<string, HealthCheck[]>();
    this.healthChecks.forEach(hc => {
      if (!healthCheckMap.has(hc.service)) {
        healthCheckMap.set(hc.service, []);
      }
      healthCheckMap.get(hc.service)!.push(hc);
    });

    this.healthChecks = [];
    healthCheckMap.forEach(hcs => {
      this.healthChecks.push(...hcs.slice(-100));
    });
  }

  // Metrics Recording
  public async recordMetric(name: string, value: number, tags: { [key: string]: string } = {}, type: Metric['type'] = 'gauge'): Promise<void> {
    const metric: Metric = {
      id: this.generateId(),
      name,
      value,
      tags,
      timestamp: new Date(),
      type
    };

    this.metrics.push(metric);

    // Keep only last 10000 metrics in memory
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-10000);
    }

    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.zAdd(`metrics:${name}`, { score: metric.timestamp.getTime(), value: JSON.stringify(metric) });
        // Expire old metrics
        const cutoff = Date.now() - (this.config.metricsRetention! * 60 * 60 * 1000);
        await this.redis.zRemRangeByScore(`metrics:${name}`, 0, cutoff);
      } catch (error) {
        console.error('Failed to store metric in Redis:', error);
      }
    }
  }

  public async recordRequest(req: any, res: any, responseTime: number): Promise<void> {
    await this.recordMetric('http_requests_total', 1, {
      method: req.method,
      path: req.path,
      status: res.statusCode.toString()
    }, 'counter');

    await this.recordMetric('http_request_duration_seconds', responseTime / 1000, {
      method: req.method,
      path: req.path
    }, 'histogram');
  }

  public async recordError(error: Error, req?: any): Promise<void> {
    await this.recordMetric('errors_total', 1, {
      type: error.name,
      path: req?.path || 'unknown'
    }, 'counter');

    await this.log('error', `Error: ${error.message}`, 'monitoring', {
      stack: error.stack,
      path: req?.path,
      method: req?.method
    });
  }

  // Logging
  public async log(level: LogEntry['level'], message: string, service: string, metadata?: any, traceId?: string, spanId?: string): Promise<void> {
    const logEntry: LogEntry = {
      id: this.generateId(),
      level,
      message,
      service,
      timestamp: new Date(),
      metadata,
      traceId,
      spanId
    };

    this.logs.push(logEntry);

    // Keep only last 50000 logs in memory
    if (this.logs.length > 50000) {
      this.logs = this.logs.slice(-50000);
    }

    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.lPush('logs', JSON.stringify(logEntry));
        await this.redis.lTrim('logs', 0, 49999); // Keep last 50k logs
        await this.redis.expire('logs', this.config.logsRetention! * 60 * 60);
      } catch (error) {
        console.error('Failed to store log in Redis:', error);
      }
    }

    // Console logging for development
    const logMessage = `[${logEntry.timestamp.toISOString()}] ${level.toUpperCase()} [${service}] ${message}`;
    switch (level) {
      case 'debug':
        console.debug(logMessage);
        break;
      case 'info':
        console.info(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'error':
      case 'fatal':
        console.error(logMessage);
        break;
    }
  }

  // Alerting
  public async recordAlert(alert: Omit<Alert, 'id' | 'timestamp' | 'resolved' | 'resolvedAt'>): Promise<void> {
    const alertEntry: Alert = {
      id: this.generateId(),
      timestamp: new Date(),
      resolved: false,
      ...alert
    };

    this.alerts.push(alertEntry);

    // Store in Redis if available
    if (this.redis) {
      try {
        await this.redis.lPush('alerts', JSON.stringify(alertEntry));
        await this.redis.expire('alerts', this.config.alertsRetention! * 60 * 60);
      } catch (error) {
        console.error('Failed to store alert in Redis:', error);
      }
    }

    // Log the alert
    await this.log('warn', `Alert: ${alert.message}`, alert.service, {
      alertId: alertEntry.id,
      severity: alert.severity,
      type: alert.type
    });

    // Trigger alert handlers (email, webhook, etc.)
    await this.triggerAlertHandlers(alertEntry);
  }

  public async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.resolved = true;
    alert.resolvedAt = new Date();

    // Update in Redis if available
    if (this.redis) {
      try {
        // Find and update the alert in Redis list
        const alerts = await this.redis.lRange('alerts', 0, -1);
        const updatedAlerts = alerts.map(a => {
          const parsed = JSON.parse(a);
          if (parsed.id === alertId) {
            parsed.resolved = true;
            parsed.resolvedAt = alert.resolvedAt;
          }
          return JSON.stringify(parsed);
        });
        await this.redis.del('alerts');
        if (updatedAlerts.length > 0) {
          await this.redis.rPush('alerts', ...updatedAlerts);
        }
      } catch (error) {
        console.error('Failed to update alert in Redis:', error);
      }
    }

    await this.log('info', `Alert resolved: ${alert.message}`, alert.service, { alertId });
    return true;
  }

  // Health Monitoring
  public async recordHealthCheck(healthCheck: Omit<HealthCheck, 'timestamp'>): Promise<void> {
    const check: HealthCheck = {
      timestamp: new Date(),
      ...healthCheck
    };

    this.healthChecks.push(check);

    // Keep only last 1000 health checks per service
    const serviceChecks = this.healthChecks.filter(hc => hc.service === healthCheck.service);
    if (serviceChecks.length > 1000) {
      this.healthChecks = this.healthChecks.filter(hc => hc.service !== healthCheck.service);
      this.healthChecks.push(...serviceChecks.slice(-1000));
    }

    // Record metric
    await this.recordMetric('health_check', check.status === 'healthy' ? 1 : 0, {
      service: check.service,
      status: check.status
    }, 'gauge');

    // Alert on unhealthy services
    if (check.status === 'unhealthy') {
      await this.recordAlert({
        type: 'health_check_failed',
        severity: 'high',
        message: `${check.service} health check failed: ${check.error || 'Unknown error'}`,
        service: check.service,
        metadata: check
      });
    }
  }

  // Data Retrieval
  public async getMetrics(name?: string, tags?: { [key: string]: string }, limit: number = 1000): Promise<Metric[]> {
    let results = this.metrics;

    if (name) {
      results = results.filter(m => m.name === name);
    }

    if (tags) {
      results = results.filter(m =>
        Object.entries(tags).every(([key, value]) => m.tags[key] === value)
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return results.slice(0, limit);
  }

  public async getRecentLogs(limit: number = 100): Promise<LogEntry[]> {
    return this.logs.slice(-limit);
  }

  public async getAlerts(resolved: boolean = false, limit: number = 100): Promise<Alert[]> {
    let results = this.alerts.filter(a => a.resolved === resolved);
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, limit);
  }

  public async getHealthStatus(): Promise<{ [service: string]: HealthCheck }> {
    const latestChecks = new Map<string, HealthCheck>();

    this.healthChecks.forEach(check => {
      const existing = latestChecks.get(check.service);
      if (!existing || check.timestamp > existing.timestamp) {
        latestChecks.set(check.service, check);
      }
    });

    return Object.fromEntries(latestChecks);
  }

  // Aggregated Metrics
  public async getAggregatedMetrics(timeRange: number = 3600000): Promise<any> {
    const cutoff = Date.now() - timeRange;
    const recentMetrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);

    const aggregated: any = {};

    recentMetrics.forEach(metric => {
      if (!aggregated[metric.name]) {
        aggregated[metric.name] = {
          count: 0,
          sum: 0,
          min: Infinity,
          max: -Infinity,
          avg: 0,
          latest: metric.value,
          tags: metric.tags
        };
      }

      const agg = aggregated[metric.name];
      agg.count++;
      agg.sum += metric.value;
      agg.min = Math.min(agg.min, metric.value);
      agg.max = Math.max(agg.max, metric.value);
      agg.avg = agg.sum / agg.count;
    });

    return aggregated;
  }

  // Dashboard Data
  public async getDashboardData(): Promise<any> {
    const [metrics, logs, alerts, health] = await Promise.all([
      this.getAggregatedMetrics(),
      this.getRecentLogs(50),
      this.getAlerts(false, 20),
      this.getHealthStatus()
    ]);

    return {
      metrics,
      recentLogs: logs,
      activeAlerts: alerts,
      healthStatus: health,
      timestamp: new Date().toISOString()
    };
  }

  // Alert Handlers (configurable webhooks, emails, etc.)
  private async triggerAlertHandlers(alert: Alert): Promise<void> {
    // Placeholder for alert handlers
    // In production, this would send emails, webhooks, Slack notifications, etc.

    if (alert.severity === 'critical') {
      console.error('🚨 CRITICAL ALERT:', alert.message);
      // Send critical alert notifications
    }

    // Example webhook
    if (process.env.ALERT_WEBHOOK_URL) {
      try {
        const axios = require('axios');
        await axios.post(process.env.ALERT_WEBHOOK_URL, {
          alert,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Failed to send alert webhook:', error);
      }
    }
  }

  // Utility Methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Prometheus Integration
  public getPrometheusMetrics(): string {
    let output = '';

    // Convert our metrics to Prometheus format
    const metricMap = new Map<string, Metric[]>();

    this.metrics.forEach(metric => {
      if (!metricMap.has(metric.name)) {
        metricMap.set(metric.name, []);
      }
      metricMap.get(metric.name)!.push(metric);
    });

    metricMap.forEach((metrics, name) => {
      metrics.forEach(metric => {
        const labels = Object.entries(metric.tags)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');

        output += `# HELP ${name} ${name}\n`;
        output += `# TYPE ${name} ${metric.type}\n`;
        output += `${name}{${labels}} ${metric.value} ${Math.floor(metric.timestamp.getTime() / 1000)}\n`;
      });
    });

    return output;
  }

  // Export/Import for backup
  public async exportData(): Promise<any> {
    return {
      metrics: this.metrics,
      logs: this.logs,
      alerts: this.alerts,
      healthChecks: this.healthChecks,
      exportedAt: new Date().toISOString()
    };
  }

  public async importData(data: any): Promise<void> {
    if (data.metrics) this.metrics.push(...data.metrics);
    if (data.logs) this.logs.push(...data.logs);
    if (data.alerts) this.alerts.push(...data.alerts);
    if (data.healthChecks) this.healthChecks.push(...data.healthChecks);

    // Cleanup after import
    this.cleanupOldData();
  }
}