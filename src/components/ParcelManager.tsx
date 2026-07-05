/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Plus, MapPin, Trash2, X, Folder, ChevronRight } from "lucide-react";
import { Parcel, Tree, CropType, TreeCountChangeLog, ParcelHealthSummary } from "../types";
import TreeCountManager from "./parcels/TreeCountManager";
import TreeManager from "./parcels/TreeManager";

/**
 * Parseller & Ürün Takipleri — top-level container.
 *
 * Previously a single ~980-line component managing three distinct
 * concerns directly (Parcel CRUD, manual tree-count change tracking, and
 * full individual tree management including Reference Trees and quick
 * photo upload), violating Single Responsibility. Now a thin container:
 * it owns only parcel-level data (the list, the selected parcel, the add
 * form) and delegates the count-change workflow and tree management to
 * their own components (see src/components/parcels/).
 */
export default function ParcelManager() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  const [showParcelForm, setShowParcelForm] = useState(false);
  const [parcelName, setParcelName] = useState("");
  const [parcelArea, setParcelArea] = useState("");
  const [parcelTreeCount, setParcelTreeCount] = useState("");
  const [cropType, setCropType] = useState<CropType>("Zeytin");
  const [soilType, setSoilType] = useState("Killi-Tınlı");
  const [irrigationType, setIrrigationType] = useState("Damlama");
  const [error, setError] = useState("");

  const [treeCountChanges, setTreeCountChanges] = useState<TreeCountChangeLog[]>([]);
  const [healthSummary, setHealthSummary] = useState<ParcelHealthSummary | null>(null);

  /**
   * Human-readable label for the currently selected parcel's plant unit.
   * Olive parcels track "Ağaç" (trees); vegetable/fruit parcels track "Bitki" (plants).
   */
  const plantLabel = selectedParcel?.cropType === "Zeytin" ? "Ağaç" : "Bitki";

  const fetchParcels = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch("/api/parcels", { headers });
      if (res.ok) {
        setParcels(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrees = async (parcelId: string) => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/parcels/${parcelId}/trees`, { headers });
      if (res.ok) {
        setTrees(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTreeCountChanges = async (parcelId: string) => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/parcels/${parcelId}/tree-count-changes`, { headers });
      if (res.ok) {
        setTreeCountChanges(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHealthSummary = async (parcelId: string) => {
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/parcels/${parcelId}/reference-tree-health`, { headers });
      if (res.ok) {
        setHealthSummary(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchParcels();
  }, []);

  const handleSelectParcel = (parcel: Parcel) => {
    setSelectedParcel(parcel);
    fetchTrees(parcel.id);
    fetchTreeCountChanges(parcel.id);
    fetchHealthSummary(parcel.id);
  };

  const handleAddParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!parcelName || !parcelArea) {
      setError("Parsel adı ve büyüklük bilgisi zorunludur.");
      return;
    }

    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch("/api/parcels", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: parcelName, areaDekar: parcelArea, cropType, treeCount: parcelTreeCount, soilType, irrigationType })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Parsel kaydedilemedi.");
      }

      setParcelName("");
      setParcelArea("");
      setParcelTreeCount("");
      setCropType("Zeytin");
      setShowParcelForm(false);
      fetchParcels();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteParcel = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Bu parseli ve buna bağlı tüm ağaç kayıtlarını silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/parcels/${id}`, { method: "DELETE", headers });

      if (res.ok) {
        if (selectedParcel?.id === id) {
          setSelectedParcel(null);
          setTrees([]);
        }
        fetchParcels();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div id="parcel-manager-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Parseller & Ürün Takipleri</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Zeytin, sebze ve meyve parsellerinizi yönetin; ağaç ve bitkilerinizi tek tek kaydedip takip edin.
          </p>
        </div>
        <button
          id="add-parcel-btn"
          onClick={() => setShowParcelForm(!showParcelForm)}
          className="self-start flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
        >
          {showParcelForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showParcelForm ? "Vazgeç" : "Yeni Parsel Ekle"}</span>
        </button>
      </div>

      {showParcelForm && (
        <form onSubmit={handleAddParcel} className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] space-y-4 max-w-2xl animate-slide-up">
          <h2 className="text-md font-bold text-[#1a2416]">Yeni Arazi Parseli Tanımla</h2>

          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Parsel Adı</label>
              <input
                type="text"
                value={parcelName}
                onChange={(e) => setParcelName(e.target.value)}
                placeholder="Örn: Değirmençay Merkez Zeytinlik"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Ürün Türü</label>
              <select
                value={cropType}
                onChange={(e) => setCropType(e.target.value as CropType)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="Zeytin">Zeytin</option>
                <option value="Sebze">Sebze</option>
                <option value="Meyve">Meyve</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Alan (Dekar)</label>
              <input
                type="number"
                step="0.1"
                value={parcelArea}
                onChange={(e) => setParcelArea(e.target.value)}
                placeholder="Örn: 8.5"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Ağaç/Bitki Sayısı (Tahmini)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={parcelTreeCount}
                onChange={(e) => setParcelTreeCount(e.target.value)}
                placeholder="Örn: 50"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Toprak Yapısı</label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="Killi-Tınlı">Killi-Tınlı (Mersin Standart)</option>
                <option value="Kireçli">Kireçli / Taşlı</option>
                <option value="Tınlı">Kırmızı Toprak / Tınlı</option>
                <option value="Kumlu">Kumlu-Tınlı</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Sulama Yöntemi</label>
              <select
                value={irrigationType}
                onChange={(e) => setIrrigationType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="Damlama">Modern Damlama Sistemi</option>
                <option value="Yağmurlama">Yağmurlama</option>
                <option value="Kuru">Kuru Tarım (Sadece Yağmur)</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-[#80907a] italic -mt-1">
            Not: Ağaç/bitki sayısı burada tahmini olarak girilebilir. &quot;Yeni {plantLabel} Tanımla&quot; ile tekil kayıt eklemeye başladığınızda bu sayı otomatik olarak gerçek kayıt adedine göre güncellenir.
          </p>

          <button
            type="submit"
            className="px-5 py-2.5 text-xs font-bold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
          >
            Kaydet
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Parcel List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#5a6a55] uppercase tracking-wider">Parselleriniz ({parcels.length})</h2>
          </div>

          <div className="space-y-3 pr-1">
            {parcels.length > 0 ? (
              parcels.map((parcel) => {
                const isSelected = selectedParcel?.id === parcel.id;
                return (
                  <div
                    id={`parcel-card-${parcel.id}`}
                    key={parcel.id}
                    onClick={() => handleSelectParcel(parcel)}
                    className={`p-5 rounded-3xl border text-left cursor-pointer transition-all flex justify-between items-center ${
                      isSelected
                        ? "bg-[#556b2f] text-white border-[#415324] shadow-md shadow-[#556b2f]/10"
                        : "bg-[#fcfdfc] border-[#e2e8df] text-[#1a2416] hover:border-[#556b2f]/30"
                    }`}
                  >
                    <div className="space-y-2">
                      <h3 className="font-bold font-display text-base leading-tight">{parcel.name}</h3>
                      <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                        <span className={`px-2 py-0.5 rounded-full ${isSelected ? "bg-[#415324]" : "bg-[#f0f4ee] text-[#556b2f]"}`}>
                          {parcel.cropType}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full ${isSelected ? "bg-[#415324]" : "bg-[#f0f4ee] text-[#556b2f]"}`}>
                          {parcel.areaDekar} Dekar
                        </span>
                        <span className={`px-2 py-0.5 rounded-full ${isSelected ? "bg-[#415324]" : "bg-[#f0f4ee] text-[#556b2f]"}`}>
                          {parcel.treeCount} {parcel.cropType === "Zeytin" ? "Ağaç" : "Bitki"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        id={`delete-parcel-btn-${parcel.id}`}
                        onClick={(e) => handleDeleteParcel(parcel.id, e)}
                        className={`p-2 rounded-xl transition-colors ${
                          isSelected
                            ? "hover:bg-[#415324] text-red-200"
                            : "hover:bg-red-50 text-red-600"
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <ChevronRight className={`h-5 w-5 ${isSelected ? "text-white" : "text-[#80907a]"}`} />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl">
                <MapPin className="h-8 w-8 text-[#80907a] mx-auto mb-2" />
                <p className="text-xs text-[#5a6a55] italic">Kayıtlı parsel bulunmamaktadır.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Selected Parcel Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedParcel ? (
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6">
              <div className="border-b border-[#f0f4ee] pb-4">
                <h2 className="text-xl font-bold font-display text-[#1a2416]">{selectedParcel.name} - Detaylı {plantLabel} Listesi</h2>
                <p className="text-xs text-[#5a6a55] mt-0.5">
                  Ürün: <span className="font-semibold text-[#1a2416]">{selectedParcel.cropType}</span> | Toprak: <span className="font-semibold text-[#1a2416]">{selectedParcel.soilType}</span> | Sulama: <span className="font-semibold text-[#1a2416]">{selectedParcel.irrigationType}</span>
                </p>
              </div>

              <TreeCountManager
                parcel={selectedParcel}
                treeCountChanges={treeCountChanges}
                plantLabel={plantLabel}
                onCountChanged={(newCount) => setSelectedParcel((prev) => prev ? { ...prev, treeCount: newCount } : prev)}
                onDataChanged={() => {
                  fetchTreeCountChanges(selectedParcel.id);
                  fetchParcels();
                }}
              />

              <TreeManager
                parcel={selectedParcel}
                trees={trees}
                healthSummary={healthSummary}
                plantLabel={plantLabel}
                onTreesChanged={() => {
                  fetchTrees(selectedParcel.id);
                  fetchParcels(); // to sync tree counts on cards
                }}
                onHealthSummaryChanged={() => fetchHealthSummary(selectedParcel.id)}
              />
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-[#e2e8df] rounded-3xl bg-[#fcfdfc] p-6 text-center">
              <Folder className="h-12 w-12 text-[#80907a] mb-3" />
              <h2 className="text-base font-bold text-[#1a2416]">Parsel Seçimi Yapın</h2>
              <p className="text-xs text-[#5a6a55] max-w-sm mt-1">
                Soldaki listeden bir parsel seçerek ürün detaylarını, tür dağılımlarını ve tekil ağaç/bitki sağlığı takiplerini anlık görebilirsiniz.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
