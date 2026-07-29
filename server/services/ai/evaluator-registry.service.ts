/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluator } from "./evaluator-framework.service";
import { InventoryEvaluator } from "./inventory.evaluator";
import { WeatherEvaluator } from "./weather.evaluator";
import { PhenologyEvaluator } from "./phenology.evaluator";
import { DosageEvaluator } from "./dosage.evaluator";
import { CompatibilityEvaluator } from "./compatibility.evaluator";
import { NutritionEvaluator } from "./nutrition.evaluator";
import { HistoryEvaluator } from "./history.evaluator";
import { RiskEvaluator } from "./risk.evaluator";

import { inventoryItemRepository, productApplicationRepository } from "../../repositories/inventory.repository";
import { weatherRuleRepository } from "../../repositories/weather-rule.repository";
import { phenologyRuleRepository } from "../../repositories/phenology-rule.repository";
import { dosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { compatibilityRuleRepository } from "../../repositories/compatibility-rule.repository";
import { nutritionRuleRepository } from "../../repositories/nutrition-rule.repository";
import { safetyWarningRepository } from "../../repositories/safety-warning.repository";

/**
 * Sprint 5D — Evaluator Registry.
 *
 * TEMEL PRENSİP: Sprint 5B'nin 8 Evaluator'ının KENDİSİ hiç
 * değişmedi — onlar zaten Constructor Injection ile tasarlanmıştı
 * (bkz. Sprint 5B: "bağımlılıklarını kendi constructor'larında
 * parametre olarak alacak şekilde tasarlanır"). Eksik olan tek şey,
 * onları GERÇEK repository SINGLETON'larıyla (mock değil) örnekleyen
 * bu MERKEZİ yerdi.
 *
 * Bu fonksiyon, `DecisionEngineService.run()`'a geçirilecek gerçek
 * Evaluator listesini üretir — Decision Engine'in kendisi hiçbir
 * repository'yi DOĞRUDAN bilmez, yalnızca bu listeyi kullanır (katman
 * ayrımı korunur).
 */
export function createRealEvaluators(): Evaluator[] {
  return [
    new InventoryEvaluator(inventoryItemRepository),
    new WeatherEvaluator(weatherRuleRepository),
    new PhenologyEvaluator(phenologyRuleRepository),
    new DosageEvaluator(dosageRuleRepository),
    new CompatibilityEvaluator(compatibilityRuleRepository),
    new NutritionEvaluator(nutritionRuleRepository),
    new HistoryEvaluator(productApplicationRepository, dosageRuleRepository),
    new RiskEvaluator(safetyWarningRepository),
  ];
}
