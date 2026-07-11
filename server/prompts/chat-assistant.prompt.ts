/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildSafeUserQuerySection } from "./prompt-safety.util";

/**
 * Builds the prompt for the RAG document-pool chat assistant.
 * Extracted into its own module per this project's mandated
 * prompt-management architecture (prompts are never embedded directly
 * inside service logic).
 * @param ragContext Pre-formatted, source-labeled RAG context block
 * @param userQuery Already length-capped user question text
 * @param scopeLabel When set (e.g. "Honda GX35 Çapa Motoru"), this call
 *   is scoped to a single equipment's manual rather than the general
 *   knowledge base (see EquipmentService AI destek). The prompt then
 *   names the equipment explicitly and adds an extra, unambiguous
 *   grounding instruction — troubleshooting advice for physical
 *   machinery carries real safety/cost stakes if the model quietly
 *   blends in generic "how motors usually work" knowledge instead of
 *   this specific manual's actual instructions, so this path is held to
 *   a stricter standard than the general chat assistant.
 * @param webFallbackEnabled When true, the caller determined the RAG
 *   knowledge base has no good match for this question and enabled
 *   Gemini's Google Search grounding tool for this call. The prompt
 *   permits web-sourced information ONLY in this case, and requires it
 *   to be clearly flagged as unverified — distinct from the (verified,
 *   user-uploaded) document content — per explicit design decision.
 */
export function buildChatAssistantPrompt(ragContext: string, userQuery: string, scopeLabel?: string, webFallbackEnabled?: boolean): string {
  const userQuerySection = buildSafeUserQuerySection(userQuery);
  const roleIntro = scopeLabel
    ? `Sen "${scopeLabel}" adlı ekipmana özel bir arıza destek asistanısın. Cevapların öncelikle bu ekipman için yüklenen kullanım kılavuzuna dayanmalı.`
    : `Sen Mersin Toroslar ve Değirmençay bölgesinde uzmanlaşmış tarım asistanı "Mersin Tarım Asistanı" yapay zeka danışmanısın.\nAşağıdaki bilgi deposundan alınan kaynakları temel alarak kullanıcının zeytin tarımı, bahçe bakımı, gübreleme veya hastalık koruma ile ilgili sorusuna yanıt vereceksin.`;
  const extraStrictness = scopeLabel
    ? `\nBu, genel bir tarım sohbeti DEĞİL — öncelikle "${scopeLabel}" ekipmanının kendi kılavuzuyla sınırlı bir arıza destek oturumu.`
    : "";

  const groundingInstruction = webFallbackEnabled
    ? `\n=== ÖNEMLİ: KAYNAK KURALLARI (İnternet Araması Etkin) ===\nYukarıdaki bilgi deposunda bu soruya net bir cevap YOK — bu yüzden internet arama aracın etkinleştirildi. Cevabını şu sıraya göre oluştur:\n1. Önce yukarıdaki bilgi deposunda (varsa) kısmen ilgili bir bilgi olup olmadığına bak.\n2. Yeterli değilse, internet aramasını kullanarak güvenilir kaynaklardan (üretici siteleri, resmi kılavuzlar, tanınmış teknik kaynaklar) bilgi bul.\n3. İnternetten bulduğun HER bilginin başına MUTLAKA şu uyarıyı ekle: "**⚠️ Kılavuzunuzda bu bilgi bulunmuyor, internetten araştırılmıştır ve doğrulanmamış olabilir — uygulamadan önce üreticinin resmi kaynağını veya bir uzmanı kontrol edin.**" Bu uyarıyı hiçbir zaman atlama.\n4. Bilgi deposundan gelen bilgiyle internetten gelen bilgiyi asla birbirine karıştırıp tek bir kaynakmış gibi sunma; ikisini açıkça ayır.`
    : `\nYalnızca yukarıdaki bilgi deposu referanslarına dayan; bu referanslarda yer almayan hiçbir bilgiyi (genel eğitim verinden veya varsayımdan) cevaba dahil etme. Bilgi deposunda eşleşen bir kaynak yoksa bunu açıkça belirt; var olmayan bir referanstan alıntı yapıyormuş gibi davranma.`;

  return `
${roleIntro}

=== BİLGİ DEPOSU REFERANSLARI (KAYNAK: RAG - Yüklenen Dokümanlar) ===
${ragContext}
${extraStrictness}

${userQuerySection}

Lütfen soruyu tamamen doğru, bilimsel ve pratik bir yaklaşımla, Türkçe tonunda yanıtla.${groundingInstruction} Markdown formatını kullan.
`;
}
