/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { DecisionTemplate } from "../models";

/**
 * Sprint 5A — Rule Layer Foundation (Sprint 5A Revizyonu ile yeniden
 * adlandırıldı: eski adı TreatmentRecipeRepository idi — bkz.
 * DecisionTemplate model açıklaması, models.ts).
 *
 * Tablo adı (`treatmentRecipes`) BİLİNÇLİ OLARAK DEĞİŞTİRİLMEDİ —
 * yalnızca TypeScript tip/sınıf adı güncellendi. Bu, backward
 * compatibility'yi korur: mevcut kullanıcıların diskindeki veritabanı
 * dosyasında zaten var olan (veya otomatik migration ile oluşacak)
 * `treatmentRecipes` tablosu, hiçbir yeni migration veya "yetim tablo"
 * riski olmadan aynen kullanılmaya devam eder.
 *
 * Plain CRUD over DecisionTemplate records — NOT wired into any
 * Decision Engine/Evaluator logic yet (see Sprint 5A talimatı).
 */
export class DecisionTemplateRepository extends BaseRepository<DecisionTemplate> {
  constructor() {
    super("treatmentRecipes");
  }

  /** Bir bitkiye bağlı, yalnızca aktif karar kalıplarını döner. */
  public async getActiveByPlantName(plantName: string): Promise<DecisionTemplate[]> {
    const normalized = plantName.trim().toLowerCase();
    return this.find((r) => r.plantName.trim().toLowerCase() === normalized && r.isActive);
  }
}

export const decisionTemplateRepository = new DecisionTemplateRepository();
