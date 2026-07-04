/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildSafeUserQuerySection } from "./prompt-safety.util";

/**
 * All context values required to build the main parcel recommendation
 * prompt. Kept as a single parameter object so the prompt builder's
 * signature stays stable as new context sources are added over time.
 */
export interface ParcelRecommendationPromptContext {
  parcelName: string;
  areaDekar: number;
  treeCount: number;
  soilType: string;
  irrigationType: string;
  observationsContext: string;
  localWeatherContext: string;
  liveWeatherText: string;
  inventoryContext: string;
  ragContext: string;
  userQuery: string;
  hasPhotos: boolean;
  photosUsedCount: number;
}

/**
 * Builds the photo-diagnosis instruction block, only included when the
 * farmer attached diagnosis photos to this request. Explicitly enforces
 * the project's "RAG first, general knowledge as disclosed fallback"
 * rule (see AI PHILOSOPHY / RAG principles) and the confidence-hedging
 * rule (never guess when uncertain).
 */
function buildPhotoInstructionBlock(photosUsedCount: number): string {
  return `
=== YÜKLENEN TEŞHİS FOTOĞRAFLARI ===
Çiftçi bu parsele ait ${photosUsedCount} adet fotoğraf yükledi. Bu fotoğrafları dikkatlice incele: yapraklarda leke/sararma, meyvede zararlı izi, genel bitki sağlığı gibi görsel olarak tespit edilebilecek belirtileri belirle.

ÖNEMLİ TEŞHİS KURALI (MUTLAKA UYGULA):
1. Fotoğrafta bir hastalık/zararlı belirtisi tespit edersen, ÖNCE yukarıdaki "BİLGİ DEPOSU VE RAG KAYNAKLARINDAN ALINAN BİLGİLER" bölümünde bu belirtiyle eşleşen bir tedavi/ilaç bilgisi olup olmadığına bak.
2. Eşleşme BULURSAN: önerini bu dokümana dayandır ve raporunda açıkça "KAYNAK: RAG Doküman Havuzu (yüklediğiniz döküman)" yaz.
3. Eşleşme BULAMAZSAN: kendi genel tarımsal bilgini kullanarak teşhis ve öneri yap, ama raporunda MUTLAKA açıkça "KAYNAK: Gemini Genel Bilgisi (Doküman Havuzunda bu teşhisle eşleşen bir kayıt bulunamadı)" yaz. Bunu asla RAG dokümanından geliyormuş gibi sunma.
4. Fotoğraf net değilse, açı yetersizse veya belirtiler belirsizse: TAHMİN YÜRÜTME. Bunun yerine belirsizliği açıkça belirt ve çiftçiden daha net/farklı açıdan (yakın çekim, yaprak altı, genel görünüm) yeni bir fotoğraf istemesini öner.
`;
}

/**
 * Builds the complete prompt sent to Gemini for a parcel decision-support
 * recommendation. Extracted into its own module (per this project's
 * mandated prompt-management architecture) so prompt wording can evolve
 * independently of the service logic that gathers context and calls the
 * model.
 *
 * Every information block is explicitly source-labeled (Yerel Proje
 * Verisi / Harici Web Verisi / RAG), and the model is required to
 * disclose which sources it actually used — satisfying this project's
 * "never hallucinate, always distinguish sources, confidence must be
 * disclosed" requirements.
 */
export function buildParcelRecommendationPrompt(context: ParcelRecommendationPromptContext): string {
  const photoInstructionBlock = context.hasPhotos ? buildPhotoInstructionBlock(context.photosUsedCount) : "";
  const defaultQuery = "Bu parsel için genel durum analizi ve gelecek haftaki tarımsal faaliyet planı nedir?";
  const userQuerySection = buildSafeUserQuerySection(context.userQuery || defaultQuery);

  return `
Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış yapay zeka destekli bir Tarım Danışmanısın (Mersin Tarım Asistanı).
Aşağıdaki verilere dayanarak çiftçiye özel, bilimsel, pratik ve bölgesel (Toroslar mikro-klimasına uygun) tavsiyeler üreteceksin.

=== ÇİFTLİK VE PARSEL BİLGİLERİ (KAYNAK: Yerel Proje Verisi) ===
Parsel Adı: ${context.parcelName}
Alan: ${context.areaDekar} Dekar
Ağaç Sayısı: ${context.treeCount} adet zeytin ağacı
Toprak Yapısı: ${context.soilType}
Sulama Yöntemi: ${context.irrigationType}

=== SON GÖZLEMLER VE SAHA RAPORLARI (KAYNAK: Yerel Proje Verisi) ===
${context.observationsContext}

=== METEOROLOJİ KAYNAK 1: GEÇMİŞ KAYITLAR (KAYNAK: Yerel Proje Verisi - Manuel Girilen Geçmiş Ölçümler) ===
${context.localWeatherContext}

=== METEOROLOJİ KAYNAK 2: CANLI GÜNCEL TAHMİN (KAYNAK: Harici Web Verisi - Open-Meteo API) ===
${context.liveWeatherText}

=== ENVANTER VE STOK DURUMU (KAYNAK: Yerel Proje Verisi) ===
${context.inventoryContext}

=== BİLGİ DEPOSU VE RAG KAYNAKLARINDAN ALINAN BİLGİLER (KAYNAK: RAG - Yüklenen Dokümanlar) ===
${context.ragContext}
${photoInstructionBlock}
${userQuerySection}

Senden istenenler:
1. **Analiz ve Teşhis**: Gözlemlerde ve${context.hasPhotos ? " yüklenen fotoğraflarda" : ""} belirtilen hastalık, zararlı (örn. Zeytin sineği, halkalı leke, dökülme) veya besin eksikliklerini değerlendir. Emin olmadığın bir teşhisi kesinmiş gibi sunma; belirsizlik varsa açıkça söyle.
2. **Eylem Planı**: Sulama, gübreleme, ilaçlama veya budama için somut tavsiyeler ver. Don riski değerlendirmeni MUTLAKA "METEOROLOJİ KAYNAK 2" bölümündeki canlı tahmine dayandır (eğer o bölüm veri alınamadığını belirtiyorsa, bunu açıkça söyle ve sadece geçmiş kayıtlara dayandığını belirt). Don riski varsa, Toroslar/Değirmençay bölgesinde don önleme için yapılacakları vurgula.
3. **Uygulama Dozajı**: Envanterde bulunan ilaç ve gübrelerin, parsel büyüklüğüne ve ağaç sayısına göre yaklaşık dozajlarını hesapla. Bu dozajın kesin/doğrulanmış bir reçete olmadığını, uygulamadan önce ürün etiketinin mutlaka kontrol edilmesi gerektiğini belirt.
4. **Hasat Öngörüsü**: Eğer hasat dönemi yaklaşıyorsa, son ilaçlama ile hasat arasındaki bekleme sürelerine (PH) dikkat çek.
5. **Güven Seviyesi**: Analizinin ne kadar kesin olduğunu belirt. Kanıt zayıfsa (örn. net olmayan fotoğraf, çelişkili gözlem) bunu "Belirsiz" olarak işaretle ve çiftçiden ek bilgi/farklı açıdan fotoğraf iste; tahmin yürütme.
6. **Kaynak Beyanı**: Yanıtının sonunda kısa bir "Kullanılan Kaynaklar" notu ekle; hangi bölümler için Yerel Proje Verisi, hangi bölümler için Harici Web Verisi (Open-Meteo), hangi bölümler için RAG dokümanlarını${context.hasPhotos ? " ve fotoğraf analizi için hangi kaynağı (RAG veya Gemini genel bilgisi)" : ""} kullandığını belirt.

Cevabını Markdown formatında, net başlıklar, maddeler ve profesyonel/samimi bir Türkçe tonuyla yaz.
`;
}
