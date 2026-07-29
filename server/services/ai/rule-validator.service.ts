/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DosageRule } from "../../models";

/**
 * Sprint 5E — RuleValidatorService.
 *
 * KÖKEN: Sprint 5A Revizyonu'nda mimari ÖNERİ olarak bırakılmıştı
 * ("Decision Engine'in güvenilirliği için gerçekten gerekli ise
 * oluştur"). Bu sprintte Evaluator'lar artık Rule İÇERİĞİNİ (yalnızca
 * varlığını değil) GERÇEKTEN yorumladığı için gereklilik netleşti:
 * hatalı bir Rule kaydı (örn. minimumDose > maximumDose), Decision
 * Engine'in YANLIŞ bir karara varmasına yol açabilir.
 *
 * KAPSAM SINIRI: Bu servis yalnızca ÇAPRAZ ALAN (birden fazla alanı
 * birlikte değerlendiren) iş kurallarını doğrular — repository
 * seviyesindeki temel CRUD veya route seviyesindeki "zorunlu alan"
 * validasyonuna HİÇ dokunulmadı (talimat: "Repository validation'ını
 * değiştirme, Route validation'ını değiştirme").
 */

export interface RuleValidationResult {
  isValid: boolean;
  errors: string[];
}

export class RuleValidatorService {
  /**
   * Bir DosageRule'un çapraz alan tutarlılığını kontrol eder:
   * - minimumDose <= maximumDose (verilmişlerse)
   * - dosageAmount, min-max aralığının İÇİNDE mi (verilmişlerse)
   * - version >= 1 (geriye giden bir versiyon numarası anlamsızdır)
   * - pasif (isActive=false) bir kural, DecisionEngine tarafından ASLA
   *   kullanılmamalıdır — bu kontrol burada değil, repository'nin
   *   `getActiveByX()` metotlarında ZATEN uygulanıyor (bkz. Sprint 5A/5D);
   *   burada YALNIZCA ek bir güvenlik notu olarak doğrulanıyor.
   */
  public validateDosageRule(rule: DosageRule): RuleValidationResult {
    const errors: string[] = [];

    if (rule.minimumDose !== undefined && rule.maximumDose !== undefined && rule.minimumDose > rule.maximumDose) {
      errors.push(`minimumDose (${rule.minimumDose}) maximumDose'dan (${rule.maximumDose}) büyük olamaz.`);
    }
    if (rule.minimumDose !== undefined && rule.dosageAmount < rule.minimumDose) {
      errors.push(`Önerilen doz (${rule.dosageAmount}) minimumDose'un (${rule.minimumDose}) altında.`);
    }
    if (rule.maximumDose !== undefined && rule.dosageAmount > rule.maximumDose) {
      errors.push(`Önerilen doz (${rule.dosageAmount}) maximumDose'un (${rule.maximumDose}) üzerinde.`);
    }
    if (rule.version < 1) {
      errors.push(`Geçersiz versiyon numarası: ${rule.version}.`);
    }
    if (!rule.isActive && !rule.supersededBy) {
      errors.push("Pasif bir kural, hangi kaydın onun yerini aldığını (supersededBy) belirtmeli.");
    }

    return { isValid: errors.length === 0, errors };
  }
}

export const ruleValidatorService = new RuleValidatorService();
