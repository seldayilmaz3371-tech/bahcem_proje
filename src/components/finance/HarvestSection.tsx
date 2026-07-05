/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, Layers, Trash2, RefreshCw } from "lucide-react";
import { Harvest, Parcel } from "../../types";

interface HarvestFormProps {
  parcels: Parcel[];
  onDataChanged: () => void;
}

/**
 * Harvest campaign entry form ("Yeni Hasat Kampanyası Ekle") — shown in
 * the Ledger tab. Extracted from FinanceManager.tsx (see CostSection.tsx
 * for the full rationale). Exported separately from HarvestList below
 * because the original UI places the form and the resulting list in two
 * different tabs (Ledger vs. Reports) — forcing them into one component
 * would require an artificial "which tab am I in" prop, adding coupling
 * this split is meant to remove.
 */
export function HarvestForm({ parcels, onDataChanged }: HarvestFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [parcelId, setParcelId] = useState("");
  const [quantityKg, setQuantityKg] = useState("");
  const [qualityGrade, setQualityGrade] = useState("Sızmalık Elit");
  const [harvestDate, setHarvestDate] = useState(new Date().toISOString().split("T")[0]);
  const [personnelCount, setPersonnelCount] = useState("4");
  const [laborCost, setLaborCost] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [otherCosts, setOtherCosts] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAddHarvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!parcelId || !quantityKg || !harvestDate) {
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
          parcelId,
          quantityKg,
          qualityGrade,
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

      setQuantityKg("");
      setLaborCost("");
      setTransportCost("");
      setOtherCosts("");
      setShowForm(false);
      onDataChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        id="new-harvest-btn"
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#2b5a8f] bg-blue-50 hover:bg-blue-100/80 rounded-2xl border border-blue-200 transition-all"
      >
        <Plus className="h-4 w-4" />
        <span>Yeni Hasat Kampanyası Ekle</span>
      </button>

      {showForm && (
        <form onSubmit={handleAddHarvest} className="bg-[#fcfdfc] p-6 rounded-3xl border border-blue-200 space-y-4 max-w-3xl animate-slide-up">
          <h3 className="text-sm font-bold text-blue-950 flex items-center gap-1"><Layers className="h-4 w-4" /> Yeni Hasat Kampanyası</h3>
          {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Toplanan Parsel</label>
              <select
                required
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
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
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                placeholder="Örn: 1200"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Kalite Derecesi</label>
              <select
                value={qualityGrade}
                onChange={(e) => setQualityGrade(e.target.value)}
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
    </>
  );
}

interface HarvestListProps {
  harvests: Harvest[];
  getParcelName: (id: string) => string;
  onDataChanged: () => void;
}

/**
 * Harvest campaign list ("Kampanyalı Hasat Listesi") — shown in the
 * Reports tab, alongside the ROI analysis. See HarvestForm above for
 * why this is a separate export rather than a combined component.
 */
export function HarvestList({ harvests, getParcelName, onDataChanged }: HarvestListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  /**
   * Deletes a single harvest record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
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

      onDataChanged();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-md font-bold text-[#1a2416]">Kampanyalı Hasat Listesi</h2>
      {deleteError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-2.5 rounded-xl">{deleteError}</p>
      )}
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
  );
}
