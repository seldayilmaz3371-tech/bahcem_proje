/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { SafetyWarning } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over SafetyWarning records — NOT wired into any Decision
 * Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class SafetyWarningRepository extends BaseRepository<SafetyWarning> {
  constructor() {
    super("safetyWarnings");
  }

  /** Bir ilaca bağlı, yalnızca aktif güvenlik uyarılarını döner. */
  public async getActiveByChemicalId(chemicalId: string): Promise<SafetyWarning[]> {
    return this.find((w) => w.relatedChemicalId === chemicalId && w.isActive);
  }
}

export const safetyWarningRepository = new SafetyWarningRepository();
