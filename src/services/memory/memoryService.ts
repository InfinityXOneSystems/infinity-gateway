/**
 * Memory Service - Consolidated Memory Gateway
 * Supports Redis, Firestore, and local storage with encryption
 */

import { createClient, RedisClientType } from 'redis';

export interface MemoryConfig {
  redis?: RedisClientType;
  encryptionKey?: string;
  defaultTTL?: number; // seconds
  maxMemorySize?: number; // MB
}

export interface MemoryEntry {
  key: string;
  value: any;
  ttl?: number;
  createdAt: Date;
  updatedAt: Date;
  encrypted?: boolean;
}

export interface MemoryQuery {
  pattern?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'key';
  sortOrder?: 'asc' | 'desc';
}

export class MemoryService {
  private redis?: RedisClientType;
  private encryptionKey: string;
  private defaultTTL: number;
  private maxMemorySize: number;
  private localStorage: Map<string, MemoryEntry> = new Map();

  constructor(config: MemoryConfig = {}) {
    this.redis = config.redis;
    this.encryptionKey = config.encryptionKey || 'default-encryption-key';
    this.defaultTTL = config.defaultTTL || 3600; // 1 hour
    this.maxMemorySize = config.maxMemorySize || 100; // 100MB
  }

  public async store(entry: { key: string; value: any; ttl?: number; encrypt?: boolean }): Promise<MemoryEntry> {
    const now = new Date();
    const memoryEntry: MemoryEntry = {
      key: entry.key,
      value: entry.encrypt ? await this.encrypt(JSON.stringify(entry.value)) : entry.value,
      ttl: entry.ttl || this.defaultTTL,
      createdAt: now,
      updatedAt: now,
      encrypted: entry.encrypt || false
    };

    try {
      if (this.redis) {
        const serialized = JSON.stringify(memoryEntry);
        await this.redis.setEx(entry.key, entry.ttl || this.defaultTTL, serialized);
      } else {
        this.localStorage.set(entry.key, memoryEntry);
        await this.enforceMemoryLimit();
      }

      return memoryEntry;
    } catch (error) {
      console.error('Failed to store memory entry:', error);
      throw new Error(`Memory storage failed: ${error}`);
    }
  }

  public async retrieve(key: string): Promise<any> {
    try {
      let entry: MemoryEntry | null = null;

      if (this.redis) {
        const data = await this.redis.get(key);
        if (data) {
          entry = JSON.parse(data);
        }
      } else {
        entry = this.localStorage.get(key) || null;
      }

      if (!entry) return null;

      // Check if expired
      if (entry.ttl && Date.now() - entry.createdAt.getTime() > entry.ttl * 1000) {
        await this.delete(key);
        return null;
      }

      // Decrypt if necessary
      if (entry.encrypted) {
        return JSON.parse(await this.decrypt(entry.value));
      }

      return entry.value;
    } catch (error) {
      console.error('Failed to retrieve memory entry:', error);
      return null;
    }
  }

  public async delete(key: string): Promise<boolean> {
    try {
      if (this.redis) {
        await this.redis.del(key);
      } else {
        this.localStorage.delete(key);
      }
      return true;
    } catch (error) {
      console.error('Failed to delete memory entry:', error);
      return false;
    }
  }

  public async exists(key: string): Promise<boolean> {
    try {
      if (this.redis) {
        return await this.redis.exists(key) === 1;
      } else {
        return this.localStorage.has(key);
      }
    } catch (error) {
      console.error('Failed to check memory entry existence:', error);
      return false;
    }
  }

  public async search(query: MemoryQuery): Promise<MemoryEntry[]> {
    try {
      const results: MemoryEntry[] = [];

      if (this.redis) {
        // Use Redis SCAN for pattern matching
        const pattern = query.pattern || '*';
        let cursor = 0;
        const keys: string[] = [];

        do {
          const scanResult = await this.redis.scan(cursor, {
            MATCH: pattern,
            COUNT: 100
          });
          cursor = scanResult.cursor;
          keys.push(...scanResult.keys);
        } while (cursor !== 0);

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            try {
              const entry: MemoryEntry = JSON.parse(data);
              results.push(entry);
            } catch (e) {
              // Skip invalid entries
            }
          }
        }
      } else {
        // Search local storage
        for (const [key, entry] of this.localStorage.entries()) {
          if (!query.pattern || this.matchesPattern(key, query.pattern)) {
            results.push(entry);
          }
        }
      }

      // Apply sorting
      if (query.sortBy) {
        results.sort((a, b) => {
          let aValue: any = a[query.sortBy!];
          let bValue: any = b[query.sortBy!];

          if (query.sortBy === 'createdAt' || query.sortBy === 'updatedAt') {
            aValue = new Date(aValue).getTime();
            bValue = new Date(bValue).getTime();
          }

          if (query.sortOrder === 'desc') {
            return bValue > aValue ? 1 : -1;
          } else {
            return aValue > bValue ? 1 : -1;
          }
        });
      }

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      return results.slice(offset, offset + limit);
    } catch (error) {
      console.error('Failed to search memory:', error);
      return [];
    }
  }

  public async clear(pattern?: string): Promise<number> {
    try {
      let count = 0;

      if (this.redis) {
        if (pattern) {
          // Delete keys matching pattern
          let cursor = 0;
          const keys: string[] = [];

          do {
            const scanResult = await this.redis.scan(cursor, {
              MATCH: pattern,
              COUNT: 100
            });
            cursor = scanResult.cursor;
            keys.push(...scanResult.keys);
          } while (cursor !== 0);

          if (keys.length > 0) {
            await this.redis.del(keys);
            count = keys.length;
          }
        } else {
          // Clear all keys
          await this.redis.flushAll();
          count = -1; // Indicate all cleared
        }
      } else {
        if (pattern) {
          for (const [key] of this.localStorage.entries()) {
            if (this.matchesPattern(key, pattern)) {
              this.localStorage.delete(key);
              count++;
            }
          }
        } else {
          count = this.localStorage.size;
          this.localStorage.clear();
        }
      }

      return count;
    } catch (error) {
      console.error('Failed to clear memory:', error);
      return 0;
    }
  }

  public async getStats(): Promise<any> {
    try {
      let totalKeys = 0;
      let memoryUsage = 0;

      if (this.redis) {
        const info = await this.redis.info('memory');
        const keyspace = await this.redis.info('keyspace');

        // Parse Redis info
        const memoryMatch = info.match(/used_memory:(\d+)/);
        memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;

        const keyMatch = keyspace.match(/keys=(\d+)/);
        totalKeys = keyMatch ? parseInt(keyMatch[1]) : 0;
      } else {
        totalKeys = this.localStorage.size;
        // Estimate memory usage for local storage
        for (const [key, entry] of this.localStorage.entries()) {
          memoryUsage += JSON.stringify(entry).length * 2; // Rough estimate
        }
      }

      return {
        totalKeys,
        memoryUsage,
        memoryUsageMB: (memoryUsage / 1024 / 1024).toFixed(2),
        maxMemorySize: this.maxMemorySize,
        storageType: this.redis ? 'redis' : 'local',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to get memory stats:', error);
      return {
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  public async backup(): Promise<any> {
    try {
      const allEntries: MemoryEntry[] = [];

      if (this.redis) {
        // Get all keys and their values
        let cursor = 0;
        const keys: string[] = [];

        do {
          const scanResult = await this.redis.scan(cursor, {
            COUNT: 100
          });
          cursor = scanResult.cursor;
          keys.push(...scanResult.keys);
        } while (cursor !== 0);

        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            try {
              const entry: MemoryEntry = JSON.parse(data);
              allEntries.push(entry);
            } catch (e) {
              // Skip invalid entries
            }
          }
        }
      } else {
        allEntries.push(...Array.from(this.localStorage.values()));
      }

      return {
        entries: allEntries,
        totalEntries: allEntries.length,
        timestamp: new Date().toISOString(),
        version: '1.0'
      };
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error(`Backup failed: ${error}`);
    }
  }

  public async restore(backup: any): Promise<number> {
    try {
      let restored = 0;

      for (const entry of backup.entries) {
        await this.store({
          key: entry.key,
          value: entry.value,
          ttl: entry.ttl,
          encrypt: entry.encrypted
        });
        restored++;
      }

      return restored;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw new Error(`Restore failed: ${error}`);
    }
  }

  // Vector memory for semantic search
  public async storeVector(key: string, vector: number[], metadata?: any): Promise<void> {
    const entry = {
      key: `vector:${key}`,
      value: {
        vector,
        metadata: metadata || {},
        createdAt: new Date()
      },
      ttl: this.defaultTTL * 24 // 24 hours for vectors
    };

    await this.store(entry);
  }

  public async searchVectors(queryVector: number[], limit: number = 10): Promise<any[]> {
    const results: any[] = [];

    // Simple cosine similarity search (in production, use specialized vector DB)
    const allVectors = await this.search({ pattern: 'vector:*', limit: 1000 });

    for (const entry of allVectors) {
      const similarity = this.cosineSimilarity(queryVector, entry.value.vector);
      results.push({
        key: entry.key.replace('vector:', ''),
        similarity,
        metadata: entry.value.metadata
      });
    }

    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private async encrypt(data: string): Promise<string> {
    const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private async decrypt(encryptedData: string): Promise<string> {
    const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private matchesPattern(key: string, pattern: string): boolean {
    // Simple glob pattern matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(key);
  }

  private async enforceMemoryLimit(): Promise<void> {
    if (this.redis) return; // Redis handles its own memory limits

    const stats = await this.getStats();
    const currentUsageMB = parseFloat(stats.memoryUsageMB);

    if (currentUsageMB > this.maxMemorySize) {
      // Remove oldest entries (simple LRU)
      const entries = Array.from(this.localStorage.entries())
        .sort(([,a], [,b]) => a.updatedAt.getTime() - b.updatedAt.getTime());

      const toRemove = Math.ceil(entries.length * 0.1); // Remove 10%
      for (let i = 0; i < toRemove; i++) {
        this.localStorage.delete(entries[i][0]);
      }
    }
  }
}