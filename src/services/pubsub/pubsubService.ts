/**
 * PubSub Service - Event Streaming Gateway
 * Google Cloud PubSub and Redis-based event streaming
 */

import { PubSub as GooglePubSub } from '@google-cloud/pubsub';
import { RedisClientType } from 'redis';

export interface PubSubConfig {
  projectId?: string;
  redis?: RedisClientType;
  enableGooglePubSub?: boolean;
  enableRedisPubSub?: boolean;
  defaultTopic?: string;
}

export interface PubSubMessage {
  id: string;
  topic: string;
  data: any;
  attributes?: { [key: string]: string };
  timestamp: Date;
  source: 'google' | 'redis' | 'local';
}

export interface Subscription {
  id: string;
  topic: string;
  handler: (message: PubSubMessage) => Promise<void>;
  active: boolean;
  createdAt: Date;
}

export class PubSubService {
  private config: PubSubConfig;
  private googlePubSub?: GooglePubSub;
  private redis?: RedisClientType;
  private subscriptions: Map<string, Subscription> = new Map();
  private localTopics: Map<string, PubSubMessage[]> = new Map();
  private messageQueue: PubSubMessage[] = [];

  constructor(config: PubSubConfig = {}) {
    this.config = {
      enableGooglePubSub: !!config.projectId,
      enableRedisPubSub: !!config.redis,
      defaultTopic: 'infinity-events',
      ...config
    };

    this.redis = config.redis;

    if (this.config.enableGooglePubSub && config.projectId) {
      this.googlePubSub = new GooglePubSub({ projectId: config.projectId });
    }

    this.startMessageProcessor();
  }

  // Publishing Methods
  public async publish(topic: string, data: any, attributes?: { [key: string]: string }): Promise<string> {
    const message: PubSubMessage = {
      id: this.generateId(),
      topic,
      data,
      attributes,
      timestamp: new Date(),
      source: 'local'
    };

    // Publish to all enabled backends
    const publishPromises: Promise<any>[] = [];

    if (this.config.enableGooglePubSub && this.googlePubSub) {
      publishPromises.push(this.publishToGooglePubSub(message));
    }

    if (this.config.enableRedisPubSub && this.redis) {
      publishPromises.push(this.publishToRedis(message));
    }

    // Always store locally for subscriptions
    publishPromises.push(this.publishLocally(message));

    await Promise.allSettled(publishPromises);

    // Add to processing queue
    this.messageQueue.push(message);

    return message.id;
  }

  private async publishToGooglePubSub(message: PubSubMessage): Promise<void> {
    if (!this.googlePubSub) return;

    try {
      const topic = this.googlePubSub.topic(message.topic);
      const dataBuffer = Buffer.from(JSON.stringify(message.data));

      await topic.publish(dataBuffer, {
        ...message.attributes,
        messageId: message.id,
        timestamp: message.timestamp.toISOString(),
        source: message.source
      });
    } catch (error) {
      console.error('Failed to publish to Google PubSub:', error);
      throw error;
    }
  }

  private async publishToRedis(message: PubSubMessage): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.publish(message.topic, JSON.stringify(message));
    } catch (error) {
      console.error('Failed to publish to Redis:', error);
      throw error;
    }
  }

  private async publishLocally(message: PubSubMessage): Promise<void> {
    if (!this.localTopics.has(message.topic)) {
      this.localTopics.set(message.topic, []);
    }

    const topicMessages = this.localTopics.get(message.topic)!;
    topicMessages.push(message);

    // Keep only last 1000 messages per topic
    if (topicMessages.length > 1000) {
      topicMessages.splice(0, topicMessages.length - 1000);
    }
  }

  // Subscription Methods
  public async subscribe(topic: string, handler: (message: PubSubMessage) => Promise<void>): Promise<string> {
    const subscriptionId = this.generateId();

    const subscription: Subscription = {
      id: subscriptionId,
      topic,
      handler,
      active: true,
      createdAt: new Date()
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Subscribe to external sources
    if (this.config.enableGooglePubSub && this.googlePubSub) {
      await this.subscribeToGooglePubSub(topic, subscriptionId);
    }

    if (this.config.enableRedisPubSub && this.redis) {
      await this.subscribeToRedis(topic, subscriptionId);
    }

    return subscriptionId;
  }

  private async subscribeToGooglePubSub(topic: string, subscriptionId: string): Promise<void> {
    if (!this.googlePubSub) return;

    try {
      const subscription = this.googlePubSub.subscription(`infinity-${subscriptionId}`);
      const [exists] = await subscription.exists();

      if (!exists) {
        await this.googlePubSub.topic(topic).createSubscription(`infinity-${subscriptionId}`);
      }

      subscription.on('message', async (message) => {
        try {
          const data = JSON.parse(message.data.toString());
          const pubSubMessage: PubSubMessage = {
            id: message.id,
            topic,
            data,
            attributes: message.attributes,
            timestamp: new Date(),
            source: 'google'
          };

          await this.handleMessage(pubSubMessage);
          message.ack();
        } catch (error) {
          console.error('Error processing Google PubSub message:', error);
          message.nack();
        }
      });
    } catch (error) {
      console.error('Failed to subscribe to Google PubSub:', error);
    }
  }

  private async subscribeToRedis(topic: string, subscriptionId: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.subscribe(topic, async (message) => {
        try {
          const parsedMessage = JSON.parse(message);
          const pubSubMessage: PubSubMessage = {
            ...parsedMessage,
            source: 'redis'
          };

          await this.handleMessage(pubSubMessage);
        } catch (error) {
          console.error('Error processing Redis message:', error);
        }
      });
    } catch (error) {
      console.error('Failed to subscribe to Redis:', error);
    }
  }

  public async unsubscribe(subscriptionId: string): Promise<boolean> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    subscription.active = false;
    this.subscriptions.delete(subscriptionId);

    // Unsubscribe from external sources
    if (this.config.enableGooglePubSub && this.googlePubSub) {
      try {
        const gcpSubscription = this.googlePubSub.subscription(`infinity-${subscriptionId}`);
        await gcpSubscription.delete();
      } catch (error) {
        console.error('Failed to unsubscribe from Google PubSub:', error);
      }
    }

    if (this.config.enableRedisPubSub && this.redis) {
      try {
        await this.redis.unsubscribe(subscription.topic);
      } catch (error) {
        console.error('Failed to unsubscribe from Redis:', error);
      }
    }

    return true;
  }

  // Message Processing
  private async handleMessage(message: PubSubMessage): Promise<void> {
    const relevantSubscriptions = Array.from(this.subscriptions.values())
      .filter(sub => sub.active && (sub.topic === message.topic || sub.topic === '*'));

    await Promise.allSettled(
      relevantSubscriptions.map(sub => sub.handler(message))
    );
  }

  private startMessageProcessor(): void {
    setInterval(() => {
      this.processMessageQueue();
    }, 100); // Process every 100ms
  }

  private async processMessageQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;

    const messages = this.messageQueue.splice(0, 10); // Process up to 10 messages at a time

    await Promise.allSettled(
      messages.map(message => this.handleMessage(message))
    );
  }

  // Query Methods
  public async getTopicMessages(topic: string, limit: number = 100): Promise<PubSubMessage[]> {
    const messages = this.localTopics.get(topic) || [];
    return messages.slice(-limit);
  }

  public async getAllTopics(): Promise<string[]> {
    const topics = new Set<string>();

    // Local topics
    this.localTopics.forEach((_, topic) => topics.add(topic));

    // Google PubSub topics
    if (this.googlePubSub) {
      try {
        const [pubsubTopics] = await this.googlePubSub.getTopics();
        pubsubTopics.forEach(topic => topics.add(topic.name.split('/').pop()!));
      } catch (error) {
        console.error('Failed to get Google PubSub topics:', error);
      }
    }

    return Array.from(topics);
  }

  public async getSubscriptions(): Promise<Subscription[]> {
    return Array.from(this.subscriptions.values());
  }

  // Event Streaming Patterns
  public async publishEvent(eventType: string, eventData: any, metadata?: any): Promise<string> {
    return await this.publish('events', {
      type: eventType,
      data: eventData,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
  }

  public async publishAgentMessage(agentId: string, message: any): Promise<string> {
    return await this.publish(`agent.${agentId}`, message, {
      agentId,
      messageType: 'agent_communication'
    });
  }

  public async publishSystemEvent(eventType: string, details: any): Promise<string> {
    return await this.publish('system', {
      eventType,
      details,
      severity: details.severity || 'info'
    });
  }

  // Dead Letter Queue
  private async handleFailedMessage(message: PubSubMessage, error: Error): Promise<void> {
    console.error('Message processing failed, sending to DLQ:', error);

    await this.publish('dead-letter-queue', {
      originalMessage: message,
      error: error.message,
      failedAt: new Date().toISOString()
    });
  }

  // Monitoring and Health
  public async getStats(): Promise<any> {
    const topics = await this.getAllTopics();
    const subscriptions = this.subscriptions.size;
    const queueLength = this.messageQueue.length;

    const topicStats = topics.map(topic => ({
      topic,
      messageCount: this.localTopics.get(topic)?.length || 0
    }));

    return {
      topics: topicStats,
      totalTopics: topics.length,
      activeSubscriptions: subscriptions,
      queueLength,
      backends: {
        googlePubSub: !!this.googlePubSub,
        redis: !!this.redis,
        local: true
      },
      timestamp: new Date().toISOString()
    };
  }

  public async healthCheck(): Promise<boolean> {
    try {
      // Test local publishing
      await this.publish('health-check', { test: true });

      // Test Google PubSub if enabled
      if (this.googlePubSub) {
        const topic = this.googlePubSub.topic('health-check-topic');
        await topic.publish(Buffer.from('test'));
      }

      // Test Redis if enabled
      if (this.redis) {
        await this.redis.ping();
      }

      return true;
    } catch (error) {
      console.error('PubSub health check failed:', error);
      return false;
    }
  }

  // Utility Methods
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Cleanup
  public async cleanup(): Promise<void> {
    // Unsubscribe from all subscriptions
    const subscriptionIds = Array.from(this.subscriptions.keys());
    await Promise.allSettled(
      subscriptionIds.map(id => this.unsubscribe(id))
    );

    // Clear local data
    this.localTopics.clear();
    this.messageQueue.length = 0;
  }
}