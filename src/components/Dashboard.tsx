/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  CloudSun, 
  MapPin, 
  Trees, 
  AlertTriangle, 
  ThermometerSnowflake, 
  Calendar,
  Clock,
  ArrowRight,
  RefreshCw,
  Droplet,
  Wind,
  CloudOff,
  Camera
} from "lucide-react";
import { Parcel, WeatherRecord, ActivityLog, LiveWeatherForecast, ActiveTab, ReferenceTreeSummary } from "../types";

interface DashboardProps {
  /** Navigates to another tab — same mechanism already used by Sidebar (see App.tsx). */
  setActiveTab: (tab: ActiveTab) => void;
}

export default function Dashboard({ setActiveTab }: DashboardProps) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [referenceTreeSummary, setReferenceTreeSummary] = useState<ReferenceTreeSummary | null>(null);
  const [weatherHistory, setWeatherHistory] = useState<WeatherRecord[]>([]);
  const [recentLogs, setRecentLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Live forecast fetched from the backend's Open-Meteo integration.
  // No random or fabricated fallback: if the live API is unavailable,
  // liveForecast stays null and weatherError explains why, so the UI
  // is always honest about what it actually knows.
  const [liveForecast, setLiveForecast] = useState<LiveWeatherForecast | null>(null);
  const [weatherError, setWeatherError] = useState("");
  const [weatherLoading, setWeatherLoading] = useState(true);

  const fetchDashboardData = async (forceWeatherRefresh = false) => {
    setLoading(true);
    setWeatherLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      
      const [parcelsRes, refTreesRes, weatherRes, logsRes, liveWeatherRes] = await Promise.all([
        fetch("/api/parcels", { headers }),
        fetch("/api/reference-trees/summary", { headers }),
        fetch("/api/weather", { headers }),
        fetch("/api/activities", { headers }),
        fetch(`/api/weather/live-forecast${forceWeatherRefresh ? "?refresh=true" : ""}`, { headers })
      ]);

      if (parcelsRes.ok) setParcels(await parcelsRes.json());
      if (refTreesRes.ok) setReferenceTreeSummary(await refTreesRes.json());
      if (weatherRes.ok) setWeatherHistory(await weatherRes.json());
      if (logsRes.ok) setRecentLogs(await logsRes.json());

      if (liveWeatherRes.ok) {
        setLiveForecast(await liveWeatherRes.json());
        setWeatherError("");
      } else {
        const errorBody = await liveWeatherRes.json().catch(() => null);
        setLiveForecast(null);
        setWeatherError(errorBody?.error || "Canlı hava durumu verisi şu anda alınamıyor.");
      }
    } catch (err) {
      console.error("Dashboard metrics loading error:", err);
      setLiveForecast(null);
      setWeatherError("Hava durumu servisine bağlanırken bir bağlantı hatası oluştu.");
    } finally {
      setLoading(false);
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Compute stats
  const totalLand = parcels.reduce((sum, p) => sum + p.areaDekar, 0);
  const totalTrees = parcels.reduce((sum, p) => sum + p.treeCount, 0);
  const nextFrostRisk = liveForecast?.hasUpcomingFrostRisk ?? false;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Mersin tarım paneli yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="dashboard-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Tarla Kontrol Paneli</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Mersin Toroslar, Değirmençay mevkii güncel tarımsal durum ve faaliyet izleme ekranı
          </p>
        </div>
        <button
          id="refresh-dashboard-btn"
          onClick={() => fetchDashboardData(true)}
          className="self-start flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#556b2f] border border-[#556b2f] rounded-2xl hover:bg-[#556b2f]/5 transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Verileri Yenile</span>
        </button>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Land Size */}
        <button
          type="button"
          onClick={() => setActiveTab("parcels")}
          title="Parseller & Ağaçlar sayfasına git"
          className="text-left bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between hover:border-[#556b2f]/40 hover:shadow-md transition-all cursor-pointer"
        >
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Toplam Arazi Büyüklüğü</span>
            <div className="mt-2 text-3xl font-bold font-display text-[#1a2416]">{totalLand.toFixed(1)} <span className="text-sm font-normal text-[#5a6a55]">Dekar</span></div>
            <p className="mt-2 text-xs text-[#5a6a55] flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 text-[#556b2f]" />
              {parcels.length} adet kayıtlı zeytinlik parseli
            </p>
          </div>
          <div className="p-3 bg-[#f0f4ee] text-[#556b2f] rounded-2xl">
            <MapPin className="h-6 w-6" />
          </div>
        </button>

        {/* Total Trees */}
        <button
          type="button"
          onClick={() => setActiveTab("parcels")}
          title="Parseller & Ağaçlar sayfasına git"
          className="text-left bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between hover:border-[#556b2f]/40 hover:shadow-md transition-all cursor-pointer"
        >
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Takipteki Zeytin Ağacı</span>
            <div className="mt-2 text-3xl font-bold font-display text-[#1a2416]">{totalTrees} <span className="text-sm font-normal text-[#5a6a55]">Adet</span></div>
            <p className="mt-2 text-xs text-[#5a6a55]">
              Ortalama ağaç yaşı: <span className="font-semibold text-[#1a2416]">11 Yıl</span> (Mersin Yerel)
            </p>
          </div>
          <div className="p-3 bg-[#f0f4ee] text-[#556b2f] rounded-2xl">
            <Trees className="h-6 w-6" />
          </div>
        </button>

        {/* Reference Tree Photos */}
        <button
          type="button"
          onClick={() => setActiveTab("parcels")}
          title="Parseller & Ağaçlar sayfasına git"
          className={`text-left p-6 rounded-3xl border shadow-sm flex items-start justify-between hover:shadow-md transition-all cursor-pointer ${
            referenceTreeSummary && referenceTreeSummary.treesWithoutPhoto > 0
              ? "bg-amber-50/50 border-amber-200 text-amber-900 hover:border-amber-400"
              : "bg-[#fcfdfc] border-[#e2e8df] text-[#1a2416] hover:border-[#556b2f]/40"
          }`}
        >
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${referenceTreeSummary && referenceTreeSummary.treesWithoutPhoto > 0 ? "text-amber-800" : "text-[#80907a]"}`}>Referans Ağaç Fotoğrafları</span>
            <div className="mt-2 text-3xl font-bold font-display">{referenceTreeSummary?.totalReferenceTrees ?? 0} <span className="text-sm font-normal">Ağaç</span></div>
            <p className="mt-2 text-xs text-[#5a6a55] truncate max-w-[180px]">
              {!referenceTreeSummary || referenceTreeSummary.totalReferenceTrees === 0
                ? "Henüz referans ağaç işaretlenmedi"
                : referenceTreeSummary.treesWithoutPhoto > 0
                ? `${referenceTreeSummary.treesWithoutPhoto} ağacın fotoğrafı eksik`
                : "Tüm referans ağaçlar fotoğraflanmış"}
            </p>
          </div>
          <div className={`p-3 rounded-2xl ${referenceTreeSummary && referenceTreeSummary.treesWithoutPhoto > 0 ? "bg-amber-100 text-amber-700" : "bg-[#f0f4ee] text-[#556b2f]"}`}>
            <Camera className="h-6 w-6" />
          </div>
        </button>

        {/* Frost Warning Card */}
        <button
          type="button"
          onClick={() => setActiveTab("ai-advisor")}
          title="Yapay Zeka Karar Destek sayfasına git"
          className={`text-left p-6 rounded-3xl border shadow-sm flex items-start justify-between hover:shadow-md transition-all cursor-pointer ${
            weatherError
              ? "bg-stone-50 border-stone-200 hover:border-stone-400"
              : nextFrostRisk 
              ? "bg-red-50/50 border-red-200 text-red-900 hover:border-red-400" 
              : "bg-[#fcfdfc] border-[#e2e8df] hover:border-[#556b2f]/40"
          }`}
        >
          <div>
            <span className={`text-xs font-bold uppercase tracking-wider ${weatherError ? "text-stone-500" : nextFrostRisk ? "text-red-800" : "text-[#80907a]"}`}>Don Riski / Ayaz Seviyesi</span>
            <div className="mt-2 text-3xl font-bold font-display">
              {weatherError ? "BİLİNMİYOR" : nextFrostRisk ? "VAR" : "YOK"}
            </div>
            <p className="mt-2 text-xs text-[#5a6a55]">
              {weatherError
                ? "Canlı veri alınamadığı için değerlendirilemiyor"
                : nextFrostRisk ? "Değirmençay'da gece don riski yüksek!" : "Sıcaklıklar zeytin ağaçları için elverişli"}
            </p>
          </div>
          <div className={`p-3 rounded-2xl ${weatherError ? "bg-stone-100 text-stone-500" : nextFrostRisk ? "bg-red-100 text-red-700 animate-pulse" : "bg-[#f0f4ee] text-[#556b2f]"}`}>
            <ThermometerSnowflake className="h-6 w-6" />
          </div>
        </button>
      </div>

      {/* Main Content Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Değirmençay Climate and Weather forecast */}
        <div className="lg:col-span-2 bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <CloudSun className="h-5 w-5 text-[#556b2f]" />
              <h2 className="text-lg font-bold font-display text-[#1a2416]">Bölgesel Mikro-Klima Meteoroloji Paneli</h2>
            </div>
            <span className="text-xs bg-[#f0f4ee] text-[#556b2f] px-2.5 py-1 rounded-full font-semibold font-mono">
              {liveForecast?.locationName || "Değirmençay, Mersin"}
            </span>
          </div>

          {/* Explicit data source attribution, so it's always clear this is real, live, external data */}
          {liveForecast && !weatherError && (
            <p className="text-[10px] text-[#80907a] font-mono -mt-4">
              Kaynak: {liveForecast.source} · Son güncelleme: {new Date(liveForecast.fetchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}

          {weatherLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <RefreshCw className="h-6 w-6 text-[#556b2f] animate-spin" />
              <span className="text-xs text-[#5a6a55]">Canlı hava durumu alınıyor...</span>
            </div>
          ) : weatherError ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center bg-stone-50 border border-stone-200 rounded-2xl">
              <CloudOff className="h-8 w-8 text-stone-400" />
              <p className="text-xs font-semibold text-stone-600 max-w-sm">{weatherError}</p>
              <button
                onClick={() => fetchDashboardData(true)}
                className="mt-2 text-xs font-bold text-[#556b2f] underline hover:no-underline"
              >
                Tekrar Dene
              </button>
            </div>
          ) : (
            <>
              {liveForecast?.current && (
                <div className="flex items-center gap-4 p-4 bg-[#f7f9f6] rounded-2xl border border-[#e2e8df]">
                  <span className="text-3xl font-bold font-display text-[#1a2416]">{liveForecast.current.temperatureCelsius}°</span>
                  <div className="text-xs text-[#5a6a55] space-y-0.5">
                    <p className="font-bold text-[#1a2416]">{liveForecast.current.condition} (Şu An)</p>
                    <p className="flex items-center gap-2">
                      <span className="flex items-center gap-0.5"><Droplet className="h-3 w-3" /> %{liveForecast.current.humidityPercent ?? "-"}</span>
                      <span className="flex items-center gap-0.5"><Wind className="h-3 w-3" /> {liveForecast.current.windSpeedKmh}km/h</span>
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {liveForecast?.daily.map((day, idx) => (
                  <div 
                    id={`weather-day-${idx}`}
                    key={day.date} 
                    className={`p-4 rounded-2xl border flex flex-col justify-between items-center text-center transition-all ${
                      day.hasFrostRisk 
                        ? "bg-red-50/40 border-red-200 text-red-900" 
                        : "bg-[#fcfdfc] border-[#e2e8df] hover:border-[#556b2f]/30"
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-[#5a6a55]">{day.dateLabel}</p>
                      <p className="text-xs font-bold text-[#222] font-mono mt-1">{day.condition}</p>
                    </div>

                    <div className="my-3">
                      <span className="text-2xl font-bold font-display">{day.tempMax}°</span>
                      <span className="text-sm text-[#888] mx-1">/</span>
                      <span className="text-sm font-semibold text-[#556b2f]">{day.tempMin}°</span>
                    </div>

                    <div className="w-full pt-2 border-t border-[#f0f4ee] flex justify-around text-[10px] text-[#80907a] font-mono">
                      <span className="flex items-center gap-0.5"><Droplet className="h-3 w-3" /> %{day.humidityPercent ?? "-"}</span>
                      <span className="flex items-center gap-0.5"><Wind className="h-3 w-3" /> {day.windSpeedMaxKmh}km/h</span>
                    </div>

                    {day.hasFrostRisk && (
                      <span className="mt-2 text-[9px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                        <ThermometerSnowflake className="h-3 w-3" /> Gece Ayazı
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {nextFrostRisk && (
                <div className="bg-[#f0f4ee] border border-[#dee5db] rounded-2xl p-4 text-xs text-[#3b4c33] leading-relaxed flex items-start gap-2.5">
                  <AlertTriangle className="h-5 w-5 text-[#556b2f] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Mersin AgriTech Tavsiyesi:</span> Don Riski mevcuttur. Sol menüdeki <span className="font-semibold">Yapay Zeka Karar Destek</span> ekranına giderek parselleriniz için don önleme faaliyetlerini (yağmurlama sulama zamanlamaları, saman dumanı vb.) sorgulayıp bölgesel reçete talep edebilirsiniz.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Audit Logs and Activities */}
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-[#556b2f]" />
              <h2 className="text-lg font-bold font-display text-[#1a2416]">Son Çiftlik Faaliyetleri</h2>
            </div>

            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {recentLogs.length > 0 ? (
                recentLogs.slice(0, 6).map((log) => (
                  <div id={`activity-log-${log.id}`} key={log.id} className="text-xs border-b border-[#f0f4ee] pb-3 last:border-b-0 space-y-1">
                    <div className="flex justify-between text-[#80907a]">
                      <span className="font-bold font-mono tracking-wider">{log.action}</span>
                      <span className="font-mono">{new Date(log.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-[#2d3a2a] leading-relaxed font-medium">{log.details}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#5a6a55] italic text-center py-8">Kayıtlı sistem faaliyeti bulunmamaktadır.</p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#f0f4ee] mt-4">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#80907a] block mb-1">Mersin Yerel Merkez</span>
            <p className="text-xs text-[#5a6a55] font-semibold flex items-center gap-1">
              Enlem: <span className="font-mono text-[#1a2416]">36.912°N</span> | Boylam: <span className="font-mono text-[#1a2416]">34.423°E</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
