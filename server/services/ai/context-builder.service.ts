/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { parcelRepository, treeRepository } from "../../repositories/parcel.repository";
import { observationRepository } from "../../repositories/observation.repository";
import { inventoryItemRepository, productApplicationRepository } from "../../repositories/inventory.repository";
import { aiRecommendationRepository } from "../../repositories/ai.repository";
import { db } from "../../database";
import { logger } from "../../logger";
import { weatherService } from "../weather.service";
import { capUserQueryLength } from "../../prompts/prompt-safety.util";
import { searchSimilarChunks, filterRelevantMatches } from "./rag-retrieval.service";
import { plantKnowledgeService } from "./plant-knowledge.service";
import { Parcel, Tree, Observation, ProductApplication, AIRecommendation, InventoryItem, WeatherRecord, VectorChunk, PlantInfo } from "../../models";

/**
 * Sprint 4A — Ortak Context Builder.
 *
 * Bu servis, hem Genel Sohbet (`chat-assistant.service.ts`) hem Karar
 * Destek'in (`parcel-recommendation.service.ts`) — ve gelecekte
 * eklenecek her yeni AI servisinin — İHTİYAÇ DUYABİLECEĞİ TÜM HAM
 * BİLGİYİ tek bir yerden, tutarlı bir şekilde toplar.
 *
 * KAPSAM SINIRI (bilinçli, Sprint 4A onayında netleştirildi): Bu servis
 * yalnızca "HANGİ BİLGİ VAR" sorusuna cevap verir — "bu bilgi PROMPT'A
 * NASIL YANSIYACAK" veya "RAG sonucu NASIL ZENGİNLEŞTİRİLECEK" gibi
 * servise özgü KARARLAR (örn. Sprint 2D'nin Sohbet'e özgü
 * expandWithDocumentContext/expandWithAdjacentChunks/gruplama mantığı)
 * BİLEREK burada değil, ilgili servisin kendisinde kalır — bunlar
 * "toplama" değil "işleme/karar" katmanına ait, ve iki servisin bu
 * konudaki DAVRANIŞ FARKINI (Sohbet genişletme yapıyor, Karar Destek
 * yapmıyor) korumak, bu sprintin "davranış değişmeyecek" kuralının
 * gereğidir.
 *
 * Plant Knowledge, Intent Router ve Confidence Score BİLİNÇLİ OLARAK bu
 * sprintin kapsamı DIŞINDA (bkz. Sprint 4A onay metni) — sonraki
 * sprintlerin konusu.
 */

export interface AIContextBundle {
  // 1. Kullanıcı
  requestedByUserId?: string;

  // 2. Parsel (yalnızca parcelId verildiyse doldurulur; Genel Sohbet gibi
  // parsel bağlamı olmayan çağrılarda null kalır — gereksiz sorgu yapılmaz)
  parcel: Parcel | null;

  // 3. Bitki Türü — doğrudan parcel.cropType'tan, İÇERİKTEN TAHMİN EDİLMEZ
  cropType?: string;

  // 4. Referans Ağaçlar
  referenceTrees: Tree[];

  // 5. Son gözlemler (en yeni 5, mevcut Karar Destek davranışıyla birebir aynı sınır)
  recentObservations: Observation[];
  observationsContextText: string;

  // 6. Son işlemler (ProductApplication — Sprint 1'de kurulan "hangi ilaç/gübre hangi parsele uygulandı" kaydı)
  recentProductApplications: ProductApplication[];

  // 7. Daha önce bu parsel için üretilmiş AI önerileri
  previousRecommendations: AIRecommendation[];

  // 8. Fotoğraf bilgisi — yalnızca BAYRAK, fotoğrafı DİSKE KAYDETME bir
  // yan etkisidir (context "toplama" değildir), bu servisin sorumluluğu değil.
  hasPhotos: boolean;

  // 9. Hava durumu
  recentWeather: WeatherRecord[];
  localWeatherContextText: string;
  liveWeather: { text: string; available: boolean; daysUsed: number };

  // 10. Envanter/stok uyarıları
  stockAlerts: InventoryItem[];
  inventoryContextText: string;
  /** Tüm envanter kalemi sayısı (yalnızca uyarılı olanlar değil) — mevcut `usedInventoryCount` alanının aynı davranışını korumak için gerekli. */
  totalInventoryItemCount: number;

  // 11. RAG için gerekli arama bilgileri
  safeUserQuery?: string;
  ragSearchTerm: string;
  ragMatches: { chunk: VectorChunk; score: number }[];

  // Sprint 4B — Plant Knowledge. `plantKnowledge` bulunamazsa `null`
  // (hata değil, "henüz sözlük kaydı yok" demektir) ve
  // `plantKnowledgeContextText` boş string olur — çağıran servisler bu
  // durumda mevcut akışlarına AYNEN devam eder (bkz. plant-knowledge.service.ts).
  plantKnowledge: PlantInfo | null;
  plantKnowledgeContextText: string;
}

export interface BuildContextParams {
  /** Parsel bağlamlı bir istekse (Karar Destek) parsel kimliği; Genel Sohbet için verilmez. */
  parcelId?: string;
  userQuery?: string;
  requestedByUserId?: string;
  hasPhotos?: boolean;
  /** Sprint 2D'nin ekipman-bazlı doküman filtresi (yalnızca Genel Sohbet kullanıyor). */
  documentIds?: string[];
  /** Sprint 2D — İSTEĞE BAĞLI. `true` ise `searchSimilarChunks`'a `metadataBoostQuery` de geçirilir (yalnızca Genel Sohbet'in mevcut davranışı — Karar Destek bunu hiç kullanmıyordu, `false`/verilmezse önceki davranış birebir korunur). */
  useMetadataBoost?: boolean;
  /** RAG için istenen Top-K değeri — çağıran servis kendi mevcut değerini geçirir (davranış değişmez). */
  ragLimit?: number;
  /** Sprint 4E — İSTEĞE BAĞLI. Verilirse, Plant Knowledge lookup'ı parselin cropType'ı yerine BU değerle yapılır (örn. Genel Sohbet'te "Limon nedir?" gibi parselsiz bir soruda, kullanıcı sorgusundan tespit edilen bitki adı). Parsel varsa parselin GERÇEK cropType'ı her zaman önceliklidir — bu yalnızca parsel YOKKEN bir alternatif sağlar. */
  overrideCropType?: string;
}

export class ContextBuilderService {
  public async buildContext(params: BuildContextParams): Promise<AIContextBundle> {
    const safeUserQuery = params.userQuery ? capUserQueryLength(params.userQuery) : undefined;
    const hasPhotos = !!params.hasPhotos;

    let parcel: Parcel | null = null;
    let referenceTrees: Tree[] = [];
    let recentObservations: Observation[] = [];
    let recentProductApplications: ProductApplication[] = [];
    let previousRecommendations: AIRecommendation[] = [];
    let recentWeather: WeatherRecord[] = [];
    let stockAlerts: InventoryItem[] = [];
    let totalInventoryItemCount = 0;

    // Parsel-bazlı bilgiler, YALNIZCA bir parcelId verildiğinde toplanır —
    // Genel Sohbet gibi parsel bağlamı olmayan çağrılarda gereksiz
    // sorgu yapılmaz (performans, mevcut davranışla tutarlı).
    if (params.parcelId) {
      parcel = await parcelRepository.getById(params.parcelId);

      const allTreesInParcel = await treeRepository.getByParcelId(params.parcelId);
      referenceTrees = allTreesInParcel.filter((t) => t.isReferenceTree);

      const allObservations = await observationRepository.getAll();
      recentObservations = allObservations
        .filter((o) => o.parcelId === params.parcelId)
        .sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime())
        .slice(0, 5);

      const allApplications = await productApplicationRepository.getAll();
      recentProductApplications = allApplications
        .filter((a) => a.parcelIds.includes(params.parcelId!))
        .sort((a, b) => new Date(b.applicationDate).getTime() - new Date(a.applicationDate).getTime())
        .slice(0, 5);

      previousRecommendations = await aiRecommendationRepository.getByParcelId(params.parcelId);

      const rawDb = await db.readRaw();
      recentWeather = (rawDb.weatherHistory || [])
        .sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime())
        .slice(0, 5);

      const allInventory = await inventoryItemRepository.getAll();
      // ADR-003: yalnızca gerçek stok takibi yapılan (trackStock ===
      // true) ürünler Gemini'ye "kritik stok" bağlamı olarak gönderilir
      // — AI Ürün Bilgi Bankası kayıtları (trackStock === false) bu
      // listeye hiç girmez. Bu, AI'ın ürettiği önerilerin yanlış bir
      // "stoğunuz kritik" bağlamıyla kirlenmesini önler.
      stockAlerts = allInventory.filter((item) => item.trackStock === true && item.stockQuantity <= item.minStockAlert);
      totalInventoryItemCount = allInventory.length;
    }

    const observationsContextText = recentObservations.length > 0
      ? recentObservations.map((o, idx) => `[Gözlem ${idx + 1} - Tarih: ${o.observationDate}]: ${o.notes}`).join("\n")
      : "Bu parsel için yakın zamanda kaydedilmiş gözlem raporu bulunmuyor.";

    const localWeatherContextText = recentWeather.length > 0
      ? recentWeather.map((w) => `[Tarih: ${w.recordDate}]: En Yüksek Sıcaklık: ${w.tempMax}°C, En Düşük Sıcaklık: ${w.tempMin}°C, Nem: %${w.humidity}, Don Riski Var Mı: ${w.hasFrostRisk ? "EVET" : "HAYIR"}`).join("\n")
      : "Yerel veritabanında manuel olarak kaydedilmiş yakın zamana ait meteorolojik veri bulunmamaktadır.";

    const inventoryContextText = stockAlerts.length > 0
      ? stockAlerts.map((i) => `- ${i.name} (Stokta: ${i.stockQuantity} ${i.unit}, Kritik Seviye: ${i.minStockAlert} ${i.unit})`).join("\n")
      : "Tüm gübre ve ilaç stok seviyeleri güvenli eşiğin üzerindedir.";

    // RAG arama terimi — Karar Destek'in ÖNCEKİ mantığı BİREBİR AYNI
    // taşındı (hardcoded "zeytin" DAHİL) — bu sprintte DAVRANIŞ
    // DEĞİŞTİRİLMİYOR, yalnızca ortak bir yere alınıyor. Genel Sohbet,
    // her zaman safeUserQuery'i doğrudan kullanır (kendi mevcut
    // davranışıyla tutarlı — hasPhotos/parcelId'siz durumda).
    const ragSearchTerm = safeUserQuery
      ? safeUserQuery
      : hasPhotos
        ? "zeytin hastalık zararlı teşhis ilaç tedavi bakır sülfat"
        : "Mersin Toroslar Değirmençay zeytin yetiştiriciliği sulama gübreleme hastalık koruma";

    // Sprint 4B → 4C: Plant Knowledge, cropType belirlendikten SONRA
    // ama RAG aramasından ÖNCE aranır — Sprint 4C'nin amacı, bu bilgiyi
    // yalnızca prompt metni olarak değil, RETRIEVAL'ın kendisini
    // zenginleştirmek için de kullanmak (bkz. plantKnowledgeSearchTerms).
    // parcel yoksa cropType de yok, dolayısıyla plantKnowledge her zaman
    // null kalır — Genel Sohbet'te böyle olması beklenir. Bulunamaması
    // bir HATA değildir, yalnızca "henüz sözlük kaydı yok" anlamına gelir.
    const plantKnowledge = await plantKnowledgeService.findByCropType(parcel?.cropType ?? params.overrideCropType);
    const plantKnowledgeContextText = plantKnowledgeService.formatForPrompt(plantKnowledge);

    // Sprint 4C — Retrieval Zenginleştirme. `computeMetadataBoost()`'un
    // KENDİSİNE hiç dokunulmadı (Sprint 2D korunuyor) — yalnızca ONA
    // GİDEN sorgu metni zenginleştiriliyor. İki bağımsız kaynak
    // birleştirilir:
    //   1. Sprint 2D'nin mevcut davranışı (yalnızca useMetadataBoost=true
    //      olduğunda — bugüne kadar yalnızca Genel Sohbet — kullanıcının
    //      kendi sorgu metni de boost'a dahil edilir).
    //   2. YENİ: Plant Knowledge bulunduysa (useMetadataBoost'tan
    //      BAĞIMSIZ — hem Sohbet hem Karar Destek faydalanabilsin diye),
    //      bitki adı/üst grup/bilinen hastalık/zararlı terimleri de
    //      eklenir. Bu, "Bitki → Bitki Grubu → İlgili Hastalıklar →
    //      RAG Araması" akışının somut karşılığı.
    const plantKnowledgeSearchTerms = plantKnowledgeService.extractSearchTerms(plantKnowledge);
    const boostTerms: string[] = [];
    if (params.useMetadataBoost) boostTerms.push(ragSearchTerm);
    if (plantKnowledgeSearchTerms.length > 0) boostTerms.push(...plantKnowledgeSearchTerms);
    const metadataBoostQuery = boostTerms.length > 0 ? boostTerms.join(" ") : undefined;

    const [liveWeather, rawRagMatches] = await Promise.all([
      params.parcelId ? weatherService.getWeatherSummaryForAI() : Promise.resolve({ text: "", available: false, daysUsed: 0 }),
      searchSimilarChunks(ragSearchTerm, params.ragLimit ?? 3, params.documentIds, metadataBoostQuery, parcel?.cropType ?? params.overrideCropType),
    ]);
    // Sprint 9.1 — SORUN 1: ProductDocumentQaService'teki AYNI, PAYLAŞILAN
    // eşik filtresi (rag-retrieval.service.ts) burada da uygulanıyor —
    // önceden HİÇ eşik kontrolü yoktu, düşük-alakalı chunk'lar filtrelenmeden
    // context'e/prompt'a gidiyordu.
    const ragMatches = filterRelevantMatches(rawRagMatches);
    logger.info(
      "AI",
      `[Prompt Context — Karar Destek] ${ragMatches.length} chunk prompt'a eklenecek: ${JSON.stringify(ragMatches.map((m) => ({ documentId: m.chunk.documentId, chunkId: m.chunk.id, score: m.score.toFixed(4), preview: m.chunk.content.slice(0, 60) })))}`
    );

    return {
      requestedByUserId: params.requestedByUserId,
      parcel,
      cropType: parcel?.cropType,
      referenceTrees,
      recentObservations,
      observationsContextText,
      recentProductApplications,
      previousRecommendations,
      hasPhotos,
      recentWeather,
      localWeatherContextText,
      liveWeather,
      stockAlerts,
      inventoryContextText,
      totalInventoryItemCount,
      safeUserQuery,
      ragSearchTerm,
      ragMatches,
      plantKnowledge,
      plantKnowledgeContextText,
    };
  }
}

export const contextBuilderService = new ContextBuilderService();
