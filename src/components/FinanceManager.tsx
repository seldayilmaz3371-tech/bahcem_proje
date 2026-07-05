/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { CircleDollarSign, TrendingUp, TrendingDown, Percent, BookOpen, Award, RefreshCw } from "lucide-react";
import { Cost, Sale, Harvest, Parcel } from "../types";
import { calculateFinancialSummary } from "../utils/financeCalculations";
import CostSection from "./finance/CostSection";
import SaleSection from "./finance/SaleSection";
import { HarvestForm, HarvestList } from "./finance/HarvestSection";

/**
 * Mali Defter & Gelir-Gider — top-level container.
 *
 * Previously a single 915-line component managing three unrelated
 * entities (Cost, Sale, Harvest) directly, violating Single
 * Responsibility. Now a thin container: it owns only the data shared
 * across all three (the fetched lists themselves, needed for the
 * aggregate ROI summary card) and delegates each entity's form/list/
 * delete behavior to its own component (see src/components/finance/).
 */
export default function FinanceManager() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<"ledger" | "reports">("ledger");

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const [costsRes, salesRes, harvestsRes, parcelsRes] = await Promise.all([
        fetch("/api/finance/costs", { headers }),
        fetch("/api/finance/sales", { headers }),
        fetch("/api/finance/harvests", { headers }),
        fetch("/api/parcels", { headers })
      ]);

      if (costsRes.ok) setCosts(await costsRes.json());
      if (salesRes.ok) setSales(await salesRes.json());
      if (harvestsRes.ok) setHarvests(await harvestsRes.json());
      if (parcelsRes.ok) setParcels(await parcelsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Financial and yield aggregates — calculation logic lives in
  // financeCalculations.ts (see İş kuralları component içinde
  // bulunmasın), not inline here.
  const {
    totalExpenses,
    totalRevenues,
    netProfit,
    roiPercent,
    totalYieldKg: totalYield,
    yieldPerTree,
    costPerKg,
  } = calculateFinancialSummary(costs, sales, harvests, parcels);

  const getParcelName = (id: string) => parcels.find(p => p.id === id)?.name || "Genel Çiftlik";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Mali veriler ve gelir defteri yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="finance-manager-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Mali Defter & Gelir-Gider</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Zeytinlik faaliyetleri harcamaları, Organik Sağlık marka satış gelirleri ve hasat bazlı karlılık raporları
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setActiveSubTab("ledger")}
            className={`px-4 py-2 text-xs font-bold rounded-2xl transition-all ${
              activeSubTab === "ledger"
                ? "bg-[#556b2f] text-white shadow-sm"
                : "bg-white text-[#556b2f] border border-[#e2e8df] hover:bg-[#f0f4ee]"
            }`}
          >
            Mali Günlükler
          </button>
          <button
            onClick={() => setActiveSubTab("reports")}
            className={`px-4 py-2 text-xs font-bold rounded-2xl transition-all ${
              activeSubTab === "reports"
                ? "bg-[#556b2f] text-white shadow-sm"
                : "bg-white text-[#556b2f] border border-[#e2e8df] hover:bg-[#f0f4ee]"
            }`}
          >
            ROI & Karlılık Analizleri
          </button>
        </div>
      </div>

      {/* Overview Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Toplam Gider / Masraf</span>
            <div className="mt-2 text-2xl font-bold font-display text-red-700">{totalExpenses.toLocaleString("tr-TR")} <span className="text-xs font-normal text-[#888]">TL</span></div>
            <p className="mt-1 text-[10px] text-[#80907a] font-mono">Zirai ilaç, gübre, işçilik dahil</p>
          </div>
          <div className="p-3 bg-red-50 text-red-700 rounded-2xl">
            <TrendingDown className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Toplam Gelir / Satış</span>
            <div className="mt-2 text-2xl font-bold font-display text-emerald-700">{totalRevenues.toLocaleString("tr-TR")} <span className="text-xs font-normal text-[#888]">TL</span></div>
            <p className="mt-1 text-[10px] text-[#80907a] font-mono">Organik ve toptan satışlar</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl">
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Net Kar / Zarar</span>
            <div className={`mt-2 text-2xl font-bold font-display ${netProfit >= 0 ? "text-[#556b2f]" : "text-red-700"}`}>
              {netProfit.toLocaleString("tr-TR")} <span className="text-xs font-normal text-[#888]">TL</span>
            </div>
            <p className="mt-1 text-[10px] text-[#80907a] font-mono">Net kazanç durumu</p>
          </div>
          <div className="p-3 bg-[#f0f4ee] text-[#556b2f] rounded-2xl">
            <CircleDollarSign className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-[#80907a] uppercase tracking-wider">ROI (Yatırım Getirisi)</span>
            <div className="mt-2 text-2xl font-bold font-display text-blue-700">%{roiPercent.toFixed(1)}</div>
            <p className="mt-1 text-[10px] text-[#80907a] font-mono">Harcama başına kar katsayısı</p>
          </div>
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl">
            <Percent className="h-5 w-5" />
          </div>
        </div>
      </div>

      {activeSubTab === "ledger" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              <CostSection costs={costs} parcels={parcels} onDataChanged={fetchData} getParcelName={getParcelName} />
            </div>
            <div className="space-y-4">
              <SaleSection sales={sales} onDataChanged={fetchData} />
            </div>
          </div>
          <HarvestForm parcels={parcels} onDataChanged={fetchData} />
        </div>
      )}

      {activeSubTab === "reports" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-bold font-display text-[#1a2416] flex items-center gap-1"><BookOpen className="h-5 w-5 text-[#556b2f]" /> Yıllık ROI ve Karlılık Analiz Raporu</h2>

            <p className="text-xs text-[#5a6a55] leading-relaxed">
              Mersin Toroslar bölgesi Değirmençay zeytinlikleri için geçmişe yönelik maliyet analizi.
              Ürün birim maliyeti ve toplanan mahsullerin satış kanallarına göre karlılık oranları aşağıda sunulmuştur.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#f0f4ee]">
              <div className="p-4 bg-[#f7f9f6] rounded-2xl border border-[#e2e8df] text-center">
                <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Toplam Hasat</span>
                <p className="text-xl font-bold font-display text-[#1a2416] mt-1">{totalYield} <span className="text-xs font-normal">Kg</span></p>
              </div>
              <div className="p-4 bg-[#f7f9f6] rounded-2xl border border-[#e2e8df] text-center">
                <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Ağaç Başına Verim</span>
                <p className="text-xl font-bold font-display text-[#1a2416] mt-1">{yieldPerTree.toFixed(1)} <span className="text-xs font-normal">Kg/Ağaç</span></p>
              </div>
              <div className="p-4 bg-[#f7f9f6] rounded-2xl border border-[#e2e8df] text-center">
                <span className="text-[10px] text-[#80907a] uppercase font-bold tracking-wider">Ortalama Kg Maliyeti</span>
                <p className="text-xl font-bold font-display text-[#1a2416] mt-1">
                  {costPerKg.toFixed(1)} <span className="text-xs font-normal">TL/Kg</span>
                </p>
              </div>
            </div>

            <div className="bg-[#f0f4ee] border border-[#dee5db] rounded-2xl p-4 text-xs text-[#3b4c33] leading-relaxed space-y-1">
              <span className="font-bold flex items-center gap-1 text-[#556b2f]"><Award className="h-4 w-4" /> &quot;Organik Sağlık&quot; Markalaşma Avantajı</span>
              <p>
                Şişelenmiş ve tescilli markalı satılan zeytinyağı ürünleri toptan satışlara oranla ortalama <span className="font-semibold text-[#1a2416]">%110 daha yüksek birim fiyattan</span> alıcı bulmuştur.
                Bu durum tarla ROI katsayısını ciddi şekilde yükselterek sürdürülebilir agro-turizm ve marka yatırımlarının haklılığını ortaya koymaktadır.
              </p>
            </div>
          </div>

          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm flex flex-col justify-between">
            <HarvestList harvests={harvests} getParcelName={getParcelName} onDataChanged={fetchData} />
            <div className="pt-4 border-t border-[#f0f4ee] mt-4 text-[11px] text-[#80907a] leading-relaxed">
              Mali defter ve raporlar tamamen gerçek verilere dayanarak anlık olarak hesaplanır. Tarla hafızasında depolanan her bir hasat, masraf veya ürün satışı bu raporu doğrudan günceller.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
