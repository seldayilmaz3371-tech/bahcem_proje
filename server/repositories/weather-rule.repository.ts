/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { WeatherRule } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation.
 * Plain CRUD over WeatherRule records — NOT wired into any Decision
 * Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class WeatherRuleRepository extends BaseRepository<WeatherRule> {
  constructor() {
    super("weatherRules");
  }

  /** Yalnızca aktif hava kurallarını döner. */
  public async getAllActive(): Promise<WeatherRule[]> {
    return this.find((r) => r.isActive);
  }
}

export const weatherRuleRepository = new WeatherRuleRepository();
