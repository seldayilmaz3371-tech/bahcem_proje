/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/decision-engine.test.ts */

import { decisionEngineService } from "./decision-engine.service";
import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

/** Mock Evaluator — sabit bir sonuç döndürür, gerçek repository'ye hiç dokunmaz. */
class MockEvaluator extends BaseEvaluator {
  constructor(
    public readonly name: string,
    private readonly result: EvaluatorResult,
    private readonly supportsResult: boolean = true
  ) {
    super();
  }
  public supports(): boolean { return this.supportsResult; }
  protected async doEvaluate(): Promise<EvaluatorResult> { return this.result; }
}

/** Kasıtlı olarak hata fırlatan Mock Evaluator — DecisionEngine'in de (BaseEvaluator'ın yakaladığı hatanın) doğru işlendiğini kanıtlamak için. */
class ThrowingMockEvaluator extends BaseEvaluator {
  public readonly name = "ThrowingMockEvaluator";
  public supports(): boolean { return true; }
  protected async doEvaluate(): Promise<EvaluatorResult> { throw new Error("Kasıtlı test hatası"); }
}

/** Repository hatasını simüle eden Mock Evaluator — bir repository'nin kendisi (örn. disk okuma hatası) exception fırlatırsa. */
class RepositoryFailingEvaluator extends BaseEvaluator {
  public readonly name = "RepositoryFailingEvaluator";
  public supports(): boolean { return true; }
  protected async doEvaluate(): Promise<EvaluatorResult> {
    throw new Error("Repository erişim hatası (simüle edilmiş)");
  }
}

const pass = (name: string): EvaluatorResult => ({ status: "PASS", priority: "NORMAL", blocking: false, reason: `${name} PASS` });
const warn = (name: string): EvaluatorResult => ({ status: "FAIL", priority: "NORMAL", blocking: false, reason: `${name} uyarı`, warnings: [`${name} uyarısı`] });
const block = (name: string, priority: "CRITICAL" | "HIGH" = "CRITICAL"): EvaluatorResult => ({ status: "FAIL", priority, blocking: true, reason: `${name} ENGELLİYOR` });
const insufficientData = (name: string): EvaluatorResult => ({ status: "INSUFFICIENT_DATA", priority: "HIGH", blocking: false, reason: `${name} veri yetersiz` });

async function main() {
  console.log("=== SENARYO 1: Tüm evaluator PASS ===");
  const r1 = await decisionEngineService.run([new MockEvaluator("E1", pass("E1")), new MockEvaluator("E2", pass("E2"))], {});
  check("status=OK", r1.status === "OK");
  check("executedEvaluators dogru sayida", r1.executedEvaluators.length === 2);

  console.log("\n=== SENARYO 2: WARNING ===");
  const r2 = await decisionEngineService.run([new MockEvaluator("E1", pass("E1")), new MockEvaluator("E2", warn("E2"))], {});
  check("status=WARNING", r2.status === "WARNING");
  check("warnings dolu", r2.warnings.length === 1);

  console.log("\n=== SENARYO 3: BLOCK ===");
  const r3 = await decisionEngineService.run([new MockEvaluator("E1", pass("E1")), new MockEvaluator("E2", block("E2"))], {});
  check("status=BLOCKED", r3.status === "BLOCKED");
  check("blockingReasons dolu", r3.blockingReasons.length === 1);
  check("BLOCKED, WARNING'den daha oncelikli (en kotu senaryo kazanir)", r3.status === "BLOCKED");

  console.log("\n=== SENARYO 4: INSUFFICIENT_DATA ===");
  const r4 = await decisionEngineService.run([new MockEvaluator("E1", pass("E1")), new MockEvaluator("E2", insufficientData("E2"))], {});
  check("status=INSUFFICIENT_DATA", r4.status === "INSUFFICIENT_DATA");

  console.log("\n=== SENARYO 5: Evaluator exception (BaseEvaluator yakaliyor, engine cokmuyor) ===");
  const r5 = await decisionEngineService.run([new ThrowingMockEvaluator()], {});
  check("Cokmeden INSUFFICIENT_DATA sonucu uretiliyor", r5.status === "INSUFFICIENT_DATA");

  console.log("\n=== SENARYO 6: supports()=false olan evaluator CALISTIRILMAMALI ===");
  const r6 = await decisionEngineService.run([
    new MockEvaluator("E1", pass("E1")),
    new MockEvaluator("E2-Desteklenmiyor", pass("E2"), false),
  ], {});
  check("Yalnizca supports=true olan calisiyor", r6.executedEvaluators.length === 1 && r6.executedEvaluators[0] === "E1");

  console.log("\n=== SENARYO 7: Priority ordering (CRITICAL, HIGH'dan once gelmeli) ===");
  const r7 = await decisionEngineService.run([
    new MockEvaluator("HighPrio", block("HighPrio", "HIGH")),
    new MockEvaluator("CriticalPrio", block("CriticalPrio", "CRITICAL")),
  ], {});
  check("evaluatorResults CRITICAL once sirali", r7.evaluatorResults[0].priority === "CRITICAL");

  console.log("\n=== SENARYO 8: Conflict Detection (PASS + BLOCK ayni anda) ===");
  const r8 = await decisionEngineService.run([new MockEvaluator("E1", pass("E1")), new MockEvaluator("E2", block("E2"))], {});
  check("Conflict tespit edildi", r8.conflicts.length === 1);
  check("Conflict, engelleyen evaluator'i dogru isaretliyor", r8.conflicts[0].conflictingEvaluatorNames.includes("E2"));

  console.log("\n=== SENARYO 9: Bos evaluator listesi ===");
  const r9 = await decisionEngineService.run([], {});
  check("Bos listede cokmez, status=OK", r9.status === "OK");
  check("executedEvaluators bos", r9.executedEvaluators.length === 0);

  console.log("\n=== SENARYO 10: Tek evaluator ===");
  const r10 = await decisionEngineService.run([new MockEvaluator("Tek", pass("Tek"))], {});
  check("Tek evaluator dogru calisiyor", r10.status === "OK" && r10.executedEvaluators.length === 1);

  console.log("\n=== SENARYO 11 (Sprint 5D): Repository exception — engine cokmemeli, guvenli devam etmeli ===");
  const r11 = await decisionEngineService.run([new MockEvaluator("Saglikli", pass("Saglikli")), new RepositoryFailingEvaluator()], {});
  check("Repository hatasi olsa bile DecisionEngine cokmuyor", r11.status !== undefined);
  check("Saglikli evaluator'un sonucu hala mevcut", r11.evaluatorResults.some((r) => r.reason === "Saglikli PASS"));
  check("Hatali evaluator INSUFFICIENT_DATA'ya donusuyor", r11.evaluatorResults.some((r) => r.status === "INSUFFICIENT_DATA"));

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
