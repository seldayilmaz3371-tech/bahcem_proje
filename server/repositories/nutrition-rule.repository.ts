/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { NutritionRule } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over NutritionRule records — NOT wired into any Decision
 * Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class NutritionRuleRepository extends BaseRepository<NutritionRule> {
  constructor() {
    super("nutritionRules");
  }

  /** Bir gübreye bağlı, yalnızca aktif beslenme kurallarını döner. */
  public async getActiveByFertilizerId(fertilizerId: string): Promise<NutritionRule[]> {
    return this.find((r) => r.fertilizerId === fertilizerId && r.isActive);
  }
}

export const nutritionRuleRepository = new NutritionRuleRepository();
