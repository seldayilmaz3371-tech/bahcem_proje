/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { 
  BrainCircuit, 
  Sparkles, 
  Send, 
  MapPin, 
  Printer, 
  RefreshCw, 
  HelpCircle,
  Clock,
  ChevronRight,
  Download,
  Camera,
  Image as ImageIcon,
  X
} from "lucide-react";
import { Parcel, AIRecommendation, AiUsageSnapshot } from "../types";

const MAX_DIAGNOSIS_PHOTOS = 3;

/**
 * Confidence scores at or below this threshold trigger a visible warning
 * banner encouraging the farmer to provide clearer evidence (a different
 * photo angle, more detail) rather than silently trusting a low-certainty
 * AI report, per this project's confidence-disclosure requirement.
 */
const LOW_CONFIDENCE_THRESHOLD = 0.65;

export default function AIRecommendations() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState(() => {
    return localStorage.getItem("agri_selected_parcel_id") || "";
  });
  const [userQuery, setUserQuery] = useState("");

  // Up to MAX_DIAGNOSIS_PHOTOS diagnosis photos attached to the next
  // report request. photoFiles holds the actual File objects sent to the
  // server; photoPreviews holds parallel local base64 previews only (never
  // sent to the server — the server receives the raw files via FormData).
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  
  const [generating, setGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<AIRecommendation | null>(() => {
    const saved = localStorage.getItem("agri_current_report");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  
  const [history, setHistory] = useState<AIRecommendation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [error, setError] = useState("");

  // Estimated daily Gemini API usage, shown as a transparency indicator.
  // See AiUsageSnapshot's documentation: this is a self-reported estimate,
  // never presented to the user as a guaranteed-exact figure from Google.
  const [aiUsage, setAiUsage] = useState<AiUsageSnapshot | null>(null);

  const fetchAiUsage = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/ai/usage", { headers });
      if (res.ok) {
        setAiUsage(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAiUsage();
  }, []);

  const changeSelectedParcelId = (id: string) => {
    setSelectedParcelId(id);
    localStorage.setItem("agri_selected_parcel_id", id);
  };

  const saveAndSetCurrentReport = (report: AIRecommendation | null) => {
    setCurrentReport(report);
    if (report) {
      localStorage.setItem("agri_current_report", JSON.stringify(report));
    } else {
      localStorage.removeItem("agri_current_report");
    }
  };

  const fetchParcels = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/parcels", { headers });
      if (res.ok) {
        const data = await res.json();
        setParcels(data);
        if (data.length > 0 && !selectedParcelId) {
          changeSelectedParcelId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchParcels();
  }, []);

  const fetchParcelHistory = async (parcelId: string) => {
    if (!parcelId) return;
    setLoadingHistory(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/ai/recommendations/${parcelId}`, { headers });
      if (res.ok) {
        setHistory(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedParcelId) {
      fetchParcelHistory(selectedParcelId);
      // Clear the current report ONLY if it belongs to a different parcel!
      if (currentReport && currentReport.parcelId !== selectedParcelId) {
        saveAndSetCurrentReport(null);
      }
    }
  }, [selectedParcelId]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // Allow re-selecting the same file consecutively
    if (!file) return;

    if (photoFiles.length >= MAX_DIAGNOSIS_PHOTOS) {
      setError(`En fazla ${MAX_DIAGNOSIS_PHOTOS} teşhis fotoğrafı ekleyebilirsiniz.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoFiles((prev) => [...prev, file]);
      setPhotoPreviews((prev) => [...prev, reader.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (index: number) => {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParcelId) {
      setError("Öncelikle tavsiye almak istediğiniz zeytinlik parselini seçmelisiniz.");
      return;
    }

    setError("");
    setGenerating(true);
    saveAndSetCurrentReport(null);

    try {
      const resolvedQuery = userQuery || "Mevcut tarla gözlemleri, hava durumu ve stok envanter seviyelerine göre genel tarımsal durum analizi ve gelecek haftalık faaliyet reçetesi üret.";

      // FormData is used unconditionally (even with zero photos) so the
      // server-side route can rely on a single, consistent multipart
      // request shape via Multer.
      const formData = new FormData();
      formData.append("userQuery", resolvedQuery);
      photoFiles.forEach((file) => formData.append("photos", file));

      const res = await fetch(`/api/ai/recommend/${selectedParcelId}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`
          // Intentionally no Content-Type header: the browser sets the
          // correct "multipart/form-data; boundary=..." automatically for
          // FormData bodies. Setting it manually would break the upload.
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Yapay zeka tavsiye raporu oluşturulamadı.");
      }

      saveAndSetCurrentReport(data);
      setUserQuery("");
      setPhotoFiles([]);
      setPhotoPreviews([]);
      fetchParcelHistory(selectedParcelId); // Refresh history feed
      fetchAiUsage(); // Refresh usage indicator — a call was just made
    } catch (err: any) {
      setError(err.message || "Gemini API bağlantısında veya sunucu işleminde bir sorun oluştu.");
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyShortcut = (query: string) => {
    setUserQuery(query);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="ai-advisor-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Yapay Zeka Karar Destek Sistemi</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Mersin Değirmençay zeytinliklerinin toprak yapısı, hastalık geçmişi ve hava durumuna göre kişiselleştirilmiş Gemini raporları
          </p>
        </div>

        {aiUsage && aiUsage.models.length > 0 && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {aiUsage.models.map((model) => (
              <div
                key={model.modelName}
                id={`ai-usage-badge-${model.modelName}`}
                title="Bu, Google'ın kesin canlı verisi değil; uygulamanın kendi tuttuğu tahmini bir sayaçtır."
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${
                  model.percentageUsed !== null && model.percentageUsed >= 80
                    ? "bg-red-50 text-red-700 border-red-200"
                    : "bg-[#f0f4ee] text-[#556b2f] border-[#dee5db]"
                }`}
              >
                {model.dailyLimit !== null
                  ? `Tahmini Kullanım: ${model.usedToday}/${model.dailyLimit}`
                  : `Bugünkü Kullanım: ${model.usedToday}`}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Configuration & Prompting */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-[#80907a] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-[#556b2f]" />
              <span>Analiz Parametreleri</span>
            </h2>

            {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Hedef Zeytinlik Parseli</label>
                <select
                  value={selectedParcelId}
                  onChange={(e) => changeSelectedParcelId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
                >
                  {parcels.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.treeCount} Ağaç)</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Özel Soru / İstek</label>
                <textarea
                  rows={4}
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="İlaçlama dozajı, don önlemleri, gübreleme takvimi veya verim artırma yolları hakkında sormak istediğiniz konuyu yazın..."
                  className="w-full px-4 py-3 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">
                  Teşhis Fotoğrafı (İsteğe Bağlı, En Fazla {MAX_DIAGNOSIS_PHOTOS})
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all border ${
                    photoFiles.length >= MAX_DIAGNOSIS_PHOTOS
                      ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                      : "bg-[#f0f4ee] hover:bg-[#e4ebdf] text-[#556b2f] border-[#dee5db]"
                  }`}>
                    <Camera className="h-3.5 w-3.5" />
                    <span>Kamerayla Çek</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoSelect}
                      disabled={photoFiles.length >= MAX_DIAGNOSIS_PHOTOS}
                      className="hidden"
                    />
                  </label>

                  <label className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl cursor-pointer transition-all border ${
                    photoFiles.length >= MAX_DIAGNOSIS_PHOTOS
                      ? "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed"
                      : "bg-[#f0f4ee] hover:bg-[#e4ebdf] text-[#556b2f] border-[#dee5db]"
                  }`}>
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Galeriden Seç</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoSelect}
                      disabled={photoFiles.length >= MAX_DIAGNOSIS_PHOTOS}
                      className="hidden"
                    />
                  </label>
                </div>

                {photoPreviews.length > 0 && (
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {photoPreviews.map((preview, index) => (
                      <div key={index} className="relative h-14 w-14 rounded-lg overflow-hidden border border-[#cdd4ca]">
                        <img src={preview} alt={`Teşhis fotoğrafı ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(index)}
                          title="Fotoğrafı kaldır"
                          aria-label="Fotoğrafı kaldır"
                          className="absolute top-0 right-0 p-0.5 bg-black/60 hover:bg-red-700 text-white rounded-bl transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-[#80907a] italic mt-1.5 leading-relaxed">
                  Fotoğraf eklerseniz, Gemini önce Doküman Havuzunuzda (RAG) eşleşen bir tedavi arar; bulamazsa genel bilgisini kullanır ve raporda bunu açıkça belirtir. Fotoğraflar kalıcı olarak Saha Gözlemleri geçmişine de kaydedilir.
                  <br />
                  <span className="font-semibold not-italic">İpucu:</span> Tek bir yakın çekim yerine, mümkünse <span className="font-semibold not-italic">genel görünüm + yakın çekim + yaprak altı</span> gibi farklı açılardan 2-3 fotoğraf yükleyin — teşhis doğruluğu belirgin şekilde artar.
                </p>
              </div>

              {/* Suggestions shortcuts */}
              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-[#80907a] uppercase tracking-wider">Hızlı Analiz Şablonları</span>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => handleApplyShortcut("Yapraklarda lekeler var, bakır sülfat (göztaşı) uygulama dozajı ve zamanlama rehberi üret.")}
                    className="w-full text-left p-2.5 text-xs bg-[#f7f9f6] hover:bg-[#f0f4ee] rounded-xl text-[#2d3a2a] border border-[#e2e8df] font-medium block truncate"
                  >
                    Halkalı Leke ve Bakır Sülfat Reçetesi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyShortcut("Değirmençay mikro-klima ayaz risklerine göre alınması gereken don önleme faaliyetleri planı üret.")}
                    className="w-full text-left p-2.5 text-xs bg-[#f7f9f6] hover:bg-[#f0f4ee] rounded-xl text-[#2d3a2a] border border-[#e2e8df] font-medium block truncate"
                  >
                    Don Önleme ve Acil Eylem Faaliyetleri
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyShortcut("Organik tarım markası altında şişelenmiş sızma zeytinyağı için katma değerli satış fiyatlandırması önerisi üret.")}
                    className="w-full text-left p-2.5 text-xs bg-[#f7f9f6] hover:bg-[#f0f4ee] rounded-xl text-[#2d3a2a] border border-[#e2e8df] font-medium block truncate"
                  >
                    Marka Katma Değeri & Fiyatlandırma
                  </button>
                </div>
              </div>

              <button
                id="generate-recs-btn"
                onClick={handleGenerateReport}
                disabled={generating || !selectedParcelId}
                className="w-full py-3 bg-[#556b2f] text-white font-bold rounded-2xl text-xs hover:bg-[#415324] transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-[#556b2f]/10"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Gemini Raporu Hazırlıyor...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Tavsiye Raporu Üret</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Historical recommendations list */}
          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#1a2416] flex items-center gap-1.5"><Clock className="h-4 w-4 text-[#80907a]" /> Kayıtlı Raporlar Geçmişi</h3>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {loadingHistory ? (
                <p className="text-xs text-[#5a6a55] italic animate-pulse">Geçmiş yükleniyor...</p>
              ) : history.length > 0 ? (
                history.map((rec) => (
                  <button
                    key={rec.id}
                    onClick={() => saveAndSetCurrentReport(rec)}
                    className="w-full text-left p-3 border border-[#f0f4ee] hover:border-[#556b2f]/30 rounded-2xl text-xs transition-all flex items-center justify-between group bg-[#fcfdfc]"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-bold text-[#1a2416] truncate">{rec.recommendationType} Tavsiyesi</p>
                      <p className="text-[10px] text-[#80907a] font-mono">{new Date(rec.createdDate).toLocaleDateString("tr-TR")} • Güven: %{(rec.confidenceScore * 100).toFixed(0)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#80907a] group-hover:text-[#556b2f] transition-transform group-hover:translate-x-1" />
                  </button>
                ))
              ) : (
                <p className="text-xs text-[#5a6a55] italic text-center py-4">Bu parsel için henüz bir rapor üretilmemiştir.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: RAG & Gemini Advice Display */}
        <div className="lg:col-span-2 space-y-4">
          {generating ? (
            <div className="h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-[#dee5db] rounded-3xl bg-white p-6 text-center space-y-4">
              <BrainCircuit className="h-16 w-16 text-[#556b2f] animate-pulse" />
              <div className="space-y-2">
                <h3 className="text-base font-bold text-[#1a2416] animate-pulse">Gemini Karar Analizi Başlattı...</h3>
                <p className="text-xs text-[#5a6a55] max-w-md mx-auto leading-relaxed">
                  Zeytinlik ve ağaç hafızanız taranıyor. Saha gözlem teşhisleri, regional hava sıcaklık verileri, depo ilaç/gübre stokları ve tescilli zeytin yetiştiriciliği kılavuzlarınız analiz ediliyor.
                </p>
              </div>
            </div>
          ) : currentReport ? (
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6 animate-fade-in print:border-none print:shadow-none">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f0f4ee] pb-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono bg-[#f0f4ee] text-[#556b2f] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
                    {currentReport.recommendationType} Karar Raporu
                  </span>
                  <h2 className="text-xl font-bold font-display text-[#1a2416]">Gemini Tarımsal Danışman Raporu</h2>
                  <p className="text-xs text-[#80907a] font-mono">
                    Rapor Tarihi: {new Date(currentReport.createdDate).toLocaleString("tr-TR")} • Güven Skoru: %{(currentReport.confidenceScore * 100).toFixed(0)}
                  </p>
                  {currentReport.confidenceScore <= LOW_CONFIDENCE_THRESHOLD && (
                    <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2 flex items-start gap-1.5">
                      <span>⚠️</span>
                      <span>
                        Bu raporun güven skoru düşük — kanıt (fotoğraf netliği, gözlem detayı) yetersiz olabilir. Daha net veya farklı açıdan (yakın çekim, yaprak altı) bir fotoğrafla tekrar deneyin.
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    id="print-report-btn"
                    onClick={handlePrint}
                    className="p-2.5 border border-[#e2e8df] hover:bg-[#f0f4ee] text-[#556b2f] rounded-xl transition-all"
                    title="Yazdır / Saha Çalışanına Ver"
                  >
                    <Printer className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* RAG Context metrics summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#f7f9f6] rounded-2xl border border-[#e2e8df] text-center text-xs">
                <div>
                  <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">RAG Rehber Dokümanı</span>
                  <p className="text-sm font-bold text-[#1a2416] mt-0.5">{currentReport.usedDocumentsCount} Adet</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Aktif Saha Gözlemi</span>
                  <p className="text-sm font-bold text-[#1a2416] mt-0.5">{currentReport.usedObservationsCount} Adet</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Meteroloji Kaydı</span>
                  <p className="text-sm font-bold text-[#1a2416] mt-0.5">{currentReport.usedWeatherCount} Günlük</p>
                </div>
                <div>
                  <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Depo Stok Referansı</span>
                  <p className="text-sm font-bold text-[#1a2416] mt-0.5">{currentReport.usedInventoryCount} Kalem</p>
                </div>
              </div>

              {/* Render advice markdown content */}
              <div className="markdown-body text-sm text-[#2d3a2a] leading-relaxed space-y-4 prose max-w-none">
                <ReactMarkdown>{currentReport.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#e2e8df] rounded-3xl bg-[#fcfdfc] p-6 text-center">
              <BrainCircuit className="h-12 w-12 text-[#80907a] mb-3" />
              <h2 className="text-base font-bold text-[#1a2416]">Yapay Zeka Karar Raporu Bulunmamaktadır</h2>
              <p className="text-xs text-[#5a6a55] max-w-md mx-auto mt-1">
                Soldaki panelden bir zeytinlik parseli seçerek, sormak istediğiniz konuyu yazıp &quot;Tavsiye Raporu Üret&quot; butonuna basarak Gemini tarımsal akıllı reçetelerini anlık üretebilirsiniz.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
