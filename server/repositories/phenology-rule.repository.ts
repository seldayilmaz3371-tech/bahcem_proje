/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { PhenologyRule } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over PhenologyRule records — NOT wired into any Decision
 * Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class PhenologyRuleRepository extends BaseRepository<PhenologyRule> {
  constructor() {
    super("phenologyRules");
  }

  /** Bir bitkiye bağlı, yalnızca aktif fenolojik dönem kurallarını döner. */
  public async getActiveByPlantName(plantName: string): Promise<PhenologyRule[]> {
    const normalized = plantName.trim().toLowerCase();
    return this.find((r) => r.plantName.trim().toLowerCase() === normalized && r.isActive);
  }
}

export const phenologyRuleRepository = new PhenologyRuleRepository();
