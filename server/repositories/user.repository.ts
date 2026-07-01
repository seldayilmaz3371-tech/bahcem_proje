/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { User, Role, UserRole } from "../models";
import { db } from "../database";

/**
 * Repository to manage User entities.
 */
export class UserRepository extends BaseRepository<User> {
  constructor() {
    super("users");
  }

  /**
   * Retrieves a unique user based on their login username.
   * Case-insensitive check.
   */
  public async getByUsername(username: string): Promise<User | null> {
    const records = await this.getAll();
    const lowerUsername = username.toLowerCase();
    return records.find((u) => u.username.toLowerCase() === lowerUsername) || null;
  }

  /**
   * Retrieves a user by their registered email address.
   */
  public async getByEmail(email: string): Promise<User | null> {
    const records = await this.getAll();
    const lowerEmail = email.toLowerCase();
    return records.find((u) => u.email.toLowerCase() === lowerEmail) || null;
  }

  /**
   * Updates user profile info safely, ensuring timestamps are set.
   */
  public async updateProfile(id: string, updates: Partial<Omit<User, "id" | "passwordHash">>): Promise<User | null> {
    return this.update(id, {
      ...updates,
      updatedAt: new Date().toISOString()
    } as any);
  }
}

/**
 * Repository to manage Role entities.
 */
export class RoleRepository extends BaseRepository<Role> {
  constructor() {
    super("roles");
  }

  /**
   * Resolves permission list for a specific user role.
   * @param roleName UserRole value
   */
  public async getPermissionsByRole(roleName: UserRole): Promise<string[]> {
    const roles = await this.getAll();
    const matchedRole = roles.find((r) => r.name === roleName);
    return matchedRole ? matchedRole.permissions : [];
  }
}

export const userRepository = new UserRepository();
export const roleRepository = new RoleRepository();
