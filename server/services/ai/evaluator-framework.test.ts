/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 5B — Evaluator Framework Unit Testleri.
 *
 * Çalıştırma: npx tsx server/services/ai/evaluator-framework.test.ts
 *
 * Mevcut projede bir test framework'ü (Jest/Vitest) KURULU DEĞİL —
 * "yeni standart oluşturma" ilkesine göre yeni bir bağımlılık
 * eklenmedi. Bu dosya, projenin mevcut test yaklaşımıyla (tsx ile
 * çalıştırılan, gerçek repository yerine MOCK nesneler kullanan saf
 * TypeScript) tutarlıdır.
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

/** Kasıtlı olarak hata fırlatan bir Evaluator — BaseEvaluator'ın hata yönetimini test etmek için. */
class ThrowingEvaluator extends BaseEvaluator {
  public readonly name = "ThrowingEvaluator";
  public supports(): boolean { return true; }
  protected async doEvaluate(): Promise<EvaluatorResult> {
    throw new Error("Kasıtlı test hatası");
  }
}

/** Normal çalışan bir Evaluator — temel akışı test etmek için. */
class WorkingEvaluator extends BaseEvaluator {
  public readonly name = "WorkingEvaluator";
  public supports(): boolean { return true; }
  protected async doEvaluate(): Promise<EvaluatorResult> {
    return { status: "PASS", priority: "NORMAL", blocking: false, reason: "Test başarılı" };
  }
}

async function main() {
  console.log("=== BaseEvaluator hata yönetimi ===");
  const throwing = new ThrowingEvaluator();
  const result = await throwing.evaluate({});
  check("Hata fırlatıldığında çökmüyor, INSUFFICIENT_DATA dönüyor", result.status === "INSUFFICIENT_DATA");
  check("Hata durumunda blocking=false (güvenli varsayılan)", result.blocking === false);
  check("Hata mesajı reason'da açıklanıyor", result.reason.includes("ThrowingEvaluator"));

  console.log("\n=== BaseEvaluator normal akış ===");
  const working = new WorkingEvaluator();
  const workingResult = await working.evaluate({});
  check("Normal calisma dogru sonuc donuyor", workingResult.status === "PASS");

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
