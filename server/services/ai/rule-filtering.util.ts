/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRule } from "../../models";

/**
 * Sprint 5D — Rule Filtering.
 *
 * KAPSAM SINIRI: Mevcut repository'lerin özel arama metotları
 * (örn. `dosageRuleRepository.getActiveByChemicalId()`) ZATEN
 * `isActive` filtresini doğru uyguluyor — bu dosya onları
 * TEKRARLAMAZ veya DEĞİŞTİRMEZ (talimat: "mevcut repository yapısını
 * değiştirme"). Bu, yalnızca Decision Engine'in (ve gelecekteki yeni
 * Evaluator'ların) DOĞRUDAN bir Rule listesi üzerinde çalışması
 * gerektiğinde kullanabileceği, GENEL amaçlı, merkezi yardımcılardır.
 */

/** Yalnızca aktif (isActive) kayıtları döner — herhangi bir BaseRule alt-tipiyle çalışır. */
export function filterActiveRules<T extends BaseRule>(rules: T[]): T[] {
  return rules.filter((r) => r.isActive);
}

/**
 * Bir kuralın, verilen bitki adıyla eşleşip eşleşmediğini kontrol eder
 * (case-insensitive, Türkçe locale — projenin mevcut normalizasyon
 * deseniyle tutarlı). `plantName` alanı taşımayan kural tipleri için
 * bu fonksiyon KULLANILMAZ (tip güvenliği çağıran tarafta sağlanır).
 */
export function matchesPlantName(rulePlantName: string, contextPlantName: string): boolean {
  return rulePlantName.trim().toLocaleLowerCase("tr-TR") === contextPlantName.trim().toLocaleLowerCase("tr-TR");
}
