/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
  TrendingUp,
  MapPin,
  CalendarRange,
  ImageOff,
  Sparkles,
  HelpCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Parcel, AIRecommendation, Photo } from "../types";

/**
 * Formats a Date object as a "YYYY-MM-DD" string suitable for <input type="date">.
 */
function toDateInputValue(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function PhotoGrowthAnalysis() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcelId, setSelectedParcelId] = useState(() => {
    return localStorage.getItem("agri_growth_parcel_id") || "";
  });

  const [startDate, setStartDate] = useState(() => {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    return toDateInputValue(threeMonthsAgo);
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [userQuery, setUserQuery] = useState("");

  const [previewPhotos, setPreviewPhotos] = useState<Photo[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ recommendation: AIRecommendation; photosUsed: Photo[] } | null>(null);

  const [history, setHistory] = useState<AIRecommendation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [error, setError] = useState("");

  const changeSelectedParcelId = (id: string) => {
    setSelectedParcelId(id);
    localStorage.setItem("agri_growth_parcel_id", id);
    setResult(null);
    setError("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchPreviewPhotos = useCallback(async () => {
    if (!selectedParcelId || !startDate || !endDate) return;
    setLoadingPreview(true);
    setError("");
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(
        `/api/parcels/${selectedParcelId}/photos-in-range?startDate=${startDate}&endDate=${endDate}`,
        { headers }
      );
      if (res.ok) {
        setPreviewPhotos(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPreview(false);
    }
  }, [selectedParcelId, startDate, endDate]);

  useEffect(() => {
    fetchPreviewPhotos();
  }, [fetchPreviewPhotos]);

  const fetchHistory = async (parcelId: string) => {
    if (!parcelId) return;
    setLoadingHistory(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/ai/recommendations/${parcelId}`, { headers });
      if (res.ok) {
        const all: AIRecommendation[] = await res.json();
        setHistory(all.filter((r) => r.recommendationType === "Gelişim Analizi"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (selectedParcelId) {
      fetchHistory(selectedParcelId);
      setResult(null);
    }
  }, [selectedParcelId]);

  const handleGenerate = async () => {
    if (!selectedParcelId) {
      setError("Öncelikle analiz etmek istediğiniz parseli seçmelisiniz.");
      return;
    }
    if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
      setError("Başlangıç tarihi, bitiş tarihinden sonra olamaz.");
      return;
    }
    if (previewPhotos.length < 2) {
      setError(`Seçilen tarih aralığında yalnızca ${previewPhotos.length} fotoğraf bulundu. Karşılaştırmalı analiz için en az 2 fotoğraf gerekiyor.`);
      return;
    }

    setGenerating(true);
    setError("");
    setResult(null);

    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/ai/growth-analysis/${selectedParcelId}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ startDate, endDate, userQuery: userQuery || undefined })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gelişim analizi oluşturulamadı.");
      }

      setResult(data);
      fetchHistory(selectedParcelId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const selectedParcel = parcels.find((p) => p.id === selectedParcelId);
  const dateFormatter = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div id="photo-growth-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight flex items-center gap-2">
          <TrendingUp className="h-7 w-7 text-[#556b2f]" />
          Fotoğraf Tabanlı Gelişim Analizi
        </h1>
        <p className="text-sm text-[#5a6a55] mt-1">
          Bir parsele ait saha fotoğraflarını seçtiğiniz tarih aralığında karşılaştırarak, yapay zeka ile görsel gelişim ve sağlık analizi üretin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Panel: Controls */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> Parsel
              </label>
              <select
                value={selectedParcelId}
                onChange={(e) => changeSelectedParcelId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              >
                {parcels.length === 0 && <option value="">Kayıtlı parsel bulunmuyor</option>}
                {parcels.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.cropType})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1 flex items-center gap-1">
                  <CalendarRange className="h-3.5 w-3.5" /> Başlangıç
                </label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Bitiş</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={toDateInputValue(new Date())}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1 flex items-center gap-1">
                <HelpCircle className="h-3.5 w-3.5" /> Odaklanılacak Konu (İsteğe Bağlı)
              </label>
              <textarea
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Örn: Yaprak renginde sararma var mı? Meyve tutumu nasıl?"
                rows={3}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f] resize-none"
              />
            </div>

            {/* Photo preview strip */}
            <div className="pt-2 border-t border-[#f0f4ee]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-[#80907a] uppercase tracking-wider">
                  Bu Aralıkta Bulunan Fotoğraflar
                </span>
                {loadingPreview && <RefreshCw className="h-3.5 w-3.5 text-[#80907a] animate-spin" />}
              </div>

              {previewPhotos.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {previewPhotos.map((photo) => (
                    <img
                      key={photo.id}
                      src={photo.originalUrl}
                      alt="Saha fotoğrafı"
                      title={dateFormatter.format(new Date(photo.takenAt || photo.createdAt))}
                      className="h-14 w-full object-cover rounded-lg border border-[#e2e8df]"
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[11px] text-[#80907a] italic py-2">
                  <ImageOff className="h-4 w-4" />
                  {loadingPreview ? "Fotoğraflar yükleniyor..." : "Bu tarih aralığında fotoğraf bulunamadı."}
                </div>
              )}
              {previewPhotos.length > 0 && (
                <p className="text-[10px] text-[#80907a] mt-1">{previewPhotos.length} fotoğraf bulundu.</p>
              )}
            </div>

            {error && (
              <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {error}
              </p>
            )}

            <button
              id="generate-growth-analysis-btn"
              onClick={handleGenerate}
              disabled={generating || previewPhotos.length < 2}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-white bg-[#556b2f] hover:bg-[#415324] disabled:bg-[#a8b6a2] disabled:cursor-not-allowed rounded-2xl transition-all shadow-sm"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Fotoğraflar Analiz Ediliyor...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Gelişim Analizi Üret</span>
                </>
              )}
            </button>
          </div>

          {/* History */}
          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-bold text-[#80907a] uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Geçmiş Analizler
            </h3>
            {loadingHistory ? (
              <p className="text-xs text-[#5a6a55] italic">Yükleniyor...</p>
            ) : history.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setResult({ recommendation: h, photosUsed: [] })}
                    className="w-full text-left p-3 rounded-xl border border-[#e2e8df] hover:border-[#556b2f]/40 transition-all flex items-center justify-between gap-2"
                  >
                    <span className="text-[11px] text-[#5a6a55]">
                      {dateFormatter.format(new Date(h.createdDate))}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[#80907a] shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#5a6a55] italic">Bu parsel için henüz gelişim analizi üretilmemiş.</p>
            )}
          </div>
        </div>

        {/* Right Panel: Result */}
        <div className="lg:col-span-2">
          {generating ? (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#e2e8df] rounded-3xl bg-[#fcfdfc] p-6 text-center">
              <RefreshCw className="h-10 w-10 text-[#556b2f] animate-spin mb-3" />
              <p className="text-sm text-[#5a6a55]">
                {previewPhotos.length} fotoğraf kronolojik sırayla inceleniyor, görsel gelişim değerlendiriliyor...
              </p>
            </div>
          ) : result ? (
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-[#f0f4ee] pb-4">
                <div>
                  <h2 className="text-lg font-bold font-display text-[#1a2416]">
                    {selectedParcel?.name || "Parsel"} — Gelişim Raporu
                  </h2>
                  <p className="text-xs text-[#5a6a55] mt-0.5">
                    {dateFormatter.format(new Date(result.recommendation.createdDate))} tarihinde üretildi
                  </p>
                </div>
              </div>

              {result.photosUsed.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {result.photosUsed.map((photo) => (
                    <div key={photo.id} className="space-y-1">
                      <img
                        src={photo.originalUrl}
                        alt="Analiz edilen fotoğraf"
                        className="h-16 w-full object-cover rounded-lg border border-[#e2e8df]"
                      />
                      <p className="text-[9px] text-[#80907a] text-center truncate">
                        {dateFormatter.format(new Date(photo.takenAt || photo.createdAt))}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="prose prose-sm prose-headings:text-[#1a2416] prose-headings:font-display max-w-none text-[#2d3a2a]">
                <ReactMarkdown>{result.recommendation.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#e2e8df] rounded-3xl bg-[#fcfdfc] p-6 text-center">
              <TrendingUp className="h-12 w-12 text-[#80907a] mb-3" />
              <h2 className="text-base font-bold text-[#1a2416]">Gelişim Analizi Bekleniyor</h2>
              <p className="text-xs text-[#5a6a55] max-w-sm mt-1">
                Soldan bir parsel ve tarih aralığı seçin. Bu aralıkta en az 2 saha fotoğrafı varsa, &quot;Gelişim Analizi Üret&quot; butonuna basarak yapay zekadan görsel karşılaştırma raporu alabilirsiniz.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}