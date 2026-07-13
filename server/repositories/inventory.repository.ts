/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { 
  InventoryItem, 
  InventoryCategory, 
  Fertilizer, 
  Chemical,
  ProductApplication
} from "../models";
import { db } from "../database";

/**
 * Repository to manage Inventory categories (Gübre, İlaç, Alet vb.)
 */
export class InventoryCategoryRepository extends BaseRepository<InventoryCategory> {
  constructor() {
    super("inventoryCategories");
  }
}

/**
 * Repository to manage general Stock Items.
 */
export class InventoryItemRepository extends BaseRepository<InventoryItem> {
  constructor() {
    super("inventory");
  }

  /**
   * Retrieves all items that have fallen below their defined minimum stock threshold.
   */
  public async getLowStockItems(): Promise<InventoryItem[]> {
    return this.find((item) => item.stockQuantity <= item.minStockAlert);
  }

  /**
   * Retrieves items filtered by category.
   */
  public async getByCategory(categoryId: string): Promise<InventoryItem[]> {
    return this.find((item) => item.categoryId === categoryId);
  }

  /**
   * Adjusts stock quantity of an item by a positive or negative delta.
   * Prevents negative stock levels.
   */
  public async adjustStock(id: string, delta: number): Promise<boolean> {
    let success = false;
    await db.transaction((rawDb) => {
      const items = rawDb.inventory;
      const index = items.findIndex((item) => item.id === id);
      if (index !== -1) {
        const newStock = items[index].stockQuantity + delta;
        if (newStock >= 0) {
          items[index].stockQuantity = Math.round(newStock * 100) / 100;
          items[index].updatedAt = new Date().toISOString();
          success = true;
        }
      }
    });
    return success;
  }
}

/**
 * Repository to manage fertilizer-specific specifications.
 */
export class FertilizerRepository extends BaseRepository<Fertilizer> {
  constructor() {
    super("fertilizers");
  }

  /**
   * Finds specific fertilizer metrics linked to an inventory item.
   */
  public async getByInventoryItemId(inventoryItemId: string): Promise<Fertilizer | null> {
    return this.findOne((f) => f.inventoryItemId === inventoryItemId);
  }
}

/**
 * Repository to manage chemical-specific safety and target pest metrics.
 */
export class ChemicalRepository extends BaseRepository<Chemical> {
  constructor() {
    super("chemicals");
  }

  /**
   * Finds pesticide/fungicide specifications linked to an inventory item.
   */
  public async getByInventoryItemId(inventoryItemId: string): Promise<Chemical | null> {
    return this.findOne((c) => c.inventoryItemId === inventoryItemId);
  }
}

/**
 * Repository to manage the simple application history log (which
 * parcels/reference trees a product was applied to, and when) — see
 * ProductApplication in models.ts for why this is deliberately separate
 * from the older, stock-linked Application interface.
 */
export class ProductApplicationRepository extends BaseRepository<ProductApplication> {
  constructor() {
    super("productApplications");
  }

  /**
   * Retrieves every application record for a single inventory item,
   * most recent first.
   */
  public async getByInventoryItemId(inventoryItemId: string): Promise<ProductApplication[]> {
    const records = await this.find((a) => a.inventoryItemId === inventoryItemId);
    return records.sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime());
  }
}

export const inventoryCategoryRepository = new InventoryCategoryRepository();
export const inventoryItemRepository = new InventoryItemRepository();
export const fertilizerRepository = new FertilizerRepository();
export const chemicalRepository = new ChemicalRepository();
export const productApplicationRepository = new ProductApplicationRepository();
