/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/decision-explanation-builder.test.ts */

import { decisionExplanationBuilderService } from "./decision-explanation-builder.service";
import { DecisionResult } from "./decision-engine.service";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

function buildMockDecision(overrides: Partial<DecisionResult> = {}): DecisionResult {
  return {
    status: "OK",
    reason: "Test gerekçesi",
    warnings: [],
    blockingReasons: [],
    evidence: [],
    executedEvaluators: [],
    evaluatorResults: [],
    conflicts: [],
    executionTimeMs: 5,
    availableDecisionTemplates: [],
    ...overrides,
  };
}

async function main() {
  console.log("=== Gemini Güvenlik Talimatı — HER ZAMAN mevcut olmalı (karar değiştirme yasağı) ===");
  const okDecision = buildMockDecision();
  const okPrompt = decisionExplanationBuilderService.build(okDecision);
  check("'DEĞİŞTİRME' talimatı var", okPrompt.includes("DEĞİŞTİRME"));
  check("'yeni bir karar ÜRETME' talimatı var", okPrompt.includes("ÜRETME"));
  check("'kural UYDURMA' talimatı var", okPrompt.includes("UYDURMA"));
  check("'belirsizlik ÜRETME' talimatı var", okPrompt.includes("belirsizlik"));

  console.log("\n=== DecisionResult'ın TÜM alanları eksiksiz aktarılıyor mu ===");
  const fullDecision = buildMockDecision({
    status: "BLOCKED",
    reason: "Tam gerekçe metni",
    warnings: ["Uyarı A", "Uyarı B"],
    blockingReasons: ["Engel Sebebi X"],
    evidence: ["Kanıt 1", "Kanıt 2"],
    executedEvaluators: ["DosageEvaluator", "WeatherEvaluator"],
  });
  const fullPrompt = decisionExplanationBuilderService.build(fullDecision);
  check("reason aktarılıyor", fullPrompt.includes("Tam gerekçe metni"));
  check("TÜM warnings aktarılıyor", fullPrompt.includes("Uyarı A") && fullPrompt.includes("Uyarı B"));
  check("TÜM blockingReasons aktarılıyor", fullPrompt.includes("Engel Sebebi X"));
  check("TÜM evidence aktarılıyor (EK KANIT NOTLARI olarak)", fullPrompt.includes("Kanıt 1") && fullPrompt.includes("Kanıt 2"));
  check("executedEvaluators artık TÜRKÇE gösteriliyor (Sprint 5G — İngilizce sınıf adı DEĞİL)", fullPrompt.includes("Doz Kontrolü") && fullPrompt.includes("Hava Koşulları Kontrolü") && !fullPrompt.includes("DosageEvaluator") && !fullPrompt.includes("WeatherEvaluator"));

  console.log("\n=== Status çevirisi doğru mu (4 durum) ===");
  check("OK -> Uygun", decisionExplanationBuilderService.build(buildMockDecision({ status: "OK" })).includes("Uygun"));
  check("WARNING -> Dikkat Gerekiyor", decisionExplanationBuilderService.build(buildMockDecision({ status: "WARNING" })).includes("Dikkat Gerekiyor"));
  check("BLOCKED -> Engellendi", decisionExplanationBuilderService.build(buildMockDecision({ status: "BLOCKED" })).includes("Engellendi"));
  check("INSUFFICIENT_DATA -> Yetersiz Veri", decisionExplanationBuilderService.build(buildMockDecision({ status: "INSUFFICIENT_DATA" })).includes("Yetersiz Veri"));

  console.log("\n=== Boş listeler (warnings/evidence/blockingReasons) gereksiz bölüm ÜRETMEMELİ ===");
  const emptyDecision = buildMockDecision();
  const emptyPrompt = decisionExplanationBuilderService.build(emptyDecision);
  check("Boş warnings için 'Uyarılar:' bölümü YOK", !emptyPrompt.includes("Uyarılar:"));
  check("Boş evidence için 'Kanıtlar:' bölümü YOK", !emptyPrompt.includes("Kanıtlar:"));

  console.log("\n=== executedEvaluators boşsa açık bir mesaj gösteriliyor ===");
  const noEvaluatorsPrompt = decisionExplanationBuilderService.build(buildMockDecision({ executedEvaluators: [] }));
  check("Boş evaluator listesi için açıklayıcı metin var (Sprint 5G — yeni metin)", noEvaluatorsPrompt.includes("uygulanabilir bir kontrol bulunamadı"));

  // ============================================================
  // SPRINT 5G — Şablon Seçimi: her biri GERÇEK, gerçekçi bir
  // DecisionResult senaryosuyla test ediliyor (talimat: "her yeni
  // açıklama şablonunun gerçek bir DecisionResult senaryosuyla test
  // edildiğini raporda açıkça göster").
  // ============================================================

  console.log("\n=== ŞABLON: İlaçlama (DosageEvaluator ağırlıklı) ===");
  const dosageScenario = buildMockDecision({
    status: "OK",
    reason: "Doğrulanmış dozaj kuralı bulundu: 100 ml/100L (aralık içinde).",
    executedEvaluators: ["DosageEvaluator", "CompatibilityEvaluator"],
    evaluatorResults: [
      { status: "PASS", priority: "NORMAL", blocking: false, reason: "Doz uygun", ruleId: "dr-1", ruleVersion: 2 },
      { status: "NOT_APPLICABLE", priority: "INFO", blocking: false, reason: "Karışım yok" },
    ],
  });
  check("İlaçlama şablonu seçiliyor", decisionExplanationBuilderService.getSelectedTemplateName(dosageScenario) === "İlaçlama");
  const dosagePrompt = decisionExplanationBuilderService.build(dosageScenario);
  check("İlaçlama promptunda 'Doz Kontrolü' (Türkçe) var, 'DosageEvaluator' (İngilizce) YOK", dosagePrompt.includes("Doz Kontrolü") && !dosagePrompt.includes("DosageEvaluator"));

  console.log("\n=== ŞABLON: Gübreleme (NutritionEvaluator ağırlıklı) ===");
  const nutritionScenario = buildMockDecision({
    status: "OK",
    reason: "Doğrulanmış beslenme kuralı bulundu.",
    executedEvaluators: ["NutritionEvaluator"],
    evaluatorResults: [{ status: "PASS", priority: "NORMAL", blocking: false, reason: "Beslenme uygun", ruleId: "nr-1", ruleVersion: 1 }],
  });
  check("Gübreleme şablonu seçiliyor", decisionExplanationBuilderService.getSelectedTemplateName(nutritionScenario) === "Gübreleme");

  console.log("\n=== ŞABLON: Genel Bakım (WeatherEvaluator/PhenologyEvaluator ağırlıklı) ===");
  const generalScenario = buildMockDecision({
    status: "OK",
    reason: "Güncel hava koşulları tüm aktif kuralların sınırları içinde.",
    executedEvaluators: ["WeatherEvaluator", "PhenologyEvaluator"],
    evaluatorResults: [
      { status: "PASS", priority: "INFO", blocking: false, reason: "Hava uygun" },
      { status: "NOT_APPLICABLE", priority: "INFO", blocking: false, reason: "Dönem eşleşmiyor" },
    ],
  });
  check("Genel Bakım şablonu seçiliyor", decisionExplanationBuilderService.getSelectedTemplateName(generalScenario) === "Genel Bakım");

  console.log("\n=== ŞABLON: Risk Uyarısı (CRITICAL + BLOCKED) ===");
  const riskScenario = buildMockDecision({
    status: "BLOCKED",
    reason: "Rüzgar eşiği aşıldı",
    blockingReasons: ["Rüzgar 18km/h, izin verilen 15km/h"],
    executedEvaluators: ["WeatherEvaluator"],
    evaluatorResults: [{ status: "FAIL", priority: "CRITICAL", blocking: true, reason: "Rüzgar eşiği aşıldı" }],
  });
  check("Risk Uyarısı şablonu seçiliyor", decisionExplanationBuilderService.getSelectedTemplateName(riskScenario) === "Risk Uyarısı");
  const riskPrompt = decisionExplanationBuilderService.build(riskScenario);
  check("Risk Uyarısı sonraki adımda 'gerçekleştirmeyin' uyarısı var", riskPrompt.includes("gerçekleştirmeyin"));

  console.log("\n=== ŞABLON: Bilgi Yetersizliği (INSUFFICIENT_DATA) ===");
  const insufficientScenario = buildMockDecision({
    status: "INSUFFICIENT_DATA",
    reason: "Bu ilaç için doğrulanmış bir dozaj kuralı bulunamadı.",
    executedEvaluators: ["DosageEvaluator"],
    evaluatorResults: [{ status: "INSUFFICIENT_DATA", priority: "HIGH", blocking: true, reason: "Dozaj kuralı bulunamadı" }],
  });
  check("Bilgi Yetersizliği şablonu seçiliyor", decisionExplanationBuilderService.getSelectedTemplateName(insufficientScenario) === "Bilgi Yetersizliği");
  const insufficientPrompt = decisionExplanationBuilderService.build(insufficientScenario);
  check("Eksik veriler bölümü (madde 7) doğru dolduruluyor", insufficientPrompt.includes("7. EKSİK VERİLER") && insufficientPrompt.includes("Doz Kontrolü: Dozaj kuralı bulunamadı"));

  console.log("\n=== 8 Maddelik Sıra Kontrolü (talimattaki TAM sıra) ===");
  const fullOrderPrompt = decisionExplanationBuilderService.build(buildMockDecision({
    status: "WARNING",
    reason: "Test",
    warnings: ["Test uyarısı"],
    blockingReasons: [],
    executedEvaluators: ["RiskEvaluator"],
    evaluatorResults: [{ status: "FAIL", priority: "HIGH", blocking: false, reason: "Risk var", warnings: ["Test uyarısı"] }],
  }));
  const order = ["1. KARARIN ÖZETİ", "2. NEDEN", "3. ETKİLİ KURALLAR", "4. YAPILAN KONTROLLER", "5. UYARILAR", "8. ÖNERİLEN SONRAKİ ADIM"];
  const indices = order.map((marker) => fullOrderPrompt.indexOf(marker));
  check("8 maddelik sıra doğru (her biri bir öncekinden sonra geliyor)", indices.every((idx, i) => i === 0 || idx > indices[i - 1]));

  console.log("\n=== Saha Dili: teknik sınıf adları hiçbir promptta görünmemeli ===");
  const allScenarios = [dosageScenario, nutritionScenario, generalScenario, riskScenario, insufficientScenario];
  const noEnglishNames = allScenarios.every((s) => {
    const p = decisionExplanationBuilderService.build(s);
    return !p.includes("Evaluator");
  });
  check("Hiçbir promptta İngilizce '...Evaluator' sınıf adı yok", noEnglishNames);

  console.log("\n=== Bilinmeyen (haritada olmayan) evaluator adı — çökmemeli, güvenli varsayılan kullanmalı ===");
  const unknownEvaluatorScenario = buildMockDecision({
    executedEvaluators: ["GelecektekiYeniEvaluator"],
    evaluatorResults: [{ status: "PASS", priority: "NORMAL", blocking: false, reason: "Test" }],
  });
  const unknownPrompt = decisionExplanationBuilderService.build(unknownEvaluatorScenario);
  check("Bilinmeyen evaluator için çökmüyor, güvenli varsayılan gösteriyor", unknownPrompt.includes("Diğer Kontroller"));

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
