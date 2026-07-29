/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { CompatibilityRule } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over CompatibilityRule records — NOT wired into any
 * Decision Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class CompatibilityRuleRepository extends BaseRepository<CompatibilityRule> {
  constructor() {
    super("compatibilityRules");
  }

  /**
   * İki ürün arasındaki (sıra önemsiz — A/B ya da B/A olarak kaydedilmiş
   * olabilir) aktif karışabilirlik kuralını arar.
   */
  public async findActiveBetween(inventoryItemIdA: string, inventoryItemIdB: string): Promise<CompatibilityRule | null> {
    return this.findOne(
      (r) =>
        r.isActive &&
        ((r.inventoryItemIdA === inventoryItemIdA && r.inventoryItemIdB === inventoryItemIdB) ||
          (r.inventoryItemIdA === inventoryItemIdB && r.inventoryItemIdB === inventoryItemIdA))
    );
  }
}

export const compatibilityRuleRepository = new CompatibilityRuleRepository();
