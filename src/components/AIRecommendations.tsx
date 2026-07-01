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
  Download
} from "lucide-react";
import { Parcel, AIRecommendation } from "../types";

export default function AIRecommendations() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState("");
  const [userQuery, setUserQuery] = useState("");
  
  const [generating, setGenerating] = useState(false);
  const [currentReport, setCurrentReport] = useState<AIRecommendation | null>(null);
  
  const [history, setHistory] = useState<AIRecommendation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [error, setError] = useState("");

  const fetchParcels = async () => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/parcels", { headers });
      if (res.ok) {
        const data = await res.json();
        setParcels(data);
        if (data.length > 0) {
          setSelectedParcelId(data[0].id);
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
    fetchParcelHistory(selectedParcelId);
    setCurrentReport(null);
  }, [selectedParcelId]);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParcelId) {
      setError("Öncelikle tavsiye almak istediğiniz zeytinlik parselini seçmelisiniz.");
      return;
    }

    setError("");
    setGenerating(true);
    setCurrentReport(null);

    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch(`/api/ai/recommend/${selectedParcelId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          userQuery: userQuery || "Mevcut tarla gözlemleri, hava durumu ve stok envanter seviyelerine göre genel tarımsal durum analizi ve gelecek haftalık faaliyet reçetesi üret."
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Yapay zeka tavsiye raporu oluşturulamadı.");
      }

      setCurrentReport(data);
      setUserQuery("");
      fetchParcelHistory(selectedParcelId); // Refresh history feed
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
                  onChange={(e) => setSelectedParcelId(e.target.value)}
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
                    onClick={() => setCurrentReport(rec)}
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
