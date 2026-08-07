/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { MessageCircleQuestion, Loader2, AlertTriangle, FileText, Info } from "lucide-react";
import { useProductDocumentQa } from "../hooks/useProductDocumentQa";

/**
 * Sprint 7H — "Belgelere Sor" ekranı. Kullanıcı bir ürünün kimliğini ve
 * sorusunu girer; yanıt YALNIZCA o ürüne bağlı belgelerden üretilir
 * (bkz. product-document-qa.service.ts — belge yoksa/eşleşme yoksa
 * Gemini'ye hiç sorulmadan açık bir "bulunamadı" mesajı döner).
 *
 * NOT: Bu sprintin kapsamı bir "ürün seçici" ekranı içermiyor (Product
 * Bank'ın henüz bir liste/detay ekranı yok, bkz. Sprint 7C backend-only
 * kapsamı) — kullanıcı, ürünün kimliğini (id) doğrudan girer. Bu,
 * bilinçli bir basitleştirme, Sprint 8'de bir ürün seçici eklenerek
 * iyileştirilebilir.
 */
export default function ProductDocumentQaScreen() {
  const { status, answer, errorMessage, errorKind, askQuestion, reset } = useProductDocumentQa();
  const [productId, setProductId] = useState("");
  const [question, setQuestion] = useState("");

  const errorKindLabel: Record<string, string> = {
    network: "Ağ Bağlantısı Hatası",
    timeout: "Zaman Aşımı",
    vision: "Yanıt Hatası",
    "invalid-file": "Geçersiz İstek",
    api: "Sunucu Hatası",
    unknown: "Beklenmeyen Hata",
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId.trim() || !question.trim()) return;
    askQuestion(productId.trim(), question.trim());
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <MessageCircleQuestion className="w-6 h-6 text-[#4a6b3f]" />
        <div>
          <h1 className="text-xl font-semibold text-[#2c3a26]">Belgelere Sor (Beta)</h1>
          <p className="text-sm text-[#80907a]">
            Bir ürünün Ürün Bilgi Bankası'na bağlı belgeleri hakkında soru sorun. Yanıt YALNIZCA o ürüne bağlı belgelerden üretilir — belge yoksa tahmin yürütülmez.
          </p>
        </div>
      </div>

      <form onSubmit={handleAsk} className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-3">
        <input
          required
          placeholder="Ürün kimliği (id)"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm"
        />
        <textarea
          required
          placeholder="Sorunuz (örn. 'Bu ürün nasıl saklanmalı?')"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={status === "asking"}
          className="w-full flex items-center justify-center gap-2 bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium disabled:opacity-50"
        >
          {status === "asking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircleQuestion className="w-4 h-4" />}
          {status === "asking" ? "Yanıtlanıyor..." : "Sor"}
        </button>
      </form>

      {status === "asking" && (
        <div className="flex items-center gap-3 bg-[#f5f8f4] border border-[#e2e8df] rounded-2xl p-5" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-[#4a6b3f] animate-spin" />
          <span className="text-sm text-[#4a6b3f]">Belgeler taranıyor, yanıt oluşturuluyor...</span>
        </div>
      )}

      {status === "error" && (
        <div className="bg-[#fdf3f2] border border-[#f3c9c2] rounded-2xl p-5 space-y-2" role="alert">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#b3452f]" />
            <span className="text-sm font-semibold text-[#b3452f]">{errorKind ? errorKindLabel[errorKind] : "Hata"}</span>
          </div>
          <p className="text-sm text-[#8a4636]">{errorMessage}</p>
        </div>
      )}

      {status === "success" && answer && (
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
          <p className="text-sm text-[#3a4a34]">{answer.answer}</p>

          {answer.hasLinkedDocuments && answer.usedDocuments.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#80907a]">
              <span>Güven Skoru:</span>
              <span className="font-mono font-medium">{Math.round(answer.confidence * 100)}%</span>
            </div>
          )}

          {answer.usedDocuments.length > 0 && (
            <div className="border-t border-[#e2e8df] pt-3 space-y-1.5">
              <div className="text-xs font-semibold text-[#4a6b3f]">Kaynak Belgeler</div>
              {answer.usedDocuments.map((doc, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[#4a6b3f]">
                  <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{doc.fileName}{doc.heading ? ` — ${doc.heading}` : ""} <span className="text-[#a3b39c]">(skor: {doc.retrievalScore.toFixed(3)})</span></span>
                </div>
              ))}
            </div>
          )}

          {!answer.hasLinkedDocuments && answer.usedDocuments.length === 0 && (
            <div className="flex items-start gap-2 text-xs text-[#8a6d1f] bg-[#fff8e8] border border-[#f0dfa8] rounded-lg p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Bu ürüne henüz hiçbir belge bağlanmamış.</span>
            </div>
          )}
          {!answer.hasLinkedDocuments && answer.usedDocuments.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-[#8a6d1f] bg-[#fff8e8] border border-[#f0dfa8] rounded-lg p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Bu ürüne doğrudan bağlı bir belge yok — yanıt, genel belge havuzunda bulunan ilgili içerikten üretildi.</span>
            </div>
          )}

          {answer.warnings.length > 0 && (
            <div className="space-y-1">
              {answer.warnings.map((w, i) => (
                <div key={i} className="text-xs text-[#8a6d1f]">⚠ {w}</div>
              ))}
            </div>
          )}

          <button onClick={reset} className="text-sm font-medium text-[#4a6b3f] underline">
            Yeni Soru Sor
          </button>
        </div>
      )}
    </div>
  );
}
