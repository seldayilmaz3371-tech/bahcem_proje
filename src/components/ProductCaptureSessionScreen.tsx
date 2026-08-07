/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { FolderPlus, FileImage, FileText, Loader2, AlertTriangle, CheckCircle2, X, Save, RotateCcw } from "lucide-react";
import { useProductCaptureSession, CaptureFileStatus } from "../hooks/useProductCaptureSession";
import { ProductCreateFormValues } from "../hooks/useProductCreateFromAnalysis";

/**
 * Sprint 8 — Product Capture Session ekranı. Kullanıcı, AYNI ürüne ait
 * birden fazla fotoğraf VE belgeyi (PDF/DOCX/TXT) TEK oturumda seçer;
 * hepsi TEK bir Product Bank kaydında birleştirilir (bkz.
 * product-capture-session.merge.ts — "ilk bulunan kazanır" kuralı).
 *
 * Mevcut `ProductAnalysisScreen.tsx`'e (tek fotoğraf akışı) KASITLI
 * OLARAK dokunulmadı — bu, YENİ, PARALEL bir ekrandır; iki akış da
 * bağımsız çalışmaya devam eder.
 */
const statusLabel: Record<CaptureFileStatus, string> = {
  waiting: "Bekliyor",
  analyzing: "Analiz ediliyor",
  processing: "İşleniyor",
  indexing: "İndeksleniyor",
  ready: "Hazır",
  failed: "Başarısız",
};

const DOCUMENT_CATEGORIES = ["Ön Etiket", "Arka Etiket", "Garanti Edilen İçerik", "Kullanım Tablosu", "Teknik Föy", "MSDS", "Sertifika", "Diğer"];

export default function ProductCaptureSessionScreen() {
  const { phase, entries, analysisSummary, saveResult, errorMessage, errorKind, addPhotos, addDocuments, removeEntry, analyze, save, reset } = useProductCaptureSession();
  const [pendingDocCategory, setPendingDocCategory] = useState(DOCUMENT_CATEGORIES[0]);
  const [formValues, setFormValues] = useState<ProductCreateFormValues>({ type: "Fertilizer", name: "", unit: "" });
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) addPhotos(files);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) addDocuments(files, pendingDocCategory);
    if (docInputRef.current) docInputRef.current.value = "";
  };

  const handleAnalyze = async () => {
    await analyze();
  };

  const handleStartReview = () => {
    const ext = analysisSummary?.structuredExtraction as any;
    setFormValues({
      type: (ext?.categorySuggestion as "Fertilizer" | "Chemical") || "Fertilizer",
      name: ext?.productName || "",
      brand: ext?.brand,
      unit: "", // bkz. mapAnalysisToFormValues.ts — packageSize ile unit KARIŞTIRILMAZ
      npkRatio: ext?.npkRatio,
      activeIngredient: ext?.activeIngredient,
      concentration: ext?.concentration,
      sourceAnalysisConfidence: analysisSummary?.confidence,
    });
  };

  const updateField = <K extends keyof ProductCreateFormValues>(key: K, value: ProductCreateFormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await save(formValues);
  };

  const [reviewStarted, setReviewStarted] = useState(false);
  const docEntries = entries.filter((en) => en.kind === "document");

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FolderPlus className="w-6 h-6 text-[#4a6b3f]" />
        <div>
          <h1 className="text-xl font-semibold text-[#2c3a26]">Ürün Toplama Oturumu (Beta)</h1>
          <p className="text-sm text-[#80907a]">
            Aynı ürüne ait tüm fotoğrafları (ön/arka etiket, kullanım tablosu vb.) ve belgeleri (MSDS, teknik föy) tek seferde seçin — yapay zeka hepsini birleştirip tek bir kayıt önerecek.
          </p>
        </div>
      </div>

      {phase !== "saved" && (
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input ref={photoInputRef} type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif" onChange={handlePhotoSelect} className="hidden" id="capture-photo-input" />
              <label htmlFor="capture-photo-input" className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-[#c8d3c3] rounded-xl py-6 cursor-pointer hover:border-[#4a6b3f]">
                <FileImage className="w-6 h-6 text-[#80907a]" />
                <span className="text-xs text-[#4a6b3f] font-medium">Fotoğraf(lar) Ekle</span>
              </label>
            </div>
            <div className="space-y-2">
              <select value={pendingDocCategory} onChange={(e) => setPendingDocCategory(e.target.value)} className="w-full text-xs border border-[#c8d3c3] rounded-lg px-2 py-1.5">
                {DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input ref={docInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={handleDocSelect} className="hidden" id="capture-doc-input" />
              <label htmlFor="capture-doc-input" className="flex flex-col items-center justify-center gap-1 border-2 border-dashed border-[#c8d3c3] rounded-xl py-4 cursor-pointer hover:border-[#4a6b3f]">
                <FileText className="w-5 h-5 text-[#80907a]" />
                <span className="text-xs text-[#4a6b3f] font-medium">Belge Ekle</span>
              </label>
            </div>
          </div>

          {entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-[#f5f8f4] rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.kind === "photo" ? <FileImage className="w-3.5 h-3.5 shrink-0 text-[#4a6b3f]" /> : <FileText className="w-3.5 h-3.5 shrink-0 text-[#4a6b3f]" />}
                    <span className="truncate">{entry.file.name}{entry.documentCategory ? ` (${entry.documentCategory})` : ""}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-medium ${entry.status === "failed" ? "text-[#b3452f]" : entry.status === "ready" ? "text-[#4a6b3f]" : "text-[#80907a]"}`}>
                      {statusLabel[entry.status]}
                    </span>
                    {phase === "idle" && (
                      <button onClick={() => removeEntry(i)} className="text-[#80907a] hover:text-[#b3452f]"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {phase === "idle" && entries.length > 0 && (
            <button onClick={handleAnalyze} className="w-full bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium">Fotoğrafları Analiz Et</button>
          )}
        </div>
      )}

      {phase === "analyzing" && (
        <div className="flex items-center gap-3 bg-[#f5f8f4] border border-[#e2e8df] rounded-2xl p-5" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-[#4a6b3f] animate-spin" />
          <span className="text-sm text-[#4a6b3f]">Fotoğraflar analiz ediliyor ve birleştiriliyor...</span>
        </div>
      )}

      {phase === "error" && (
        <div className="bg-[#fdf3f2] border border-[#f3c9c2] rounded-2xl p-5 space-y-2" role="alert">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#b3452f]" />
            <span className="text-sm font-semibold text-[#b3452f]">Hata ({errorKind})</span>
          </div>
          <p className="text-sm text-[#8a4636]">{errorMessage}</p>
        </div>
      )}

      {(phase === "reviewing" || phase === "saving") && analysisSummary && (
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-3">
          <p className="text-sm text-[#3a4a34]">{analysisSummary.description}</p>
          {!reviewStarted ? (
            <button onClick={() => { handleStartReview(); setReviewStarted(true); }} className="w-full bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium">Bilgileri Gözden Geçir ve Kaydet</button>
          ) : (
            <form onSubmit={handleSave} className="space-y-3 bg-[#f5f8f4] rounded-xl p-4">
              <p className="text-xs text-[#80907a]">Fotoğraflardan birleştirilen bilgiler — kontrol edip gerekirse düzeltin.</p>
              <div className="flex gap-2">
                {(["Fertilizer", "Chemical"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => updateField("type", t)} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${formValues.type === t ? "bg-[#4a6b3f] text-white border-[#4a6b3f]" : "bg-white text-[#4a6b3f] border-[#c8d3c3]"}`}>
                    {t === "Fertilizer" ? "Gübre" : "Zirai İlaç"}
                  </button>
                ))}
              </div>
              <input required placeholder="Ürün adı *" value={formValues.name} onChange={(e) => updateField("name", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
              <input placeholder="Marka" value={formValues.brand || ""} onChange={(e) => updateField("brand", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
              <input required placeholder="Birim (örn. Litre, Kg) *" value={formValues.unit} onChange={(e) => updateField("unit", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
              {formValues.type === "Fertilizer" ? (
                <input placeholder="NPK oranı" value={formValues.npkRatio || ""} onChange={(e) => updateField("npkRatio", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
              ) : (
                <input required placeholder="Etken madde *" value={formValues.activeIngredient || ""} onChange={(e) => updateField("activeIngredient", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
              )}
              {docEntries.length > 0 && <p className="text-xs text-[#80907a]">{docEntries.length} belge de bu ürüne bağlı olarak indekslenecek.</p>}
              <button type="submit" disabled={phase === "saving"} className="w-full flex items-center justify-center gap-2 bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium disabled:opacity-50">
                {phase === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {phase === "saving" ? "Kaydediliyor..." : "Product Bank'e Kaydet"}
              </button>
            </form>
          )}
        </div>
      )}

      {phase === "saved" && saveResult && (
        <div className="bg-[#f0f7ee] border border-[#c8e0c0] rounded-2xl p-5 space-y-2" role="status">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#2c3a26]">
            <CheckCircle2 className="w-4 h-4 text-[#4a6b3f]" /> Ürün Bilgi Bankasına kaydedildi.
          </div>
          <p className="text-xs text-[#4a6b3f]">{saveResult.photoCount} fotoğraf ve {saveResult.indexedDocuments?.length || 0} belge kaydedildi/indekslendi.</p>
          {saveResult.createOutcome?.product?.id && (
            <div className="flex items-center gap-2 text-xs bg-[#eef4ec] rounded-lg px-2.5 py-2">
              <span className="text-[#4a6b3f] shrink-0">Ürün Kimliği (Belgelere Sor'da kullanın):</span>
              <code className="font-mono text-[#2c3a26] truncate">{saveResult.createOutcome.product.id}</code>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(saveResult.createOutcome.product.id)}
                className="ml-auto shrink-0 text-[#4a6b3f] underline text-[10px]"
              >
                Kopyala
              </button>
            </div>
          )}
          {saveResult.skippedDocuments?.length > 0 && (
            <p className="text-xs text-[#8a6d1f]">{saveResult.skippedDocuments.length} belge işlenemedi (desteklenmeyen format).</p>
          )}
          <button onClick={reset} className="mt-2 flex items-center gap-2 text-sm font-medium text-[#4a6b3f] underline">
            <RotateCcw className="w-4 h-4" /> Yeni Oturum Başlat
          </button>
        </div>
      )}
    </div>
  );
}
