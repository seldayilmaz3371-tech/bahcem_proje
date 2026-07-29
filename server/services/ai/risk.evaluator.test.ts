/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/risk.evaluator.test.ts */

import { RiskEvaluator } from "./risk.evaluator";
import { SafetyWarningRepository } from "../../repositories/safety-warning.repository";
import { SafetyWarning } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockSafetyWarningRepository extends SafetyWarningRepository {
  constructor(private readonly mockWarnings: SafetyWarning[]) { super(); }
  public async getActiveByChemicalId(chemicalId: string): Promise<SafetyWarning[]> {
    return this.mockWarnings.filter((w) => w.relatedChemicalId === chemicalId);
  }
}

async function main() {
  const generalWarning: SafetyWarning = {
    id: "sw-general", relatedChemicalId: "chem-1", severity: "CRITICAL", message: "Genel kritik uyarı (koşulsuz)",
    version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
  };
  const conditionalWarning: SafetyWarning = {
    id: "sw-conditional", relatedChemicalId: "chem-1", severity: "HIGH", message: "Domates için özel uyarı",
    triggerCondition: "Domates bitkisinde kullanılıyorsa dikkat", version: 1, isActive: true, sourceType: "Uzman Onayı", createdAt: "",
  };

  console.log("=== supports() (regresyon) ===");
  const evaluator = new RiskEvaluator(new MockSafetyWarningRepository([generalWarning, conditionalWarning]));
  check("chemicalId varsa supports=true", evaluator.supports({ chemicalId: "chem-1" }));
  check("chemicalId yoksa supports=false", !evaluator.supports({}));

  console.log("\n=== evaluate() — koşulsuz CRITICAL uyarı HER ZAMAN geçerli (regresyon) ===");
  const resultNoContext = await evaluator.evaluate({ chemicalId: "chem-1" });
  check("Koşulsuz uyarı plantName olmadan bile geçerli", resultNoContext.warnings?.includes("Genel kritik uyarı (koşulsuz)"));
  check("CRITICAL varsa blocking=true", resultNoContext.blocking === true);

  console.log("\n=== YENİ: evaluate() — koşullu uyarı, plantName EŞLEŞİYOR ===");
  const resultMatch = await evaluator.evaluate({ chemicalId: "chem-1", plantName: "Domates" });
  check("Eşleşen koşullu uyarı da dahil", resultMatch.warnings?.includes("Domates için özel uyarı"));

  console.log("\n=== YENİ: evaluate() — koşullu uyarı, plantName EŞLEŞMİYOR ===");
  const resultNoMatch = await evaluator.evaluate({ chemicalId: "chem-1", plantName: "Zeytin" });
  check("Eşleşmeyen koşullu uyarı DAHIL EDİLMİYOR", !resultNoMatch.warnings?.includes("Domates için özel uyarı"));
  check("Koşulsuz uyarı yine de dahil", resultNoMatch.warnings?.includes("Genel kritik uyarı (koşulsuz)"));

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
