/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 5H — Real-World Scenario Validation.
 *
 * Çalıştırma: npx tsx server/services/ai/real-world-scenarios.test.ts
 *
 * TEMEL PRENSİP (onaylanan iyileştirme #1): Testler DAVRANIŞ ODAKLI —
 * "hangi ruleId kullanıldı" gibi iç implementasyon detaylarını DEĞİL,
 * "beklenen status/blocking/açıklama oluştu mu" sorusunu doğrular. Bu,
 * iç implementasyon değişse bile (örn. bir Evaluator'ın repository
 * sorgusu optimize edilse) davranış aynı kaldığı sürece testlerin
 * BOZULMAMASINI sağlar.
 *
 * Zincir: Decision Engine → DecisionResult → DecisionExplanationBuilder
 * → (Gemini'ye giden prompt, GERÇEK Gemini ÇAĞRILMADAN, yalnızca
 * DecisionResult ile tutarlılığı doğrulanır — bkz. onaylanan
 * iyileştirme #3).
 */

import { describe, it } from "vitest";
import { decisionEngineService, DecisionResult, DecisionStatus } from "./decision-engine.service";
import { decisionExplanationBuilderService } from "./decision-explanation-builder.service";
import { Evaluator, EvaluatorContext } from "./evaluator-framework.service";
import { InventoryEvaluator } from "./inventory.evaluator";
import { WeatherEvaluator } from "./weather.evaluator";
import { PhenologyEvaluator } from "./phenology.evaluator";
import { DosageEvaluator } from "./dosage.evaluator";
import { CompatibilityEvaluator } from "./compatibility.evaluator";
import { NutritionEvaluator } from "./nutrition.evaluator";
import { HistoryEvaluator } from "./history.evaluator";
import { RiskEvaluator } from "./risk.evaluator";
import { InventoryItemRepository, ProductApplicationRepository } from "../../repositories/inventory.repository";
import { WeatherRuleRepository } from "../../repositories/weather-rule.repository";
import { PhenologyRuleRepository } from "../../repositories/phenology-rule.repository";
import { DosageRuleRepository } from "../../repositories/dosage-rule.repository";
import { CompatibilityRuleRepository } from "../../repositories/compatibility-rule.repository";
import { NutritionRuleRepository } from "../../repositories/nutrition-rule.repository";
import { SafetyWarningRepository } from "../../repositories/safety-warning.repository";
import {
  InventoryItem, ProductApplication, WeatherRule, PhenologyRule,
  DosageRule, CompatibilityRule, NutritionRule, SafetyWarning,
} from "../../models";
import { logger } from "../../logger";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

// ============================================================
// ONAYLANAN İYİLEŞTİRME #4 — Ortak, genişletilebilir test altyapısı.
// Yeni bir Evaluator/Rule eklendiğinde, yalnızca bu "seed" nesnesine
// yeni bir alan eklenmesi yeterli olacak şekilde tasarlandı.
// ============================================================

interface ScenarioSeed {
  inventoryItems?: InventoryItem[];
  weatherRules?: WeatherRule[];
  phenologyRules?: PhenologyRule[];
  dosageRules?: DosageRule[];
  compatibilityRules?: CompatibilityRule[];
  nutritionRules?: NutritionRule[];
  safetyWarnings?: SafetyWarning[];
  productApplications?: ProductApplication[];
}

/** Tüm 8 evaluator'ı, verilen "seed" veriyle çalışan Mock repository'lerle örnekler. */
function createScenarioEvaluators(seed: ScenarioSeed): Evaluator[] {
  class MockInventoryItemRepository extends InventoryItemRepository {
    public async getAll(): Promise<InventoryItem[]> { return seed.inventoryItems ?? []; }
  }
  class MockWeatherRuleRepository extends WeatherRuleRepository {
    public async getAllActive(): Promise<WeatherRule[]> { return (seed.weatherRules ?? []).filter((r) => r.isActive); }
  }
  class MockPhenologyRuleRepository extends PhenologyRuleRepository {
    public async getActiveByPlantName(plantName: string): Promise<PhenologyRule[]> {
      return (seed.phenologyRules ?? []).filter((r) => r.isActive && r.plantName === plantName);
    }
  }
  class MockDosageRuleRepository extends DosageRuleRepository {
    public async getActiveByChemicalId(chemicalId: string): Promise<DosageRule[]> {
      return (seed.dosageRules ?? []).filter((r) => r.isActive && r.chemicalId === chemicalId);
    }
  }
  class MockCompatibilityRuleRepository extends CompatibilityRuleRepository {
    public async findActiveBetween(a: string, b: string): Promise<CompatibilityRule | null> {
      return (seed.compatibilityRules ?? []).find(
        (r) => r.isActive && ((r.inventoryItemIdA === a && r.inventoryItemIdB === b) || (r.inventoryItemIdA === b && r.inventoryItemIdB === a))
      ) ?? null;
    }
  }
  class MockNutritionRuleRepository extends NutritionRuleRepository {
    public async getActiveByFertilizerId(fertilizerId: string): Promise<NutritionRule[]> {
      return (seed.nutritionRules ?? []).filter((r) => r.isActive && r.fertilizerId === fertilizerId);
    }
  }
  class MockSafetyWarningRepository extends SafetyWarningRepository {
    public async getActiveByChemicalId(chemicalId: string): Promise<SafetyWarning[]> {
      return (seed.safetyWarnings ?? []).filter((w) => w.isActive && w.relatedChemicalId === chemicalId);
    }
  }
  class MockProductApplicationRepository extends ProductApplicationRepository {
    public async getAll(): Promise<ProductApplication[]> { return seed.productApplications ?? []; }
  }

  const dosageRepo = new MockDosageRuleRepository();
  return [
    new InventoryEvaluator(new MockInventoryItemRepository()),
    new WeatherEvaluator(new MockWeatherRuleRepository()),
    new PhenologyEvaluator(new MockPhenologyRuleRepository()),
    new DosageEvaluator(dosageRepo),
    new CompatibilityEvaluator(new MockCompatibilityRuleRepository()),
    new NutritionEvaluator(new MockNutritionRuleRepository()),
    new HistoryEvaluator(new MockProductApplicationRepository(), dosageRepo),
    new RiskEvaluator(new MockSafetyWarningRepository()),
  ];
}

interface ScenarioExpectations {
  status?: DecisionStatus;
  /** true ise en az bir engelleyici neden beklenir; false ise hiç beklenmez. Davranış odaklı — hangi Rule'un engellediği DEĞİL. */
  hasBlockingReason?: boolean;
  hasWarning?: boolean;
  /** Açıklama METNİNDE (kullanıcının GÖRECEĞİ dilde) geçmesi beklenen ifadeler. */
  explanationContains?: string[];
  explanationNotContains?: string[];
}

/**
 * ONAYLANAN İYİLEŞTİRME #1 — Davranış odaklı senaryo çalıştırıcı.
 * ONAYLANAN İYİLEŞTİRME #2 — Logger, gerçek davranışı BOZMADAN
 * "spy" edilir (event'ler yakalanır, dosyaya yazma DEVAM eder).
 * ONAYLANAN İYİLEŞTİRME #3 — Gemini'ye giden açıklamanın, AYNI
 * DecisionResult'tan üretildiği ve onunla ÇELİŞMEDİĞİ doğrulanır.
 */
async function runScenario(name: string, seed: ScenarioSeed, context: EvaluatorContext, expectations: ScenarioExpectations): Promise<void> {
  console.log(`\n=== SENARYO: ${name} ===`);

  const capturedLogMessages: string[] = [];
  const originalInfo = logger.info.bind(logger);
  logger.info = ((module: any, message: string, extra?: any) => {
    capturedLogMessages.push(message);
    return originalInfo(module, message, extra);
  }) as typeof logger.info;

  let decision: DecisionResult;
  try {
    const evaluators = createScenarioEvaluators(seed);
    decision = await decisionEngineService.run(evaluators, context);
  } finally {
    logger.info = originalInfo;
  }

  const explanation = decisionExplanationBuilderService.build(decision);

  // --- Davranış odaklı kontroller (ruleId DEĞİL, gözlemlenebilir sonuç) ---
  if (expectations.status) {
    check(`[${name}] status = ${expectations.status}`, decision.status === expectations.status);
  }
  if (expectations.hasBlockingReason !== undefined) {
    check(`[${name}] engelleyici neden ${expectations.hasBlockingReason ? "VAR" : "YOK"}`, (decision.blockingReasons.length > 0) === expectations.hasBlockingReason);
  }
  if (expectations.hasWarning !== undefined) {
    check(`[${name}] uyarı ${expectations.hasWarning ? "VAR" : "YOK"}`, (decision.warnings.length > 0) === expectations.hasWarning);
  }
  for (const text of expectations.explanationContains ?? []) {
    check(`[${name}] açıklama '${text}' içeriyor`, explanation.includes(text));
  }
  for (const text of expectations.explanationNotContains ?? []) {
    check(`[${name}] açıklama '${text}' İÇERMİYOR`, !explanation.includes(text));
  }

  // --- Logger: olay bazlı doğrulama (madde 2 — format değil, olay) ---
  check(`[${name}] 'Decision Engine çalıştırıldı' olayı üretildi`, capturedLogMessages.some((m) => m.includes("Decision Engine çalıştırıldı")));

  // --- Gemini tutarlılığı (madde 3): açıklama, AYNI DecisionResult'tan üretildi mi, çelişki var mı ---
  const statusTranslations: Record<DecisionStatus, string> = { OK: "Uygun", WARNING: "Dikkat Gerekiyor", BLOCKED: "Engellendi", INSUFFICIENT_DATA: "Yetersiz Veri" };
  check(`[${name}] açıklamadaki durum, DecisionResult.status ile TUTARLI`, explanation.includes(statusTranslations[decision.status]));
  if (decision.blockingReasons.length > 0) {
    check(`[${name}] açıklama, blockingReasons'ı ÇELİŞKİSİZ yansıtıyor`, decision.blockingReasons.every((r) => explanation.includes(r)));
  }
}

async function main() {
  // 1. Normal hava koşulları → PASS
  await runScenario(
    "Normal hava koşulları",
    { weatherRules: [{ id: "wr1", name: "Rüzgar Sınırı", maxWindSpeedKmh: 15, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { currentWindSpeedKmh: 10 },
    { status: "OK", hasBlockingReason: false }
  );

  // 2. Şiddetli rüzgar → BLOCK
  await runScenario(
    "Şiddetli rüzgar",
    { weatherRules: [{ id: "wr2", name: "Rüzgar Sınırı", maxWindSpeedKmh: 15, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { currentWindSpeedKmh: 25 },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["Engellendi", "gerçekleştirmeyin"] }
  );

  // 3. Yağış riski → BLOCK
  await runScenario(
    "Yağış riski",
    { weatherRules: [{ id: "wr3", name: "Yağış Yasağı", forbidsDuringPrecipitation: true, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { isPrecipitating: true },
    { status: "BLOCKED", hasBlockingReason: true }
  );

  // 4. Yüksek sıcaklık → BLOCK
  await runScenario(
    "Yüksek sıcaklık",
    { weatherRules: [{ id: "wr4", name: "Sıcaklık Sınırı", maxTemperatureC: 35, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { currentTemperatureC: 42 },
    { status: "BLOCKED", hasBlockingReason: true }
  );

  // 5. Yanlış büyüme dönemi → NOT_APPLICABLE (kısıtlama tetiklenmez, OK)
  await runScenario(
    "Yanlış büyüme dönemi",
    { phenologyRules: [{ id: "pr1", plantName: "Limon", growthStage: "Çiçeklenme", restrictionNote: "İlaçlama yapılmamalı", version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { plantName: "Limon", growthStage: "Meyve Tutumu" },
    { status: "OK", explanationNotContains: ["İlaçlama yapılmamalı"] }
  );

  // 6. Doz sınırı aşımı → FAIL/BLOCKED
  await runScenario(
    "Doz sınırı aşımı",
    { dosageRules: [{ id: "dr1", chemicalId: "chem1", plantName: "Domates", dosageAmount: 200, minimumDose: 50, maximumDose: 150, dosageUnit: "ml", intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }] },
    { chemicalId: "chem1", plantName: "Domates" },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["Doz Kontrolü"] }
  );

  // 7. Minimum doz altı → FAIL/BLOCKED
  await runScenario(
    "Minimum doz altı",
    { dosageRules: [{ id: "dr2", chemicalId: "chem2", plantName: "Domates", dosageAmount: 10, minimumDose: 50, maximumDose: 150, dosageUnit: "ml", intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }] },
    { chemicalId: "chem2", plantName: "Domates" },
    { status: "BLOCKED", hasBlockingReason: true }
  );

  // 8. Stok yetersizliği → FAIL/BLOCKED
  await runScenario(
    "Stok yetersizliği",
    { inventoryItems: [{ id: "item1", categoryId: "cat1", name: "Test Ürün", stockQuantity: 1, unit: "Litre", minStockAlert: 5, unitPrice: 10, trackStock: true, createdAt: "", updatedAt: "" }] },
    { inventoryItemIds: ["item1"] },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["Stok Kontrolü"] }
  );

  // 9. Tekrar uygulama aralığı dolmamış → FAIL/BLOCKED
  await runScenario(
    "Tekrar uygulama aralığı dolmamış",
    {
      dosageRules: [{ id: "dr3", chemicalId: "chem3", plantName: "Zeytin", dosageAmount: 100, dosageUnit: "ml", intervalDays: 14, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }],
      productApplications: [{ id: "pa1", inventoryItemId: "item1", applicationDate: new Date().toISOString(), parcelIds: ["parcel1"], treeIds: [], createdAt: "" }],
    },
    { parcelId: "parcel1", chemicalId: "chem3" },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["Geçmiş Uygulama Kontrolü"] }
  );

  // 10. Uyumsuz uygulamalar → BLOCK
  await runScenario(
    "Uyumsuz uygulamalar",
    { compatibilityRules: [{ id: "cr1", inventoryItemIdA: "A", inventoryItemIdB: "B", isCompatible: false, version: 1, isActive: true, sourceType: "Bilimsel Kaynak", createdAt: "" }] },
    { inventoryItemIds: ["A", "B"] },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["Karışabilirlik Kontrolü"] }
  );

  // 11. Eksik veri → DosageEvaluator kural bulamazsa GÜVENLİK gereği
  // blocking:true döner (bkz. Sprint 5E tasarımı: "veri eksikse asla
  // işleme izin verme") — bu, Decision Engine seviyesinde BLOCKED
  // olarak yansır (BLOCKED > INSUFFICIENT_DATA önceliği, Sprint 5C).
  // "Eksik veri" bilgisi KAYBOLMAZ — evaluatorResults ve açıklamanın
  // "EKSİK VERİLER" bölümünde hâlâ görünür (bkz. açıklama kontrolü).
  await runScenario(
    "Eksik veri (hiç DosageRule kaydı yok)",
    {},
    { chemicalId: "chem-olmayan" },
    { status: "BLOCKED", hasBlockingReason: true, explanationContains: ["EKSİK VERİLER"] }
  );

  // 12. Birden fazla uyarı → çoklu warnings
  await runScenario(
    "Birden fazla uyarı",
    {
      safetyWarnings: [{ id: "sw1", relatedChemicalId: "chem4", severity: "HIGH", message: "Uyarı A", version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }],
      weatherRules: [{ id: "wr5", name: "Nem Sınırı", maxHumidityPercent: 60, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }],
    },
    { chemicalId: "chem4", currentHumidityPercent: 80 },
    { hasWarning: true }
  );

  // 13. BLOCK senaryosu (genel doğrulama — senaryo 2 ile aynı mantık, farklı kaynak)
  await runScenario(
    "BLOCK senaryosu (genel)",
    { compatibilityRules: [{ id: "cr2", inventoryItemIdA: "X", inventoryItemIdB: "Y", isCompatible: false, version: 1, isActive: true, sourceType: "Bilimsel Kaynak", createdAt: "" }] },
    { inventoryItemIds: ["X", "Y"] },
    { status: "BLOCKED" }
  );

  // 14. WARNING senaryosu (HIGH ama CRITICAL değil → engellemez, uyarı
  // üretir). NOT: context'te chemicalId olduğu için DosageEvaluator da
  // OTOMATİK tetiklenir (bkz. senaryo 11) — bu YAN ETKİYİ önlemek için
  // geçerli bir DosageRule de sağlanıyor (böylece yalnızca
  // RiskEvaluator'ın davranışı test edilmiş olur).
  await runScenario(
    "WARNING senaryosu",
    {
      safetyWarnings: [{ id: "sw2", relatedChemicalId: "chem5", severity: "HIGH", message: "Dikkatli olun", version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }],
      dosageRules: [{ id: "dr4", chemicalId: "chem5", plantName: "Domates", dosageAmount: 100, dosageUnit: "ml", intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "" }],
    },
    { chemicalId: "chem5" },
    { hasBlockingReason: false, hasWarning: true }
  );

  // 15. PASS senaryosu (tüm veriler temiz)
  await runScenario(
    "PASS senaryosu",
    { weatherRules: [{ id: "wr6", name: "Rüzgar Sınırı", maxWindSpeedKmh: 20, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    { currentWindSpeedKmh: 5 },
    { status: "OK", hasBlockingReason: false, hasWarning: false, explanationContains: ["Uygun"] }
  );

  // 16. INSUFFICIENT_DATA senaryosu (hava kuralı var ama güncel veri yok)
  await runScenario(
    "INSUFFICIENT_DATA senaryosu (güncel hava verisi eksik)",
    { weatherRules: [{ id: "wr7", name: "Rüzgar Sınırı", maxWindSpeedKmh: 15, version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "" }] },
    {},
    { status: "INSUFFICIENT_DATA" }
  );

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) throw new Error(`${failed} test başarısız oldu`);
}

describe("real-world-scenarios", () => {
  it("mevcut senaryo doğrulamalarının tümünü PASS ile geçer", async () => {
    await main();
  });
});
