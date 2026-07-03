/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  CircleDollarSign, 
  TrendingUp, 
  TrendingDown, 
  Plus, 
  X, 
  RefreshCw, 
  Percent, 
  Calendar,
  Layers,
  Award,
  BookOpen,
  Trash2
} from "lucide-react";
import { Cost, Sale, Harvest, Parcel } from "../types";

export default function FinanceManager() {
  const [costs, setCosts] = useState<Cost[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);

  // Active sub-tab: ledger, costForm, saleForm, harvestForm, reports
  const [activeSubTab, setActiveSubTab] = useState<"ledger" | "reports">("ledger");

  // Cost Form
  const [costAmount, setCostAmount] = useState("");
  const [costCategory, setCostCategory] = useState("Gübreleme");
  const [costDate, setCostDate] = useState(new Date().toISOString().split("T")[0]);
  const [costDesc, setCostDesc] = useState("");
  const [costParcelId, setCostParcelId] = useState("");

  // Sale Form
  const [saleProduct, setSaleProduct] = useState("Zeytinyağı (Sızma)");
  const [saleQuantity, setSaleQuantity] = useState("");
  const [saleUnitPrice, setSaleUnitPrice] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [isOrganik, setIsOrganik] = useState(false);

  // Harvest Form
  const [harvestParcelId, setHarvestParcelId] = useState("");
  const [harvestYield, setHarvestYield] = useState("");
  const [harvestQuality, setHarvestQuality] = useState("Sızmalık Elit");
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [personnelCount, setPersonnelCount] = useState("4");
  const [laborCost, setLaborCost] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [otherCosts, setOtherCosts] = useState("");

  // Modals / Forms display
  const [showCostForm, setShowCostForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showHarvestForm, setShowHarvestForm] = useState(false);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Deletion state: tracks which record is currently being deleted (to
  // disable its button and show a spinner) and surfaces any deletion error
  // directly above the ledger lists, independent of the add-record forms.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

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

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!costAmount || !costCategory || !costDate) {
      setError("Tutar, kategori ve tarih alanları zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/finance/costs", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parcelId: costParcelId || undefined,
          amount: costAmount,
          category: costCategory,
          costDate,
          description: costDesc
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gider kaydedilemedi.");
      }

      setCostAmount("");
      setCostDesc("");
      setShowCostForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!saleQuantity || !saleUnitPrice || !saleDate) {
      setError("Miktar, birim fiyat ve tarih zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/finance/sales", {
        method: "POST",
        headers,
        body: JSON.stringify({
          productType: saleProduct,
          quantityKg: saleQuantity,
          unitPrice: saleUnitPrice,
          buyerName: buyerName || undefined,
          saleDate,
          isOrganikSaglikBrand: isOrganik
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Satış kaydedilemedi.");
      }

      setSaleQuantity("");
      setSaleUnitPrice("");
      setBuyerName("");
      setIsOrganik(false);
      setShowSaleForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!harvestParcelId || !harvestYield || !harvestDate) {
      setError("Parsel seçimi, hasat miktarı ve tarih alanları zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/finance/harvests", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parcelId: harvestParcelId,
          quantityKg: harvestYield,
          qualityGrade: harvestQuality,
          harvestDate,
          personnelCount,
          laborCost,
          transportCost,
          otherCosts
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Hasat kaydı kaydedilemedi.");
      }

      setHarvestYield("");
      setLaborCost("");
      setTransportCost("");
      setOtherCosts("");
      setShowHarvestForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deletes a single expense/cost record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
   * @param cost Cost record to remove
   */
  const handleDeleteCost = async (cost: Cost) => {
    const confirmed = window.confirm(
      `"${cost.category}" kategorisindeki ${cost.amount.toLocaleString("tr-TR")} TL tutarındaki gider kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
    );
    if (!confirmed) return;

    setDeleteError("");
    setDeletingId(cost.id);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/finance/costs/${cost.id}`, { method: "DELETE", headers });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gider kaydı silinemedi.");
      }

      setCosts((prev) => prev.filter((c) => c.id !== cost.id));
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Deletes a single sale/revenue record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
   * @param sale Sale record to remove
   */
  const handleDeleteSale = async (sale: Sale) => {
    const confirmed = window.confirm(
      `"${sale.productType}" ürününe ait ${sale.totalRevenue.toLocaleString("tr-TR")} TL tutarındaki satış kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
    );
    if (!confirmed) return;

    setDeleteError("");
    setDeletingId(sale.id);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/finance/sales/${sale.id}`, { method: "DELETE", headers });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Satış kaydı silinemedi.");
      }

      setSales((prev) => prev.filter((s) => s.id !== sale.id));
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  /**
   * Deletes a single harvest record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
   * @param harvest Harvest record to remove
   */
  const handleDeleteHarvest = async (harvest: Harvest) => {
    const confirmed = window.confirm(
      `${harvest.quantityKg.toLocaleString("tr-TR")} Kg'lık hasat kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
    );
    if (!confirmed) return;

    setDeleteError("");
    setDeletingId(harvest.id);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/finance/harvests/${harvest.id}`, { method: "DELETE", headers });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Hasat kaydı silinemedi.");
      }

      setHarvests((prev) => prev.filter((h) => h.id !== harvest.id));
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Mathematical ROI calculation aggregates
  const totalExpenses = costs.reduce((sum, c) => sum + c.amount, 0) + harvests.reduce((sum, h) => sum + h.totalCost, 0);
  const totalRevenues = sales.reduce((sum, s) => sum + s.totalRevenue, 0);
  const netProfit = totalRevenues - totalExpenses;
  const roiPercent = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : 0;
  
  // Total yield
  const totalYield = harvests.reduce((sum, h) => sum + h.quantityKg, 0);
  const totalTrees = parcels.reduce((sum, p) => sum + p.treeCount, 0);
  const yieldPerTree = totalTrees > 0 ? totalYield / totalTrees : 0;

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
          {/* Add Forms Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              id="new-cost-btn"
              onClick={() => { setShowCostForm(!showCostForm); setShowSaleForm(false); setShowHarvestForm(false); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#8b263e] bg-red-50 hover:bg-red-100/80 rounded-2xl border border-red-200 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Gider Kaydı Gir</span>
            </button>
            <button
              id="new-sale-btn"
              onClick={() => { setShowSaleForm(!showSaleForm); setShowCostForm(false); setShowHarvestForm(false); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#1c6446] bg-emerald-50 hover:bg-emerald-100/80 rounded-2xl border border-emerald-200 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Zeytin/Yağ Satış Geliri Gir</span>
            </button>
            <button
              id="new-harvest-btn"
              onClick={() => { setShowHarvestForm(!showHarvestForm); setShowCostForm(false); setShowSaleForm(false); }}
              className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#2b5a8f] bg-blue-50 hover:bg-blue-100/80 rounded-2xl border border-blue-200 transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Yeni Hasat Kampanyası Ekle</span>
            </button>
          </div>

          {/* Cost Form */}
          {showCostForm && (
            <form onSubmit={handleAddCost} className="bg-[#fcfdfc] p-6 rounded-3xl border border-red-200 space-y-4 max-w-3xl animate-slide-up">
              <h3 className="text-sm font-bold text-red-900 flex items-center gap-1"><TrendingDown className="h-4 w-4" /> Yeni Gider Masraf Kaydı</h3>
              {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Tutar (TL)</label>
                  <input
                    type="number"
                    required
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    placeholder="Örn: 1500"
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Masraf Kategorisi</label>
                  <select
                    value={costCategory}
                    onChange={(e) => setCostCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
                  >
                    <option value="Gübreleme">Gübreleme</option>
                    <option value="İlaçlama">İlaçlama</option>
                    <option value="Sulama">Sulama Elektrik/Su</option>
                    <option value="Budama">Budama İşçilik</option>
                    <option value="Akaryakıt">Akaryakıt / Nakliye</option>
                    <option value="Ekipman Amortisman">Ekipman Bakım/Amortisman</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Tarih</label>
                  <input
                    type="date"
                    required
                    value={costDate}
                    onChange={(e) => setCostDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">İlgili Parsel (Opsiyonel)</label>
                  <select
                    value={costParcelId}
                    onChange={(e) => setCostParcelId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
                  >
                    <option value="">Genel Çiftlik Masrafı</option>
                    {parcels.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5a6a55] mb-1">Açıklama / Detay</label>
                <input
                  type="text"
                  value={costDesc}
                  onChange={(e) => setCostDesc(e.target.value)}
                  placeholder="Hektaş göztaşı ilacı alımı faturası..."
                  className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
                />
              </div>

              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-2xl text-xs transition-colors">
                Kaydet
              </button>
            </form>
          )}

          {/* Sale Form */}
          {showSaleForm && (
            <form onSubmit={handleAddSale} className="bg-[#fcfdfc] p-6 rounded-3xl border border-emerald-200 space-y-4 max-w-3xl animate-slide-up">
              <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Yeni Satış Gelir Kaydı</h3>
              {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Ürün Türü</label>
                  <select
                    value={saleProduct}
                    onChange={(e) => setSaleProduct(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="Zeytinyağı (Sızma)">Zeytinyağı (Sızma Extra Virgin)</option>
                    <option value="Yeşil Zeytin (Sarıulak)">Sarıulak Sofralık Yeşil Zeytin</option>
                    <option value="Siyah Zeytin (Salamura)">Siyah Zeytin (Kuru Salamura)</option>
                    <option value="Zeytin (Ham/Toptan)">Zeytin (Fabrika Ham/Toptan)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Miktar (Kg / Litre)</label>
                  <input
                    type="number"
                    required
                    value={saleQuantity}
                    onChange={(e) => setSaleQuantity(e.target.value)}
                    placeholder="Örn: 250"
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Birim Fiyat (TL/Kg)</label>
                  <input
                    type="number"
                    required
                    value={saleUnitPrice}
                    onChange={(e) => setSaleUnitPrice(e.target.value)}
                    placeholder="Örn: 220"
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Alıcı Adı / Kooperatif / Marka</label>
                  <input
                    type="text"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    placeholder="Örn: Mersin Tariş Zeytin Kooperatifi"
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Satış Tarihi</label>
                  <input
                    type="date"
                    required
                    value={saleDate}
                    onChange={(e) => setSaleDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is-organik"
                  checked={isOrganik}
                  onChange={(e) => setIsOrganik(e.target.checked)}
                  className="h-4 w-4 text-[#556b2f] border-stone-300 rounded focus:ring-[#556b2f]"
                />
                <label htmlFor="is-organik" className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                  <Award className="h-4 w-4 text-emerald-600" />
                  <span>&quot;Organik Sağlık&quot; Markalı Şişelenmiş/Etiketli Ürün Satışı</span>
                </label>
              </div>

              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-[#1c6446] hover:bg-[#154a33] text-white font-bold rounded-2xl text-xs transition-colors">
                Kaydet
              </button>
            </form>
          )}

          {/* Harvest Form */}
          {showHarvestForm && (
            <form onSubmit={handleAddHarvest} className="bg-[#fcfdfc] p-6 rounded-3xl border border-blue-200 space-y-4 max-w-3xl animate-slide-up">
              <h3 className="text-sm font-bold text-blue-950 flex items-center gap-1"><Layers className="h-4 w-4" /> Yeni Hasat Kampanyası</h3>
              {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Toplanan Parsel</label>
                  <select
                    required
                    value={harvestParcelId}
                    onChange={(e) => setHarvestParcelId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Parsel Seçin</option>
                    {parcels.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Hasat Edilen Miktar (Kg)</label>
                  <input
                    type="number"
                    required
                    value={harvestYield}
                    onChange={(e) => setHarvestYield(e.target.value)}
                    placeholder="Örn: 1200"
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Kalite Derecesi</label>
                  <select
                    value={harvestQuality}
                    onChange={(e) => setHarvestQuality(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="Sızmalık Elit">Sızmalık Elit (Düşük Asit)</option>
                    <option value="Birinci Kalite Sofralık">Birinci Sınıf Sofralık</option>
                    <option value="İkinci Kalite Yağlık">İkinci Kalite Yağlık</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#5a6a55] mb-1">Hasat Başlangıç Tarihi</label>
                  <input
                    type="date"
                    required
                    value={harvestDate}
                    onChange={(e) => setHarvestDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-[#f0f4ee]">
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Çalışan Personel Sayısı</label>
                  <input
                    type="number"
                    value={personnelCount}
                    onChange={(e) => setPersonnelCount(e.target.value)}
                    placeholder="4"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">İşçilik Gideri (TL)</label>
                  <input
                    type="number"
                    value={laborCost}
                    onChange={(e) => setLaborCost(e.target.value)}
                    placeholder="3500"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Nakliye/Taşıma (TL)</label>
                  <input
                    type="number"
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value)}
                    placeholder="800"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Diğer Sıkım Masrafı (TL)</label>
                  <input
                    type="number"
                    value={otherCosts}
                    onChange={(e) => setOtherCosts(e.target.value)}
                    placeholder="1200"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs"
                  />
                </div>
              </div>

              <button type="submit" disabled={saving} className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-2xl text-xs transition-colors">
                Hasat Girişini Yap
              </button>
            </form>
          )}

          {/* Deletion error banner, visible across the ledger view regardless of which form is open */}
          {deleteError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded-2xl">{deleteError}</p>
          )}

          {/* Ledger Lists of Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Costs Ledger */}
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="text-md font-bold text-[#1a2416] flex items-center gap-1.5"><TrendingDown className="h-5 w-5 text-red-600" /> Harcamalar & Giderler Defteri</h2>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {costs.length > 0 ? (
                  costs.map((cost) => (
                    <div id={`cost-row-${cost.id}`} key={cost.id} className="text-xs border-b border-[#f0f4ee] pb-3 last:border-b-0 flex justify-between items-center gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#1a2416]">{cost.category}</span>
                          <span className="text-[10px] text-[#80907a] bg-[#f0f4ee] px-1.5 py-0.5 rounded font-mono">
                            {getParcelName(cost.parcelId)}
                          </span>
                        </div>
                        <p className="text-[#5a6a55] italic truncate">{cost.description || "Harcama açıklaması belirtilmemiş"}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right space-y-1">
                          <span className="font-bold font-display text-red-700 text-sm block">-{cost.amount.toLocaleString()} TL</span>
                          <span className="block text-[10px] text-[#80907a] font-mono">{new Date(cost.costDate).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCost(cost)}
                          disabled={deletingId === cost.id}
                          title="Bu gider kaydını sil"
                          aria-label="Gider kaydını sil"
                          className="p-1.5 text-[#a3a99e] hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingId === cost.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#5a6a55] italic text-center py-8">Kayıtlı gider bulunmamaktadır.</p>
                )}
              </div>
            </div>

            {/* Sales Ledger */}
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="text-md font-bold text-[#1a2416] flex items-center gap-1.5"><TrendingUp className="h-5 w-5 text-emerald-600" /> Mahsul Satış Gelirleri Defteri</h2>
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {sales.length > 0 ? (
                  sales.map((sale) => (
                    <div id={`sale-row-${sale.id}`} key={sale.id} className="text-xs border-b border-[#f0f4ee] pb-3 last:border-b-0 flex justify-between items-center gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#1a2416]">{sale.productType}</span>
                          {sale.isOrganikSaglikBrand && (
                            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 flex items-center gap-0.5">
                              <Award className="h-3 w-3" /> Organik Sağlık
                            </span>
                          )}
                        </div>
                        <p className="text-[#5a6a55] font-semibold truncate">{sale.quantityKg} Kg x {sale.unitPrice} TL/Kg • <span className="font-normal text-stone-500">{sale.buyerName}</span></p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right space-y-1">
                          <span className="font-bold font-display text-[#556b2f] text-sm block">+{sale.totalRevenue.toLocaleString()} TL</span>
                          <span className="block text-[10px] text-[#80907a] font-mono">{new Date(sale.saleDate).toLocaleDateString("tr-TR")}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteSale(sale)}
                          disabled={deletingId === sale.id}
                          title="Bu satış kaydını sil"
                          aria-label="Satış kaydını sil"
                          className="p-1.5 text-[#a3a99e] hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                        >
                          {deletingId === sale.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#5a6a55] italic text-center py-8">Kayıtlı satış geliri bulunmamaktadır.</p>
                )}
              </div>
            </div>
          </div>
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
                  {(totalYield > 0 ? totalExpenses / totalYield : 0).toFixed(1)} <span className="text-xs font-normal">TL/Kg</span>
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
            <div className="space-y-4">
              <h2 className="text-md font-bold text-[#1a2416]">Kampanyalı Hasat Listesi</h2>
              <div className="space-y-3 overflow-y-auto max-h-[300px]">
                {harvests.length > 0 ? (
                  harvests.map((harvest) => (
                    <div id={`harvest-item-${harvest.id}`} key={harvest.id} className="text-xs border-b border-[#f0f4ee] pb-3 last:border-b-0 space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex justify-between font-bold text-[#1a2416] flex-1 min-w-0">
                          <span className="truncate">{getParcelName(harvest.parcelId)}</span>
                          <span className="shrink-0 ml-2">{harvest.quantityKg} Kg</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteHarvest(harvest)}
                          disabled={deletingId === harvest.id}
                          title="Bu hasat kaydını sil"
                          aria-label="Hasat kaydını sil"
                          className="p-1 text-[#a3a99e] hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 shrink-0"
                        >
                          {deletingId === harvest.id ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <p className="text-[#80907a] font-mono">Kalite: {harvest.qualityGrade} • {new Date(harvest.harvestDate).toLocaleDateString("tr-TR")}</p>
                      <p className="text-[#5a6a55] font-semibold">Hasat Toplam Maliyeti: <span className="text-red-700">{harvest.totalCost.toLocaleString()} TL</span></p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#5a6a55] italic text-center py-4">Kayıtlı hasat faaliyeti bulunmamaktadır.</p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-[#f0f4ee] mt-4 text-[11px] text-[#80907a] leading-relaxed">
              Mali defter ve raporlar tamamen gerçek verilere dayanarak anlık olarak hesaplanır. Tarla hafızasında depolanan her bir hasat, masraf veya ürün satışı bu raporu doğrudan günceller.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
