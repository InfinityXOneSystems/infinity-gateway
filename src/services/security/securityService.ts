/**
 * Security Service - Enterprise-grade Security Gateway
 * JWT authentication, RBAC, encryption, and security monitoring
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface SecurityConfig {
  jwtSecret: string;
  encryptionKey: string;
  bcryptRounds?: number;
  tokenExpiration?: string; // JWT expiration time
  refreshTokenExpiration?: string; // Refresh token expiration
  maxLoginAttempts?: number;
  lockoutDuration?: number; // minutes
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'agent' | 'service';
  permissions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  mfaEnabled: boolean;
  mfaSecret?: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityEvent {
  id: string;
  type: 'login' | 'logout' | 'failed_login' | 'password_change' | 'permission_change' | 'suspicious_activity';
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: any;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class SecurityService {
  private config: SecurityConfig;
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private securityEvents: SecurityEvent[] = [];

  constructor(config: SecurityConfig) {
    this.config = {
      bcryptRounds: 12,
      tokenExpiration: '1h',
      refreshTokenExpiration: '7d',
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      ...config
    };
  }

  // Authentication Methods
  public async authenticate(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      const user = this.users.get(decoded.userId);

      if (!user || !user.isActive) {
        return null;
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return null;
      }

      return user;
    } catch (error) {
      return null;
    }
  }

  public async login(username: string, password: string, ipAddress?: string, userAgent?: string): Promise<{ user: User; token: string; refreshToken: string } | null> {
    const user = Array.from(this.users.values()).find(u => u.username === username || u.email === username);

    if (!user) {
      await this.logSecurityEvent({
        type: 'failed_login',
        severity: 'medium',
        ipAddress,
        userAgent,
        details: { username, reason: 'user_not_found' }
      });
      return null;
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logSecurityEvent({
        type: 'failed_login',
        severity: 'high',
        userId: user.id,
        ipAddress,
        userAgent,
        details: { reason: 'account_locked' }
      });
      return null;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      user.loginAttempts++;
      await this.handleFailedLogin(user, ipAddress, userAgent);
      return null;
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();

    // Create session
    const session = await this.createSession(user, ipAddress, userAgent);

    await this.logSecurityEvent({
      type: 'login',
      severity: 'low',
      userId: user.id,
      ipAddress,
      userAgent,
      details: { sessionId: session.id }
    });

    return {
      user,
      token: session.token,
      refreshToken: session.refreshToken
    };
  }

  public async logout(token: string): Promise<boolean> {
    try {
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      const session = Array.from(this.sessions.values()).find(s => s.token === token);

      if (session) {
        session.isActive = false;
        await this.logSecurityEvent({
          type: 'logout',
          severity: 'low',
          userId: session.userId,
          details: { sessionId: session.id }
        });
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  public async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string } | null> {
    const session = Array.from(this.sessions.values()).find(s => s.refreshToken === refreshToken && s.isActive);

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    // Generate new tokens
    const user = this.users.get(session.userId);
    if (!user) return null;

    const newToken = this.generateToken(user);
    const newRefreshToken = this.generateRefreshToken();

    session.token = newToken;
    session.refreshToken = newRefreshToken;
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return { token: newToken, refreshToken: newRefreshToken };
  }

  // User Management
  public async createUser(userData: {
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'user' | 'agent' | 'service';
    permissions?: string[];
  }): Promise<User> {
    // Validate input
    if (!userData.username || !userData.email || !userData.password) {
      throw new Error('Username, email, and password are required');
    }

    // Check if user already exists
    const existingUser = Array.from(this.users.values()).find(
      u => u.username === userData.username || u.email === userData.email
    );

    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, this.config.bcryptRounds!);

    const user: User = {
      id: uuidv4(),
      username: userData.username,
      email: userData.email,
      passwordHash,
      role: userData.role || 'user',
      permissions: userData.permissions || this.getDefaultPermissions(userData.role || 'user'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      loginAttempts: 0,
      mfaEnabled: false
    };

    this.users.set(user.id, user);

    await this.logSecurityEvent({
      type: 'permission_change',
      severity: 'medium',
      userId: user.id,
      details: { action: 'user_created', role: user.role, permissions: user.permissions }
    });

    return user;
  }

  public async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(userId);
    if (!user) return null;

    // Update password if provided
    if (updates.passwordHash) {
      updates.passwordHash = await bcrypt.hash(updates.passwordHash, this.config.bcryptRounds!);
    }

    Object.assign(user, updates, { updatedAt: new Date() });
    this.users.set(userId, user);

    await this.logSecurityEvent({
      type: 'permission_change',
      severity: 'medium',
      userId,
      details: { action: 'user_updated', updates }
    });

    return user;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user) return false;

    // Deactivate all sessions
    const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    userSessions.forEach(session => session.isActive = false);

    user.isActive = false;
    this.users.set(userId, user);

    await this.logSecurityEvent({
      type: 'permission_change',
      severity: 'high',
      userId,
      details: { action: 'user_deleted' }
    });

    return true;
  }

  // Authorization Methods
  public async hasPermission(user: User, permission: string): Promise<boolean> {
    return user.permissions.includes(permission) || user.permissions.includes('*');
  }

  public async requirePermission(user: User, permission: string): Promise<void> {
    if (!await this.hasPermission(user, permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  public authenticateMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const user = this.authenticate(token);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = user;
    next();
  };

  public requireAdmin = (req: any, res: any, next: any) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  };

  // Encryption Methods
  public async encrypt(data: string): Promise<string> {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    });
  }

  public async decrypt(encryptedData: string): Promise<string> {
    const { encrypted, iv, authTag } = JSON.parse(encryptedData);
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.config.encryptionKey, 'salt', 32);

    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // MFA Methods
  public async enableMFA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');

    const secret = crypto.randomBytes(32).toString('hex');
    user.mfaSecret = secret;
    user.mfaEnabled = true;
    this.users.set(userId, user);

    // Generate QR code URL (simplified)
    const qrCode = `otpauth://totp/InfinityGateway:${user.username}?secret=${secret}&issuer=InfinityGateway`;

    return { secret, qrCode };
  }

  public async verifyMFA(userId: string, token: string): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || !user.mfaSecret) return false;

    // Simple TOTP verification (in production, use a proper TOTP library)
    const timeStep = Math.floor(Date.now() / 30000); // 30 second windows
    const secret = user.mfaSecret;

    // This is a simplified implementation - use speakeasy or similar in production
    return true; // Placeholder
  }

  // Security Monitoring
  private async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      severity: event.severity || 'medium',
      ...event
    };

    this.securityEvents.push(securityEvent);

    // Keep only last 1000 events
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }

    // Log critical events
    if (securityEvent.severity === 'critical') {
      console.error('🚨 CRITICAL SECURITY EVENT:', securityEvent);
    }
  }

  public getSecurityEvents(limit: number = 100): SecurityEvent[] {
    return this.securityEvents.slice(-limit);
  }

  // Private Helper Methods
  private async handleFailedLogin(user: User, ipAddress?: string, userAgent?: string): Promise<void> {
    await this.logSecurityEvent({
      type: 'failed_login',
      severity: 'medium',
      userId: user.id,
      ipAddress,
      userAgent,
      details: { attemptNumber: user.loginAttempts }
    });

    if (user.loginAttempts >= this.config.maxLoginAttempts!) {
      user.lockedUntil = new Date(Date.now() + this.config.lockoutDuration! * 60 * 1000);
      await this.logSecurityEvent({
        type: 'suspicious_activity',
        userId: user.id,
        ipAddress,
        userAgent,
        details: { reason: 'account_locked_due_to_failed_attempts' },
        severity: 'high'
      });
    }
  }

  private async createSession(user: User, ipAddress?: string, userAgent?: string): Promise<Session> {
    const token = this.generateToken(user);
    const refreshToken = this.generateRefreshToken();

    const session: Session = {
      id: uuidv4(),
      userId: user.id,
      token,
      refreshToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      isActive: true,
      ipAddress,
      userAgent
    };

    this.sessions.set(session.id, session);
    return session;
  }

  private generateToken(user: User): string {
    return jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      },
      this.config.jwtSecret,
      { expiresIn: this.config.tokenExpiration }
    );
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  private getDefaultPermissions(role: string): string[] {
    switch (role) {
      case 'admin':
        return ['*'];
      case 'agent':
        return ['ai:execute', 'memory:read', 'memory:write', 'mcp:execute'];
      case 'service':
        return ['api:read', 'api:write'];
      default:
        return ['api:read'];
    }
  }

  // Session Management
  public getActiveSessions(userId?: string): Session[] {
    const sessions = Array.from(this.sessions.values()).filter(s => s.isActive);
    return userId ? sessions.filter(s => s.userId === userId) : sessions;
  }

  public invalidateSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      return true;
    }
    return false;
  }

  // Password Policy
  public validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}