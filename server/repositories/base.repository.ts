/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from "../database";
import { DatabaseSchema } from "../models";
import { AgriUtils } from "../utils";

/**
 * Type-safe abstract generic repository implementation.
 * Ensures consistent CRUD operations, reduces duplication, and isolates persistence layers.
 */
export class BaseRepository<T extends { id: string }> {
  protected tableKey: keyof DatabaseSchema;

  constructor(tableKey: keyof DatabaseSchema) {
    this.tableKey = tableKey;
  }

  /**
   * Retrieves all records of the entity from the database.
   */
  public async getAll(): Promise<T[]> {
    const rawDb = await db.readRaw();
    return (rawDb[this.tableKey] as unknown as T[]) || [];
  }

  /**
   * Finds a unique record by its ID.
   * @param id Entity ID
   */
  public async getById(id: string): Promise<T | null> {
    const records = await this.getAll();
    return records.find((item) => item.id === id) || null;
  }

  /**
   * Appends a new record to the database under transactional safety.
   * Generates automatic ID if not supplied.
   * @param item Entity parameters
   */
  public async create(item: Omit<T, "id"> & { id?: string }): Promise<T> {
    const newItem = {
      ...item,
      id: item.id || AgriUtils.generateId()
    } as unknown as T;

    await db.transaction((rawDb) => {
      const records = rawDb[this.tableKey] as unknown as T[];
      records.push(newItem);
    });

    return newItem;
  }

  /**
   * Updates an existing record by replacing properties with partial parameters.
   * @param id Entity ID
   * @param updates Object containing property modifications
   */
  public async update(id: string, updates: Partial<T>): Promise<T | null> {
    let updatedItem: T | null = null;

    await db.transaction((rawDb) => {
      const records = rawDb[this.tableKey] as unknown as T[];
      const index = records.findIndex((item) => item.id === id);
      
      if (index !== -1) {
        records[index] = {
          ...records[index],
          ...updates,
          id // Guarantee ID does not change
        };
        updatedItem = records[index];
      }
    });

    return updatedItem;
  }

  /**
   * Removes a unique record from the database.
   * @param id Entity ID
   * @returns boolean indicating success of operation
   */
  public async delete(id: string): Promise<boolean> {
    let success = false;

    await db.transaction((rawDb) => {
      const records = rawDb[this.tableKey] as unknown as T[];
      const index = records.findIndex((item) => item.id === id);
      
      if (index !== -1) {
        records.splice(index, 1);
        success = true;
      }
    });

    return success;
  }

  /**
   * Generic finder to query items using matching callback predicates.
   * @param predicate Predicate criteria
   */
  public async find(predicate: (item: T) => boolean): Promise<T[]> {
    const records = await this.getAll();
    return records.filter(predicate);
  }

  /**
   * Generic finder for a single record using callback predicate.
   */
  public async findOne(predicate: (item: T) => boolean): Promise<T | null> {
    const records = await this.getAll();
    return records.find(predicate) || null;
  }
}
