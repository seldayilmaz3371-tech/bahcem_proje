/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { plantInfoRepository } from "../../repositories/plant-info.repository";
import { PlantInfo } from "../../models";

/**
 * Sprint 4B — Plant Knowledge Servisi.
 *
 * TEMEL PRENSİP: Bu servis, RAG'ın YERİNE geçmez, Gemini'nin YERİNE
 * geçmez — yalnızca Sprint 1'de kurulan Bitki Bilgi Sözlüğü'nden
 * (`PlantInfo`), kullanıcı tarafından ELLE GİRİLMİŞ, DOĞRULANMIŞ bilgiyi
 * okuyup, AI context'ine eklenebilecek düz bir metin bloğuna çevirir.
 * İçerikten hiçbir şey TAHMİN EDİLMEZ — yalnızca zaten var olan bir
 * kaydın alanları birleştirilir.
 *
 * TEK ÇAĞRI NOKTASI: Yalnızca `ContextBuilderService` bu servisi
 * çağırır (bkz. Sprint 4B görev 5) — `chat-assistant.service.ts` ve
 * `parcel-recommendation.service.ts` bu servisi HİÇ doğrudan
 * import etmez, yalnızca Context Builder'ın ürettiği hazır metni kullanır.
 *
 * GENİŞLETİLEBİLİRLİK: Yeni bir bitki türü eklemek, bu servise hiçbir
 * kod değişikliği gerektirmez — yalnızca `PlantInfo` tablosuna yeni bir
 * kayıt eklenmesi yeterlidir (bkz. mevcut `/api/plant-info` CRUD
 * uç noktaları, Sprint 1).
 */
export class PlantKnowledgeService {
  /**
   * Verilen bitki türüne (parselin `cropType`'ı) ait doğrulanmış bilgiyi
   * arar. `cropType` boş/tanımsızsa veya eşleşen bir kayıt yoksa `null`
   * döner — bu bir HATA değildir, çağıran taraf bunu "bu bitki için
   * henüz sözlük kaydı yok" olarak ele almalı ve normal akışına
   * (mevcut sistem AYNEN çalışmaya devam eder) kesintisiz devam etmelidir.
   */
  public async findByCropType(cropType: string | undefined): Promise<PlantInfo | null> {
    if (!cropType || !cropType.trim()) return null;
    return plantInfoRepository.getByName(cropType);
  }

  /**
   * Bir PlantInfo kaydını, AI prompt'una eklenebilecek, okunabilir bir
   * metin bloğuna çevirir. Yalnızca DOLU olan alanlar dahil edilir —
   * boş/tanımsız bir alan için "bilgi yok" gibi bir dolgu metni
   * ÜRETİLMEZ (bu, var olmayan bir bilgiyi varmış gibi göstermemek
   * içindir). Kayıt `null` ise boş string döner.
   */
  public formatForPrompt(plantInfo: PlantInfo | null): string {
    if (!plantInfo) return "";

    const lines: string[] = [`Bitki Adı: ${plantInfo.name}`];
    if (plantInfo.scientificName) lines.push(`Bilimsel Adı: ${plantInfo.scientificName}`);
    if (plantInfo.parentGroup) lines.push(`Üst Grup: ${plantInfo.parentGroup}`);
    if (plantInfo.category) lines.push(`Kategori: ${plantInfo.category}`);
    if (plantInfo.description) lines.push(`Genel Açıklama: ${plantInfo.description}`);
    if (plantInfo.lifecycle) lines.push(`Yaşam Döngüsü: ${plantInfo.lifecycle}`);
    if (plantInfo.growthStages && plantInfo.growthStages.length > 0) lines.push(`Gelişim Dönemleri: ${plantInfo.growthStages.join(", ")}`);
    if (plantInfo.wateringNotes) lines.push(`Sulama Özellikleri: ${plantInfo.wateringNotes}`);
    if (plantInfo.fertilizingNotes) lines.push(`Gübreleme (Genel): ${plantInfo.fertilizingNotes}`);
    if (plantInfo.pruningNotes) lines.push(`Budama (Genel): ${plantInfo.pruningNotes}`);
    if (plantInfo.commonDiseases && plantInfo.commonDiseases.length > 0) lines.push(`Yaygın Hastalıklar: ${plantInfo.commonDiseases.join(", ")}`);
    if (plantInfo.commonPests && plantInfo.commonPests.length > 0) lines.push(`Yaygın Zararlılar: ${plantInfo.commonPests.join(", ")}`);
    if (plantInfo.nutrientDeficiencies && plantInfo.nutrientDeficiencies.length > 0) lines.push(`Besin Eksiklikleri: ${plantInfo.nutrientDeficiencies.join(", ")}`);
    if (plantInfo.criticalCareNotes) lines.push(`Kritik Bakım Noktaları: ${plantInfo.criticalCareNotes}`);

    return lines.join("\n");
  }
  /**
   * Sprint 4C — Plant Knowledge'ı Retrieval sürecine dahil eder.
   *
   * Bir PlantInfo kaydından, RAG aramasını ZENGİNLEŞTİRMEK için
   * kullanılabilecek arama terimlerini çıkarır (bitki adı, üst grup,
   * bilinen hastalıklar, bilinen zararlılar). Bu terimler,
   * `computeMetadataBoost()`'un zaten baktığı GERÇEK VectorChunk
   * alanlarıyla (heading/cropType/topics/keywords) eşleşecek şekilde
   * tasarlandı — YENİ bir metadata alanı UYDURULMADI (bkz. Sprint 4C
   * kök analizi: VectorChunk'ta "plantGroup"/"disease"/"operationType"/
   * "category" diye ayrı alanlar YOK, yalnızca heading/cropType/topics/
   * keywords var).
   *
   * Kayıt yoksa (`null`) boş dizi döner — çağıran taraf bunu "zenginleştirilecek
   * ek terim yok" olarak ele alır, hata değildir.
   */
  public extractSearchTerms(plantInfo: PlantInfo | null): string[] {
    if (!plantInfo) return [];

    const terms: string[] = [plantInfo.name];
    if (plantInfo.parentGroup) terms.push(plantInfo.parentGroup);
    if (plantInfo.commonDiseases) terms.push(...plantInfo.commonDiseases);
    if (plantInfo.commonPests) terms.push(...plantInfo.commonPests);

    return terms;
  }

  /**
   * Sprint 4E — Intent Activation. Serbest metin bir kullanıcı
   * sorgusunda ("Limon nedir, bilimsel adı nedir?"), sözlükte KAYITLI
   * bir bitki adının GEÇİP GEÇMEDİĞİNİ kontrol eder — basit, AI'sız,
   * yerel bir substring eşleşmesi (bu geceki `metadata-extraction.
   * util.ts` ile aynı felsefe). Hiçbir yeni NLP/entity-extraction
   * sistemi İCAT EDİLMEDİ — yalnızca zaten var olan sözlük isimleri
   * taranıyor. Eşleşme yoksa `null` döner (hata değil).
   */
  public async detectPlantNameInText(text: string): Promise<string | null> {
    const normalized = text.toLocaleLowerCase("tr-TR");
    const allPlants = await plantInfoRepository.getAll();
    const match = allPlants.find((p) => normalized.includes(p.name.toLocaleLowerCase("tr-TR")));
    return match?.name ?? null;
  }
}

export const plantKnowledgeService = new PlantKnowledgeService();
