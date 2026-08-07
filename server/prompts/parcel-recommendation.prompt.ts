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
  cropType: string;
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
  /** Sprint 4B — Plant Knowledge. Boşsa ("henüz sözlük kaydı yok") bu bölüm prompt'a HİÇ eklenmez — mevcut prompt yapısı aynen korunur. */
  plantKnowledgeContext?: string;
  /** Sprint 5F — Decision Engine. Boşsa (Failsafe: Decision Engine hata verdi/hiç çalıştırılmadı) bu bölüm prompt'a HİÇ eklenmez. */
  decisionEngineContext?: string;
  /**
   * Sprint 9.10 — Kanıt Değerlendirme (bkz. evidence-evaluation.util.ts).
   * Gemini'ye SORULMADAN, DETERMİNİSTİK olarak (mevcut confidence
   * eşikleriyle) hesaplanır — Gemini bu SONUCU alır, kendisi
   * belirlemez. OPSİYONEL: verilmezse ("full" varsayılan), mevcut
   * (Sprint 9.9 ve öncesi) davranış birebir korunur.
   */
  documentCoverage?: "full" | "partial" | "none";
  /**
   * Sprint 9.11 — Evidence Architecture v2: her belgenin KENDİ skoru ve
   * kapsamıyla listelendiği, hazır-biçimlendirilmiş metin (bkz.
   * evidence-evaluation.util.ts). Boşsa (eski çağıranlar, geriye dönük
   * uyumluluk) bu bölüm prompt'a eklenmez.
   */
  perDocumentCoverageText?: string;
  /**
   * Sprint 9.10 — STRICT_RAG: belge desteği yoksa Gemini teknik öneri
   * ÜRETMEZ, yalnızca "bulunamadı" der. HYBRID (VARSAYILAN, MEVCUT
   * davranışla birebir aynı): belge desteği yoksa Gemini genel bilgisini
   * kullanabilir, ama AÇIKÇA etiketler (fotoğraf teşhisinde zaten var
   * olan, Sprint 5B'nin kuralının GENELLEŞTİRİLMİŞ hali).
   */
  evidenceMode?: "STRICT_RAG" | "HYBRID";
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
  // Sprint 4B — yalnızca gerçekten bir Bitki Bilgi Sözlüğü kaydı
  // bulunduysa eklenen, RAG'dan TAMAMEN AYRI bir bölüm. Kayıt yoksa bu
  // değişken boş string olur ve aşağıdaki şablonda hiçbir görünür fark
  // yaratmaz (mevcut prompt yapısı aynen korunur).
  const plantKnowledgeSection = context.plantKnowledgeContext
    ? `\n=== PLANT KNOWLEDGE / DOĞRULANMIŞ BİTKİ BİLGİSİ (KAYNAK: Bitki Bilgi Sözlüğü — elle doğrulanmış, RAG'dan bağımsız) ===\n${context.plantKnowledgeContext}\n`
    : "";
  // Sprint 5F — yalnızca Decision Engine GERÇEKTEN çalıştıysa (Failsafe:
  // hata verirse bu alan boş kalır, prompt aynen ESKİ haliyle devam
  // eder). Bu bölüm KASITLI OLARAK promptun EN BAŞINDA — Decision
  // Engine'in kararı, Gemini'nin göreceği EN ÖNCELİKLİ, DEĞİŞTİRİLEMEZ
  // bilgi olmalı (bkz. "Decision Engine KARAR VERİR, Gemini KARAR
  // VERMEZ" ilkesi).
  const decisionEngineSection = context.decisionEngineContext
    ? `\n=== DECISION ENGINE KARARI (KAYNAK: Deterministik Kural Motoru — DEĞİŞTİRİLEMEZ) ===\n${context.decisionEngineContext}\n`
    : "";

  // Sprint 9.10 — Kanıt Değerlendirme + Mod talimatı. `documentCoverage`
  // Gemini'ye SORULMADAN, deterministik olarak (evidence-evaluation.util.ts)
  // hesaplanmıştır — Gemini bu SONUCU okur, kendisi karar VERMEZ. Bu,
  // "Gemini yalnızca kanıtları yorumlayan bir analiz katmanı olacak"
  // hedef mimarisinin doğrudan uygulanmasıdır.
  const evidenceMode = context.evidenceMode ?? "HYBRID"; // Varsayılan: MEVCUT (Sprint 9.9 ve öncesi) davranışla birebir aynı
  const documentCoverage = context.documentCoverage ?? "full"; // Belirtilmezse, MEVCUT davranışa en yakın (kısıtlama eklenmez)
  const evidenceInstructionBlock = `
=== KANIT DEĞERLENDİRMESİ (KOD TARAFINDAN, DETERMİNİSTİK OLARAK, BELGE BAZLI HESAPLANDI) ===
${context.perDocumentCoverageText ? `Belge bazlı kapsam:\n${context.perDocumentCoverageText}\n` : ""}Genel kapsam (en zayıf belgeye göre): ${documentCoverage === "full" ? "TAMAMEN VAR (tüm ilgili belgeler güçlü bir eşleşmeyle bu konuyu kapsıyor)" : documentCoverage === "partial" ? "KISMEN VAR (en az bir ilgili belge yalnızca orta düzeyde eşleşiyor)" : "HİÇ YOK (RAG belgelerinde bu konuyla ilgili yeterli eşleşme bulunamadı)"}
Çalışma modu: ${evidenceMode}

MUTLAKA UYULMASI GEREKEN KURALLAR:
${documentCoverage === "full" ? "- Belge kapsamı TAMAMEN VAR: Yukarıdaki RAG/Decision Engine/Yerel Veri bölümlerinde YER ALMAYAN YENİ bir teknik bilgi (doz, tarih, oran) EKLEME. Yalnızca mevcut bilgiyi düzenle, özetle, tekrarları kaldır." : ""}
${documentCoverage === "partial" ? "- Belge kapsamı KISMEN VAR: Belgede bulunan bilgiyi AYNEN koru ve \"BELGE BİLGİSİ\" başlığı altında sun. Belgede olmayan, eksik kalan kısmı AYRI bir \"AI DESTEKLİ AÇIKLAMA\" başlığı altında, açıkça etiketleyerek ekle." : ""}
${documentCoverage === "none" && evidenceMode === "STRICT_RAG" ? "- Belge kapsamı HİÇ YOK ve mod STRICT_RAG: Bu konuda TEKNİK ÖNERİ ÜRETME. Yalnızca \"Bu bilgi yüklenen belgelerde bulunmamaktadır.\" yaz ve bitir." : ""}
${documentCoverage === "none" && evidenceMode === "HYBRID" ? "- Belge kapsamı HİÇ YOK ve mod HYBRID: Önce açıkça \"Bu bilgi yüklenen belgelerde bulunmamaktadır.\" de. Ardından, istersen \"Aşağıdaki bilgiler genel AI değerlendirmesidir.\" başlığı altında kendi genel bilgini ekleyebilirsin — ama bunu ASLA belge bilgisi gibi sunma." : ""}
- KAYNAK ETİKETLEME (HER paragraf/madde için ZORUNLU): her paragrafın veya maddenin SONUNA, kullandığın kaynağı şu biçimde ekle: "**Kaynak:** [RAG - Belge: <dosya adı>]" veya "**Kaynak:** [Yerel Proje Verisi]" veya "**Kaynak:** [Open-Meteo]" veya "**Kaynak:** [Decision Engine]" veya "**Kaynak:** [AI Çıkarımı - Belge Dışı]". Bu etiketlerin DIŞINDA başka bir kaynak adı UYDURMA.
`;

  return `
${evidenceInstructionBlock}${decisionEngineSection}Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış yapay zeka destekli bir Tarım Danışmanısın (Mersin Tarım Asistanı).
Aşağıdaki verilere dayanarak çiftçiye özel, bilimsel, pratik ve bölgesel (Toroslar mikro-klimasına uygun) tavsiyeler üreteceksin.

=== ÇİFTLİK VE PARSEL BİLGİLERİ (KAYNAK: Yerel Proje Verisi) ===
Parsel Adı: ${context.parcelName}
Alan: ${context.areaDekar} Dekar
Ağaç Sayısı: ${context.treeCount} adet ${context.cropType} ${context.cropType === "Zeytin" ? "ağacı" : "bitkisi"}
Toprak Yapısı: ${context.soilType}
Sulama Yöntemi: ${context.irrigationType}
${plantKnowledgeSection}
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
6. **Kaynak Beyanı**: Yanıtının sonunda kısa bir "Kullanılan Kaynaklar" notu ekle; hangi bölümler için Yerel Proje Verisi, hangi bölümler için Harici Web Verisi (Open-Meteo), hangi bölümler için RAG dokümanlarını${context.hasPhotos ? " ve fotoğraf analizi için hangi kaynağı (RAG veya Gemini genel bilgisi)" : ""}${context.plantKnowledgeContext ? ", hangi bölümler için Bitki Bilgi Sözlüğü'nü" : ""}${context.decisionEngineContext ? ", hangi bölümler için Decision Engine kararını" : ""} kullandığını belirt.

Cevabını Markdown formatında, net başlıklar, maddeler ve profesyonel/samimi bir Türkçe tonuyla yaz.
`;
}
