/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Camera, Loader2, AlertTriangle, CheckCircle2, RotateCcw, Info, Save, Package2 } from "lucide-react";
import { useProductAnalysis } from "../hooks/useProductAnalysis";
import { useProductCreateFromAnalysis, ProductCreateFormValues } from "../hooks/useProductCreateFromAnalysis";
import { mapAnalysisToFormValues } from "../hooks/mapAnalysisToFormValues";

/**
 * Sprint 7E/7F — AI Vision → Product Analysis → Product Bank Kayıt akışı.
 *
 * Kullanıcı akışı: fotoğraf seç → gönder → sonucu gör → "Düzenle" formunu
 * doldur → "Product Bank'e Kaydet". AI, hiçbir ürün alanını (marka/etken
 * madde/NPK) ÖNERMEZ — yalnızca genel bir açıklama üretir; kullanıcı bu
 * alanları SIFIRDAN doldurur (bkz. product-create-request.types.ts,
 * "Değerlendirme 2" — neden ayrı bir AI/kullanıcı alan ayrımı YOK).
 */
function emptyFormValues(type: "Fertilizer" | "Chemical"): ProductCreateFormValues {
  return { type, name: "", unit: "" };
}

export default function ProductAnalysisScreen() {
  const { status, result, errorMessage, errorKind, analyzePhoto, reset } = useProductAnalysis();
  const { status: saveStatus, result: saveResult, errorMessage: saveErrorMessage, saveProduct, reset: resetSave } = useProductCreateFromAnalysis();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formValues, setFormValues] = useState<ProductCreateFormValues>(emptyFormValues("Fertilizer"));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reset();
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleAnalyze = () => {
    if (selectedFile) {
      analyzePhoto(selectedFile);
    }
  };

  const handleReset = () => {
    reset();
    resetSave();
    setSelectedFile(null);
    setPreviewUrl(null);
    setShowForm(false);
    setFormValues(emptyFormValues("Fertilizer"));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartForm = () => {
    setShowForm(true);
    // Sprint 7G: AI'ın etiketten okuduğu bilgi (varsa) formu ÖN DOLDURUR
    // — kullanıcı her alanı serbestçe değiştirebilir (bkz.
    // mapAnalysisToFormValues.ts, "AI hiçbir alanı kilitlemeyecek").
    setFormValues(mapAnalysisToFormValues(result));
  };

  const updateField = <K extends keyof ProductCreateFormValues>(key: K, value: ProductCreateFormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveToProductBank = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProduct(formValues);
  };

  const errorKindLabel: Record<string, string> = {
    network: "Ağ Bağlantısı Hatası",
    timeout: "Zaman Aşımı",
    vision: "Analiz Hatası",
    "invalid-file": "Geçersiz Dosya",
    api: "Sunucu Hatası",
    unknown: "Beklenmeyen Hata",
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Camera className="w-6 h-6 text-[#4a6b3f]" />
        <div>
          <h1 className="text-xl font-semibold text-[#2c3a26]">Ürün Analizi (Beta)</h1>
          <p className="text-sm text-[#80907a]">
            Bir ürün fotoğrafı yükleyin, yapay zeka genel bir değerlendirme yapsın. Analiz sonrası, dilerseniz ürün bilgilerini doldurup Ürün Bilgi Bankasına kaydedebilirsiniz.
          </p>
        </div>
      </div>

      {/* Fotoğraf seçimi */}
      <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFileSelect}
          className="hidden"
          id="product-analysis-file-input"
        />

        {!previewUrl ? (
          <label
            htmlFor="product-analysis-file-input"
            className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#c8d3c3] rounded-xl py-10 cursor-pointer hover:border-[#4a6b3f] transition-colors"
          >
            <Camera className="w-8 h-8 text-[#80907a]" />
            <span className="text-sm text-[#4a6b3f] font-medium">Fotoğraf seçmek için dokunun</span>
            <span className="text-xs text-[#a3ada0]">JPEG, PNG, WEBP, HEIC/HEIF — maksimum 8 MB</span>
          </label>
        ) : (
          <div className="space-y-3">
            <img src={previewUrl} alt="Seçilen ürün fotoğrafı" className="w-full max-h-64 object-contain rounded-xl border border-[#e2e8df]" />
            <div className="flex gap-2">
              {status !== "loading" && (
                <button
                  onClick={handleAnalyze}
                  disabled={status === "success"}
                  className="flex-1 bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "success" ? "Analiz Edildi" : "Fotoğrafı Analiz Et"}
                </button>
              )}
              <button onClick={handleReset} className="px-4 py-2.5 border border-[#c8d3c3] rounded-xl text-sm text-[#4a6b3f]">
                Farklı Fotoğraf Seç
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Yükleniyor durumu */}
      {status === "loading" && (
        <div className="flex items-center gap-3 bg-[#f5f8f4] border border-[#e2e8df] rounded-2xl p-5" role="status" aria-live="polite">
          <Loader2 className="w-5 h-5 text-[#4a6b3f] animate-spin" />
          <span className="text-sm text-[#4a6b3f]">Fotoğraf analiz ediliyor, lütfen bekleyin...</span>
        </div>
      )}

      {/* Başarısız durum */}
      {status === "error" && (
        <div className="bg-[#fdf3f2] border border-[#f3c9c2] rounded-2xl p-5 space-y-2" role="alert">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#b3452f]" />
            <span className="text-sm font-semibold text-[#b3452f]">{errorKind ? errorKindLabel[errorKind] : "Hata"}</span>
          </div>
          <p className="text-sm text-[#8a4636]">{errorMessage}</p>
          <button onClick={handleAnalyze} className="text-sm font-medium text-[#4a6b3f] underline">
            Tekrar Dene
          </button>
        </div>
      )}

      {/* Başarılı durum */}
      {status === "success" && result && (
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#4a6b3f]" />
            <span className="text-sm font-semibold text-[#2c3a26]">Analiz Sonucu</span>
          </div>

          <p className="text-sm text-[#3a4a34]">{result.description}</p>

          <div className="flex items-center gap-2 text-xs text-[#80907a]">
            <span>Güven Skoru:</span>
            <span className="font-mono font-medium">{Math.round(result.confidence * 100)}%</span>
          </div>

          {result.warnings.length > 0 && (
            <div className="bg-[#fff8e8] border border-[#f0dfa8] rounded-xl p-3 space-y-1">
              {result.warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-[#8a6d1f]">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/*
            Regresyon doğrulaması sonrası eklenen minimum düzeltme:
            `structuredExtraction` API yanıtında zaten dönüyordu (backend
            hep doğru çalışıyordu — gerçek çalıştırmayla kanıtlandı) ama
            bu ana sonuç ekranında HİÇ gösterilmiyordu, yalnızca kullanıcı
            "Product Bank'e Kaydet" formunu açtığında görünüyordu. Bu,
            yeni bir özellik/API çağrısı DEĞİL — zaten var olan bir
            alanın, zaten var olan bir ekranda salt-görüntüleme olarak
            gösterilmesi.
          */}
          {result.structuredExtraction && Object.values(result.structuredExtraction).some((v) => v !== undefined && (!Array.isArray(v) || v.length > 0)) && (
            <div className="bg-[#eef4ec] border border-[#c8e0c0] rounded-xl p-3 space-y-1">
              <div className="text-xs font-semibold text-[#2c3a26]">Etiketten Okunanlar (AI önerisi)</div>
              {result.structuredExtraction.brand && <div className="text-xs text-[#4a6b3f]">Marka: <strong>{result.structuredExtraction.brand}</strong></div>}
              {result.structuredExtraction.productName && <div className="text-xs text-[#4a6b3f]">Ürün adı: <strong>{result.structuredExtraction.productName}</strong></div>}
              {result.structuredExtraction.npkRatio && <div className="text-xs text-[#4a6b3f]">NPK: <strong>{result.structuredExtraction.npkRatio}</strong></div>}
              {result.structuredExtraction.activeIngredient && <div className="text-xs text-[#4a6b3f]">Etken madde: <strong>{result.structuredExtraction.activeIngredient}</strong></div>}
              {result.structuredExtraction.packageSize && <div className="text-xs text-[#4a6b3f]">Ambalaj: <strong>{result.structuredExtraction.packageSize}</strong></div>}
              <div className="text-[10px] text-[#80907a] pt-1">Kaydetmek için "Product Bank'e Kaydet" ile devam edin — bu bilgiler formda önceden doldurulmuş olacak, düzenleyebilirsiniz.</div>
            </div>
          )}

          <div className="pt-2 border-t border-[#e2e8df] space-y-3">
            {saveStatus === "success" && saveResult ? (
              <div className="bg-[#f0f7ee] border border-[#c8e0c0] rounded-xl p-4 space-y-2" role="status">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2c3a26]">
                  <CheckCircle2 className="w-4 h-4 text-[#4a6b3f]" />
                  Ürün Bilgi Bankasına kaydedildi.
                </div>
                {saveResult.duplicateFound && (
                  <p className="text-xs text-[#8a6d1f] flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Not: "{saveResult.duplicateProductName}" adlı benzer bir ürün zaten kayıtlıydı — bu kayıt yine de ayrı olarak eklendi.
                  </p>
                )}
                {/*
                  Kök neden düzeltmesi: `saveResult.productId` (gerçek UUID)
                  ÖNCEDEN veride vardı ama HİÇ gösterilmiyordu — bu yüzden
                  kullanıcılar "Belgelere Sor" ekranındaki "Ürün kimliği (id)"
                  alanına, bildikleri TEK şeyi (ürün adını) yazıyordu, bu da
                  getByLinkedEntity()'nin 0 sonuç dönmesine yol açıyordu
                  (gerçek log/kod izi ile kanıtlandı). Yeni bir ürün seçici/
                  arama özelliği İCAT EDİLMEDİ — yalnızca zaten var olan veri
                  artık kullanıcıya gösteriliyor, kopyalanabilir şekilde.
                */}
                <div className="flex items-center gap-2 text-xs bg-[#eef4ec] rounded-lg px-2.5 py-2">
                  <span className="text-[#4a6b3f] shrink-0">Ürün Kimliği (Belgelere Sor'da kullanın):</span>
                  <code className="font-mono text-[#2c3a26] truncate">{saveResult.productId}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(saveResult.productId)}
                    className="ml-auto shrink-0 text-[#4a6b3f] underline text-[10px]"
                  >
                    Kopyala
                  </button>
                </div>
              </div>
            ) : !showForm ? (
              <button onClick={handleStartForm} className="w-full flex items-center justify-center gap-2 bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium">
                <Package2 className="w-4 h-4" /> Product Bank'e Kaydet
              </button>
            ) : (
              <form onSubmit={handleSaveToProductBank} className="space-y-3 bg-[#f5f8f4] rounded-xl p-4">
                <p className="text-xs text-[#80907a]">
                  {result?.structuredExtraction
                    ? "Yapay zeka etiketten bazı alanları önerdi (aşağıda önceden dolduruldu) — lütfen kontrol edip gerekirse düzeltin. Son karar size ait."
                    : "Yapay zeka bu alanları okuyamadı — aşağıdaki bilgileri siz doldurun."}
                </p>

                {(result?.structuredExtraction?.packageSize || result?.structuredExtraction?.manufacturer) && (
                  <div className="text-xs text-[#4a6b3f] bg-[#eef4ec] rounded-lg p-2 space-y-0.5">
                    {result.structuredExtraction.packageSize && <div>Etikette okunan paket boyutu: <strong>{result.structuredExtraction.packageSize}</strong> (birim alanına siz girin)</div>}
                    {result.structuredExtraction.manufacturer && <div>Üretici: <strong>{result.structuredExtraction.manufacturer}</strong></div>}
                  </div>
                )}

                {result?.structuredExtraction?.importantWarnings && result.structuredExtraction.importantWarnings.length > 0 && (
                  <div className="bg-[#fdf3f2] border border-[#f3c9c2] rounded-lg p-2 space-y-1">
                    <div className="text-xs font-semibold text-[#b3452f]">Etiketteki Önemli Uyarılar</div>
                    {result.structuredExtraction.importantWarnings.map((w, i) => (
                      <div key={i} className="text-xs text-[#8a4636]">• {w}</div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  {(["Fertilizer", "Chemical"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => updateField("type", t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border ${formValues.type === t ? "bg-[#4a6b3f] text-white border-[#4a6b3f]" : "bg-white text-[#4a6b3f] border-[#c8d3c3]"}`}
                    >
                      {t === "Fertilizer" ? "Gübre" : "Zirai İlaç"}
                    </button>
                  ))}
                </div>

                <input required placeholder="Ürün adı *" value={formValues.name} onChange={(e) => updateField("name", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
                <input placeholder="Marka" value={formValues.brand || ""} onChange={(e) => updateField("brand", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
                <input required placeholder="Birim (örn. Litre, Kg) *" value={formValues.unit} onChange={(e) => updateField("unit", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />

                {formValues.type === "Fertilizer" ? (
                  <input placeholder="NPK oranı (örn. 15-15-15)" value={formValues.npkRatio || ""} onChange={(e) => updateField("npkRatio", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
                ) : (
                  <>
                    <input required placeholder="Etken madde *" value={formValues.activeIngredient || ""} onChange={(e) => updateField("activeIngredient", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
                    <input placeholder="Konsantrasyon (örn. %25)" value={formValues.concentration || ""} onChange={(e) => updateField("concentration", e.target.value)} className="w-full border border-[#c8d3c3] rounded-lg px-3 py-2 text-sm" />
                  </>
                )}

                {saveStatus === "error" && (
                  <div className="bg-[#fdf3f2] border border-[#f3c9c2] rounded-lg p-3 text-xs text-[#8a4636]" role="alert">
                    {saveErrorMessage}
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="submit" disabled={saveStatus === "saving"} className="flex-1 flex items-center justify-center gap-2 bg-[#4a6b3f] text-white rounded-xl py-2.5 font-medium disabled:opacity-50">
                    {saveStatus === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saveStatus === "saving" ? "Kaydediliyor..." : "Kaydet"}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-[#c8d3c3] rounded-xl text-sm text-[#4a6b3f]">
                    İptal
                  </button>
                </div>
              </form>
            )}
            <button onClick={handleReset} className="w-full flex items-center justify-center gap-2 text-sm text-[#80907a]">
              <RotateCcw className="w-4 h-4" /> Yeni Fotoğraf Analiz Et
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
