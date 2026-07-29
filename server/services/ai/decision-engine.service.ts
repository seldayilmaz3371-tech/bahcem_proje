/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";
import { Evaluator, EvaluatorContext, EvaluatorResult, EvaluatorPriority } from "./evaluator-framework.service";
import { decisionTemplateRepository } from "../../repositories/decision-template.repository";
import { DecisionTemplate } from "../../models";

/**
 * Sprint 5C — Decision Engine Core.
 *
 * TEMEL PRENSİP: Bu servis, Evaluator Framework'ün (Sprint 5B) ÜZERİNE
 * inşa edilen çekirdek çalıştırma motorudur — YENİ bir framework İCAT
 * EDİLMEDİ, mevcut `Evaluator`/`EvaluatorResult` sözleşmesi olduğu gibi
 * kullanıldı. Gemini/AI açıklama katmanına HİÇ bağlanmadı (bkz. Sprint
 * 5C talimatı) — bu, tamamen deterministik bir çekirdektir.
 *
 * "AI/kural sistemi asla tahmin üretmesin" ilkesi burada da geçerli:
 * herhangi bir Evaluator "INSUFFICIENT_DATA" dönerse, DecisionResult
 * da bunu YANSITIR — hiçbir zaman eksik veriyi "varsayılan" bir
 * kararla gizlemez.
 */

/**
 * DecisionResult'ın ÖZET durumu — `EvaluatorResult.status`'ten
 * KASITLI OLARAK farklı bir enum: EvaluatorResult tekil bir
 * değerlendirmenin sonucu, DecisionResult ise BİRDEN FAZLA
 * EvaluatorResult'ın TOPLAMININ özetidir. Öncelik sırası (en kötü
 * senaryo kazanır): BLOCKED > INSUFFICIENT_DATA > WARNING > OK.
 */
export type DecisionStatus = "OK" | "WARNING" | "BLOCKED" | "INSUFFICIENT_DATA";

export interface ConflictInfo {
  description: string;
  conflictingEvaluatorNames: string[];
}

export interface DecisionResult {
  status: DecisionStatus;
  /** En yüksek öncelikli/en kritik sonucun kısa özeti. */
  reason: string;
  warnings: string[];
  /** Yalnızca blocking=true olan sonuçların sebepleri — warnings'ten AYRI tutuluyor, çünkü bunlar daha kritik ve ayrı izlenmeli. */
  blockingReasons: string[];
  evidence: string[];
  /** supports()=true dönüp GERÇEKTEN çalıştırılan evaluator adları (supports=false olanlar dahil değil). */
  executedEvaluators: string[];
  /** Ham sonuçlar — her evaluator'ın kendi status/priority/ruleId/ruleVersion/metadata bilgisi (açıklanabilirlik için, önceki mimari raporun "hangi evaluator hangi kararı verdi" gereksinimi). */
  evaluatorResults: EvaluatorResult[];
  conflicts: ConflictInfo[];
  executionTimeMs: number;
  /**
   * Sprint 5D — henüz KARAR üretmeden, bu bağlam (context.plantName)
   * için aktif olan DecisionTemplate kayıtlarını taşır. Yalnızca
   * context.plantName verildiyse doldurulur (aksi halde boş dizi) —
   * "Decision Engine, uygun DecisionTemplate'leri kullanabilmelidir.
   * Henüz karar üretme mantığı yazılmayacaktır" talimatının doğrudan
   * karşılığı.
   */
  availableDecisionTemplates: DecisionTemplate[];
}

/** EvaluatorPriority sıralaması — sayı küçüldükçe öncelik artar. CRITICAL en önemli. */
const PRIORITY_ORDER: Record<EvaluatorPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
  INFO: 4,
};

export class DecisionEngineService {
  /**
   * Verilen Evaluator listesini, verilen context üzerinde SIRALI olarak
   * (paralel YOK — bkz. Sprint 5C talimatı: "önce deterministik
   * davranış garanti edilsin") çalıştırır ve tek bir DecisionResult
   * üretir.
   */
  public async run(evaluators: Evaluator[], context: EvaluatorContext): Promise<DecisionResult> {
    const startTime = Date.now();

    // 1. Evaluator Selection + supports()
    const applicableEvaluators = evaluators.filter((e) => e.supports(context));

    // 2. evaluate() — SIRALI (talimat gereği, paralellik bu sprintte eklenmiyor).
    // Evaluator ve kendi sonucu BİRLİKTE (çift olarak) tutuluyor — yalnızca
    // index'e güvenmek, sıralama sonrası eşleşmenin bozulmasına yol açardı
    // (bkz. aşağıdaki `pairs.sort()`). Her evaluator'ın kendi çalışma
    // süresi de (Sprint 5D loglama gereksinimi) burada ölçülüyor —
    // Evaluator'ların kendi kodlarına HİÇ dokunulmadı, yalnızca
    // orkestrasyon genişletildi.
    const pairs: { evaluator: Evaluator; result: EvaluatorResult; durationMs: number }[] = [];
    for (const evaluator of applicableEvaluators) {
      const evaluatorStart = Date.now();
      const result = await evaluator.evaluate(context);
      pairs.push({ evaluator, result, durationMs: Date.now() - evaluatorStart });
    }

    // 3. Priority Ordering — sonuçlar, EvaluatorResult.priority alanına göre sıralanır (Evaluator'ın kendisinde SABİT priority kullanılmadı, bkz. Sprint 5B).
    const orderedPairs = [...pairs].sort((a, b) => PRIORITY_ORDER[a.result.priority] - PRIORITY_ORDER[b.result.priority]);

    // 4. Conflict Detection
    const conflicts = this.detectConflicts(orderedPairs);

    // Sprint 5D — DecisionTemplate Entegrasyonu: yalnızca context.plantName
    // verildiyse (ve repository hata vermeden) aktif template'ler okunur.
    // Repository hatası Decision Engine'i ÇÖKERTMEZ (bkz. Hata Yönetimi).
    let availableDecisionTemplates: DecisionTemplate[] = [];
    if (context.plantName) {
      try {
        availableDecisionTemplates = await decisionTemplateRepository.getActiveByPlantName(context.plantName);
      } catch (error) {
        logger.error("AI", "DecisionTemplate okuma hatası — boş liste ile devam ediliyor.", error);
      }
    }

    // 5. Decision Assembly
    const decision = this.assembleDecision(orderedPairs, conflicts, availableDecisionTemplates, Date.now() - startTime);

    // Sprint 5D — Görev: "yüklenen rule sayısı, aktif rule sayısı,
    // evaluator bazında kullanılan rule sayısı, evaluator çalışma
    // süresi, toplam engine süresi" loglanmalı.
    logger.info("AI", `Decision Engine çalıştırıldı: status=${decision.status}`, {
      executedEvaluatorCount: applicableEvaluators.length,
      conflictCount: conflicts.length,
      totalExecutionTimeMs: decision.executionTimeMs,
      executedEvaluators: decision.executedEvaluators,
      availableDecisionTemplateCount: availableDecisionTemplates.length,
      evaluatorBreakdown: orderedPairs.map((p) => ({
        evaluator: p.evaluator.name,
        durationMs: p.durationMs,
        loadedRuleCount: p.result.metadata?.loadedRuleCount ?? 0,
        activeRuleCount: p.result.metadata?.activeRuleCount ?? 0,
      })),
    });

    return decision;
  }

  /**
   * Sprint 5C — Conflict Detection altyapısı. Gerçek tarımsal çelişki
   * KURALLARI henüz yazılmıyor (bkz. talimat) — yalnızca TEMEL bir
   * tespit yapılıyor: aynı çalıştırmada hem engelleyici olmayan bir
   * PASS hem de engelleyici (blocking) bir sonuç birlikte geldiyse,
   * bu açıkça loglanabilir bir "karma sonuç" durumudur.
   */
  private detectConflicts(pairs: { evaluator: Evaluator; result: EvaluatorResult; durationMs: number }[]): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    const hasPassing = pairs.some((p) => p.result.status === "PASS" && !p.result.blocking);
    const hasBlocking = pairs.some((p) => p.result.blocking);

    if (hasPassing && hasBlocking) {
      const blockingNames = pairs.filter((p) => p.result.blocking).map((p) => p.evaluator.name);
      conflicts.push({
        description: "Bazı değerlendirmeler işleme izin verirken, bazıları engelliyor.",
        conflictingEvaluatorNames: blockingNames,
      });
    }

    return conflicts;
  }

  /** Ham EvaluatorResult listesinden tek bir DecisionResult üretir — hiçbir tahmin yapılmaz, yalnızca mevcut sonuçlar özetlenir. */
  private assembleDecision(
    orderedPairs: { evaluator: Evaluator; result: EvaluatorResult; durationMs: number }[],
    conflicts: ConflictInfo[],
    availableDecisionTemplates: DecisionTemplate[],
    executionTimeMs: number
  ): DecisionResult {
    const orderedResults = orderedPairs.map((p) => p.result);
    const warnings = orderedResults.flatMap((r) => r.warnings ?? []);
    const blockingReasons = orderedResults.filter((r) => r.blocking).map((r) => r.reason);
    const evidence = orderedResults.flatMap((r) => r.evidence ?? []);
    const executedEvaluators = orderedPairs.map((p) => p.evaluator.name);

    // Öncelik sırası (en kötü senaryo kazanır): BLOCKED > INSUFFICIENT_DATA > WARNING > OK.
    let status: DecisionStatus;
    let reason: string;

    if (orderedResults.some((r) => r.blocking)) {
      status = "BLOCKED";
      reason = orderedResults.find((r) => r.blocking)!.reason;
    } else if (orderedResults.some((r) => r.status === "INSUFFICIENT_DATA")) {
      status = "INSUFFICIENT_DATA";
      reason = orderedResults.find((r) => r.status === "INSUFFICIENT_DATA")!.reason;
    } else if (warnings.length > 0 || orderedResults.some((r) => r.status === "FAIL")) {
      status = "WARNING";
      reason = orderedResults.find((r) => r.status === "FAIL")?.reason ?? warnings[0];
    } else if (orderedResults.length > 0) {
      status = "OK";
      reason = orderedResults[0].reason;
    } else {
      // Hiçbir evaluator uygulanabilir değildi (boş liste ya da hiçbiri supports() geçmedi).
      status = "OK";
      reason = "Bu bağlam için değerlendirilecek herhangi bir kural bulunamadı.";
    }

    return {
      status,
      reason,
      warnings,
      blockingReasons,
      evidence,
      executedEvaluators,
      evaluatorResults: orderedResults,
      conflicts,
      executionTimeMs,
      availableDecisionTemplates,
    };
  }
}

export const decisionEngineService = new DecisionEngineService();
