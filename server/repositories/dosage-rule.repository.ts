/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { DosageRule } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over DosageRule records — NOT wired into any Decision
 * Engine/Evaluator logic yet (that is explicitly out of scope for this
 * sprint, see Sprint 5A talimatı).
 */
export class DosageRuleRepository extends BaseRepository<DosageRule> {
  constructor() {
    super("dosageRules");
  }

  /** Bir ilaca (Chemical) bağlı, yalnızca aktif (isActive) dozaj kurallarını döner. */
  public async getActiveByChemicalId(chemicalId: string): Promise<DosageRule[]> {
    return this.find((r) => r.chemicalId === chemicalId && r.isActive);
  }
}

export const dosageRuleRepository = new DosageRuleRepository();
