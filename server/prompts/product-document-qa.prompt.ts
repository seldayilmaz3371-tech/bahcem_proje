/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from "zod";

/**
 * Sprint 7H — Product Bank Document Q&A Prompt Builder.
 *
 * Bu, `chat-assistant.prompt.ts`'ten (genel sohbet asistanı) BİLİNÇLİ
 * OLARAK AYRI bir dosyadır — genel sohbet akışının "RAG'de eşleşme
 * yoksa Google Search'e düş" davranışını (webFallback) MİRAS ALMAZ.
 * Sprint 7H'nin kesin kuralı: "Belge bulunmuyorsa AI tahmin
 * üretmeyecek" — bu yüzden bu prompt yalnızca RAG bağlamı VARKEN
 * çağrılır (bkz. product-document-qa.service.ts, eşleşme yoksa Gemini'ye
 * hiç istek atılmadan erken döner).
 *
 * Yeni bir Gemini entegrasyonu İÇERMİYOR — yalnızca yeni bir prompt
 * metni ve yeni bir yanıt şeması tanımlıyor; Gemini çağrısının kendisi
 * mevcut `gemini-client.ts` (getGeminiClient/callGeminiWithRetry)
 * fonksiyonlarıyla, `chat-assistant.service.ts`'in zaten kullandığı
 * AYNI TEXT-only çağrı deseniyle yapılıyor (bkz. servis dosyası).
 */
export const productDocumentAnswerSchema = z.object({
  answer: z.string().trim().min(1).catch("Bu soruya belgelerden bir yanıt oluşturulamadı."),
  confidence: z.number().min(0).max(1).catch(0),
  citations: z
    .array(
      z.object({
        documentId: z.string(),
        excerpt: z.string().optional().catch(undefined),
      })
    )
    .catch([]),
  warnings: z.array(z.string()).catch([]),
});

export type ProductDocumentAnswer = z.infer<typeof productDocumentAnswerSchema>;

/**
 * RAG bağlamı (seçilmiş chunk'lar) ve kullanıcının sorusuyla, Sprint 7H'nin
 * kesin kurallarını (tahmin yapma, belgede yoksa açıkça belirt, kaynağını
 * göster) uygulayan bir prompt üretir.
 */
export function buildProductDocumentQaPrompt(ragContext: string, question: string): string {
  return `
Sen, YALNIZCA aşağıda verilen belge parçalarına dayanarak soruları yanıtlayan bir tarım ürünü asistanısın.

BELGE PARÇALARI:
${ragContext}

KULLANICI SORUSU:
${question}

SADECE aşağıdaki JSON şemasına uyan, başka hiçbir metin içermeyen bir JSON nesnesi döndür:

{
  "answer": "<sorunun yanıtı, YALNIZCA yukarıdaki belge parçalarına dayanarak>",
  "confidence": <0.0-1.0 arası, yanıtın belgelerle ne kadar iyi desteklendiğini gösteren ondalıklı sayı>,
  "citations": [{"documentId": "<[Referans N] etiketindeki belge kimliği>", "excerpt": "<yanıtı destekleyen kısa alıntı, varsa>"}],
  "warnings": ["<varsa, örn. 'Belgede net bir bilgi yok, en yakın ilgili bölüm kullanıldı' gibi uyarılar>"]
}

KESİN KURALLAR:
1. YUKARIDAKİ belge parçalarında GERÇEKTEN yer almayan hiçbir bilgiyi ASLA yazma. TAHMİN YÜRÜTME, UYDURMA VERİ ÜRETME.
2. KISMİ BİLGİ KURALI: Belge parçaları sorunun YALNIZCA bir kısmına cevap veriyorsa, "answer" alanına ÖNCE bulunan bilgileri "Belgelerde bulunan bilgiler:" başlığı altında listele, ARDINDAN sorunun cevaplanamayan kısmını "Belgelerde bulunmayan bilgiler:" başlığı altında AYRI belirt. Belgede HİÇBİR şekilde soruyla ilgili bilgi yoksa (kısmi bile değilse) "answer" alanına YALNIZCA "Belgelerde bu bilgi bulunamadı." yaz — soruyla İLGİLİ herhangi bir bilgi (isim, kategori, oran, doz vb.) VARSA bu durumu kullanma, madde 2'deki kısmi bilgi kuralını uygula.
3. Yanıtının hangi belgeye/referansa dayandığını "citations" alanında MUTLAKA belirt.
4. Genel tarım bilgini KULLANMA — yalnızca sana verilen belge parçalarını kullan.
5. Yanıtın SADECE JSON olmalı — açıklama, markdown işaretleyici veya başka metin EKLEME.
`.trim();
}
