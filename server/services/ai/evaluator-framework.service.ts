/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../../logger";

/**
 * Sprint 5B — Evaluator Framework.
 *
 * TEMEL PRENSİP: Bu framework, Decision Engine'in (henüz yazılmayan)
 * her bir "değerlendirme biriminin" uyacağı ORTAK SÖZLEŞMEYİ tanımlar.
 * Hiçbir Evaluator burada gerçek bir karar ÜRETMEZ — yalnızca framework
 * doğrulanıyor (bkz. Sprint 5B talimatı: "gerçek karar üretmeyecek,
 * yalnızca iskelet implementasyon").
 *
 * MİMARİ REFERANS: Bu desen, kanıtlanmış `ConfidenceService`'in
 * `ConfidenceRule` deseninin ({name, evaluate(): Result|null})
 * DOĞRUDAN genişletilmesidir — yeni bir mimari İCAT EDİLMEDİ.
 *
 * DEPENDENCY INJECTION: Mevcut proje hiçbir DI framework'ü kullanmıyor
 * (tüm servisler singleton export). Bu yüzden burada da bir DI
 * kütüphanesi İCAT EDİLMEDİ — Evaluator'lar, bağımlılıklarını (ileride
 * repository'ler) kendi CONSTRUCTOR'LARINDA parametre olarak alacak
 * şekilde tasarlanır (Constructor Injection, framework'süz,
 * TypeScript'in doğal desteğiyle) — bu, hem test edilebilirliği hem
 * mock edilebilirliği sağlar, hiçbir yeni bağımlılık eklemeden.
 */

/** SafetyWarning.severity (Sprint 5A) ile BİREBİR TUTARLI — yeni bir öncelik kümesi İCAT EDİLMEDİ. */
export type EvaluatorPriority = "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | "INFO";

export type EvaluatorStatus = "PASS" | "FAIL" | "NOT_APPLICABLE" | "INSUFFICIENT_DATA";

/**
 * Bir Evaluator'ın değerlendirme yapmak için ihtiyaç duyabileceği
 * bağlam. Kasıtlı olarak GENİŞ ve TÜMÜ OPSİYONEL — her Evaluator
 * yalnızca kendi ilgilendiği alanlara bakar (bkz. supports()).
 */
export interface EvaluatorContext {
  plantName?: string;
  cropType?: string;
  chemicalId?: string;
  fertilizerId?: string;
  inventoryItemIds?: string[];
  parcelId?: string;
  growthStage?: string;
  /**
   * Sprint 5E — Rule Evaluation. `WeatherRule`'ın eşik alanlarıyla
   * (maxWindSpeedKmh vb.) KARŞILAŞTIRILACAK gerçek, o anki hava
   * ölçümü. Bu bilgi olmadan WeatherEvaluator yalnızca "kural var mı"
   * diyebilir, GERÇEK bir değerlendirme yapamaz — bu yüzden bu
   * sprintte eklendi.
   */
  currentWindSpeedKmh?: number;
  currentTemperatureC?: number;
  currentHumidityPercent?: number;
  isPrecipitating?: boolean;
}

export interface EvaluatorResult {
  status: EvaluatorStatus;
  priority: EvaluatorPriority;
  /** true ise, bu sonuç işlemi ENGELLER — status/priority kombinasyonundan TÜRETİLMEZ (bkz. Sprint 5B planı gerekçesi), her Evaluator kendi belirler. */
  blocking: boolean;
  reason: string;
  warnings?: string[];
  evidence?: string[];
  /** Bu sonucu üreten Rule Layer kaydının kimliği (varsa) — açıklanabilirlik için. */
  ruleId?: string;
  ruleVersion?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Ortak Evaluator sözleşmesi. Her yeni Evaluator bu arayüzü uygular —
 * Open/Closed Principle: yeni bir Evaluator eklemek, mevcut hiçbir
 * Evaluator'ı veya bu arayüzü DEĞİŞTİRMEYİ gerektirmez.
 */
export interface Evaluator {
  readonly name: string;
  /**
   * Bu Evaluator'ın verilen bağlamda ANLAMLI olup olmadığını (ör.
   * CompatibilityEvaluator, yalnızca birden fazla ürün seçiliyse
   * anlamlıdır) ucuz bir kontrolle belirler — `evaluate()`'in
   * (potansiyel olarak pahalı repository sorguları içerebilecek)
   * gereksiz yere çağrılmasını önler.
   */
  supports(context: EvaluatorContext): boolean;
  evaluate(context: EvaluatorContext): Promise<EvaluatorResult>;
}

/**
 * Soyut temel sınıf — TÜM Evaluator'ların paylaştığı, GERÇEK bir kod
 * tekrarı riski taşıyan tek davranışı merkezileştirir: hata yönetimi.
 * "AI/kural sistemi asla tahmin üretmesin" ilkesinin kod düzeyinde
 * garantisi — bir Evaluator'ın `doEvaluate()`'i beklenmedik şekilde
 * hata fırlatırsa, framework bunu YAKALAR ve güvenli, açık bir
 * `INSUFFICIENT_DATA` sonucuna çevirir; hiçbir zaman sessizce
 * çökmez veya sahte bir "PASS" üretmez.
 */
export abstract class BaseEvaluator implements Evaluator {
  public abstract readonly name: string;

  public abstract supports(context: EvaluatorContext): boolean;

  /** Alt sınıfların uygulayacağı asıl değerlendirme mantığı. */
  protected abstract doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult>;

  public async evaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    try {
      return await this.doEvaluate(context);
    } catch (error) {
      logger.error("AI", `Evaluator '${this.name}' beklenmedik bir hatayla karşılaştı.`, error);
      return {
        status: "INSUFFICIENT_DATA",
        priority: "INFO",
        blocking: false,
        reason: `'${this.name}' değerlendirmesi sırasında bir hata oluştu, bu nedenle veri yetersiz kabul edildi.`,
      };
    }
  }
}
