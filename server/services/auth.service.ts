/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";
import { userRepository, roleRepository } from "../repositories/user.repository";
import { activityLogRepository } from "../repositories/activity.repository";
import { User, UserRole } from "../models";
import { logger } from "../logger";
import { AgriUtils } from "../utils";

const SESSION_FILE = path.join(process.cwd(), "data", "sessions.json");

/**
 * Loads persistent sessions from disk.
 */
function loadSessions(): Map<string, { userId: string; expiresAt: number }> {
  try {
    const dir = path.dirname(SESSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(SESSION_FILE)) {
      const content = fs.readFileSync(SESSION_FILE, "utf8");
      const parsed = JSON.parse(content) as Record<string, { userId: string; expiresAt: number }>;
      const sessionMap = new Map<string, { userId: string; expiresAt: number }>();
      for (const [token, data] of Object.entries(parsed)) {
        if (data.expiresAt > Date.now()) {
          sessionMap.set(token, data);
        }
      }
      return sessionMap;
    }
  } catch (error) {
    console.error("AUTH | Error loading persistent sessions from disk:", error);
  }
  return new Map<string, { userId: string; expiresAt: number }>();
}

/**
 * Saves sessions list back to disk.
 */
function saveSessions(sessionMap: Map<string, { userId: string; expiresAt: number }>): void {
  try {
    const obj: Record<string, { userId: string; expiresAt: number }> = {};
    for (const [token, data] of sessionMap.entries()) {
      if (data.expiresAt > Date.now()) {
        obj[token] = data;
      }
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2), "utf8");
  } catch (error) {
    console.error("AUTH | Error saving sessions to disk:", error);
  }
}

/**
 * Active session tokens cache, loaded from disk for state durability.
 */
const ACTIVE_SESSIONS = loadSessions();

/**
 * Session validation output interface
 */
export interface SessionValidationResult {
  isValid: boolean;
  user: User | null;
  permissions: string[];
}

/**
 * Authentication and Session Management Service.
 * Implements password salting and hashing using bcrypt, session validation,
 * and permission-based authorization checks (RBAC).
 */
export class AuthService {
  private sessionTimeoutMs = 12 * 60 * 60 * 1000; // 12 Hours Session Lifetime

  /**
   * authenticates a user using username and password.
   * Logs administrative activity audit trails.
   */
  public async login(username: string, passwordPlain: string, ipAddress?: string): Promise<{ token: string; user: User } | null> {
    try {
      const user = await userRepository.getByUsername(username);
      if (!user || !user.isActive) {
        logger.warn("AUTH", `Failed login attempt: User not found or inactive: '${username}'`);
        return null;
      }

      const isPasswordValid = bcrypt.compareSync(passwordPlain, user.passwordHash);
      if (!isPasswordValid) {
        logger.warn("AUTH", `Failed login attempt: Invalid password for user: '${username}'`);
        await activityLogRepository.writeLog(user.id, "LOGIN_FAILED", "Hatalı şifre denemesi yapıldı.", ipAddress);
        return null;
      }

      // Generate a cryptographically secure session token
      const token = AgriUtils.generateId();
      const expiresAt = Date.now() + this.sessionTimeoutMs;
      
      ACTIVE_SESSIONS.set(token, { userId: user.id, expiresAt });
      saveSessions(ACTIVE_SESSIONS);
      
      logger.info("AUTH", `User logged in successfully: '${username}' [Role: ${user.role}]`);
      await activityLogRepository.writeLog(user.id, "LOGIN_SUCCESS", "Kullanıcı sisteme giriş yaptı.", ipAddress);

      return { token, user };
    } catch (error) {
      logger.error("AUTH", "Error occurred during login workflow.", error);
      return null;
    }
  }

  /**
   * Invalidates a session token, performing audit logging.
   */
  public async logout(token: string, ipAddress?: string): Promise<boolean> {
    const session = ACTIVE_SESSIONS.get(token);
    if (!session) return false;

    ACTIVE_SESSIONS.delete(token);
    saveSessions(ACTIVE_SESSIONS);
    logger.info("AUTH", `Session token invalidated successfully.`);
    await activityLogRepository.writeLog(session.userId, "LOGOUT", "Kullanıcı sistemden güvenli çıkış yaptı.", ipAddress);
    return true;
  }

  /**
   * Registers a new user into the database securely.
   * Requires Admin permissions (handled at API route middleware level).
   */
  public async registerUser(
    creatorId: string,
    username: string,
    passwordPlain: string,
    fullName: string,
    email: string,
    role: UserRole,
    phoneNumber?: string
  ): Promise<User | null> {
    try {
      // Input sanitization and duplication checks
      const existingUser = await userRepository.getByUsername(username);
      if (existingUser) {
        logger.warn("AUTH", `Registration failed: Username '${username}' is already registered.`);
        return null;
      }

      const existingEmail = await userRepository.getByEmail(email);
      if (existingEmail) {
        logger.warn("AUTH", `Registration failed: Email '${email}' is already registered.`);
        return null;
      }

      const saltRounds = 10;
      const passwordHash = bcrypt.hashSync(passwordPlain, saltRounds);
      const timestamp = new Date().toISOString();

      const newUser = await userRepository.create({
        username,
        passwordHash,
        fullName,
        email,
        role,
        phoneNumber,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      logger.info("AUTH", `New user registered: '${username}' as role '${role}'`);
      await activityLogRepository.writeLog(creatorId, "USER_REGISTER", `Yeni kullanıcı kaydı yapıldı: ${username} (${role})`);
      return newUser;
    } catch (error) {
      logger.error("AUTH", "Error occurred during user registration workflow.", error);
      return null;
    }
  }

  /**
   * Validates if a session token is active and not expired.
   * Cleans up expired sessions dynamically.
   */
  public async validateSession(token: string): Promise<SessionValidationResult> {
    const session = ACTIVE_SESSIONS.get(token);
    if (!session) {
      return { isValid: false, user: null, permissions: [] };
    }

    if (Date.now() > session.expiresAt) {
      ACTIVE_SESSIONS.delete(token); // Cleanup expired
      saveSessions(ACTIVE_SESSIONS);
      logger.info("AUTH", "Session token expired and removed from cache.");
      return { isValid: false, user: null, permissions: [] };
    }

    const user = await userRepository.getById(session.userId);
    if (!user || !user.isActive) {
      ACTIVE_SESSIONS.delete(token);
      saveSessions(ACTIVE_SESSIONS);
      return { isValid: false, user: null, permissions: [] };
    }

    const permissions = await roleRepository.getPermissionsByRole(user.role);

    return {
      isValid: true,
      user,
      permissions
    };
  }

  /**
   * Checks if user permissions satisfies authorization criteria.
   * Admins enjoy universal access ("*").
   */
  public hasPermission(permissions: string[], requiredPermission: string): boolean {
    if (permissions.includes("*")) return true;
    
    // Check direct match
    if (permissions.includes(requiredPermission)) return true;

    // Check wildcard match, e.g., "parcels:*" satisfies "parcels:read"
    const [reqDomain, reqAction] = requiredPermission.split(":");
    if (!reqDomain || !reqAction) return false;

    return permissions.includes(`${reqDomain}:*`) || permissions.includes(`*:${reqAction}`);
  }

  /**
   * Changes a user's password securely.
   */
  public async changePassword(userId: string, currentPasswordPlain: string, newPasswordPlain: string): Promise<boolean> {
    try {
      const user = await userRepository.getById(userId);
      if (!user) return false;

      const isCurrentValid = bcrypt.compareSync(currentPasswordPlain, user.passwordHash);
      if (!isCurrentValid) {
        logger.warn("AUTH", `Password change denied: Incorrect current password for user: '${user.username}'`);
        return false;
      }

      const saltRounds = 10;
      const newHash = bcrypt.hashSync(newPasswordPlain, saltRounds);
      
      await userRepository.update(userId, {
        passwordHash: newHash,
        updatedAt: new Date().toISOString()
      });

      logger.info("AUTH", `Password successfully changed for user: '${user.username}'`);
      await activityLogRepository.writeLog(userId, "PASSWORD_CHANGE", "Şifre başarıyla değiştirildi.");
      return true;
    } catch (error) {
      logger.error("AUTH", "Error changing password.", error);
      return false;
    }
  }
}

export const authService = new AuthService();
