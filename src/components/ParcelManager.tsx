/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  MapPin, 
  Trees, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Folder, 
  Calendar,
  Layers,
  ChevronRight,
  Info,
  History,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { Parcel, Tree, CropType, TreeCountChangeLog, TreeCountChangeReason } from "../types";

export default function ParcelManager() {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [showParcelForm, setShowParcelForm] = useState(false);
  const [parcelName, setParcelName] = useState("");
  const [parcelArea, setParcelArea] = useState("");
  const [parcelTreeCount, setParcelTreeCount] = useState("");
  const [cropType, setCropType] = useState<CropType>("Zeytin");
  const [soilType, setSoilType] = useState("Killi-Tınlı");
  const [irrigationType, setIrrigationType] = useState("Damlama");

  const [showTreeForm, setShowTreeForm] = useState(false);
  const [treeNumber, setTreeNumber] = useState("");
  const [treeVariety, setTreeVariety] = useState("Sarıulak");
  const [plantingYear, setPlanttingYear] = useState("2016");
  const [treeNotes, setTreeNotes] = useState("");

  // Manual Tree/Plant Count Change Form & History
  const [treeCountChanges, setTreeCountChanges] = useState<TreeCountChangeLog[]>([]);
  const [showTreeCountChangeForm, setShowTreeCountChangeForm] = useState(false);
  const [newTreeCount, setNewTreeCount] = useState("");
  const [changeReason, setChangeReason] = useState<TreeCountChangeReason>("Dikim (Yeni Ekim)");
  const [changeNotes, setChangeNotes] = useState("");
  const [changeDate, setChangeDate] = useState(new Date().toISOString().split("T")[0]);
  const [countChangeError, setCountChangeError] = useState("");
  const [savingCountChange, setSavingCountChange] = useState(false);

  const [error, setError] = useState("");

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
        const data = await res.json();
        setParcels(data);
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
        const data = await res.json();
        setTrees(data);
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

  useEffect(() => {
    fetchParcels();
  }, []);

  const handleSelectParcel = (parcel: Parcel) => {
    setSelectedParcel(parcel);
    fetchTrees(parcel.id);
    fetchTreeCountChanges(parcel.id);
    setTreeVariety(parcel.cropType === "Zeytin" ? "Sarıulak" : "");
    setShowTreeCountChangeForm(false);
    setNewTreeCount("");
    setCountChangeError("");
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
        body: JSON.stringify({
          name: parcelName,
          areaDekar: parcelArea,
          cropType,
          treeCount: parcelTreeCount,
          soilType,
          irrigationType
        })
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
      const res = await fetch(`/api/parcels/${id}`, {
        method: "DELETE",
        headers
      });

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

  const handleAddTree = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedParcel) return;
    if (!treeNumber) {
      setError("Ağaç referans numarası zorunludur.");
      return;
    }

    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/parcels/${selectedParcel.id}/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          treeNumber,
          variety: treeVariety,
          plantingYear,
          notes: treeNotes
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ağaç kaydı eklenemedi.");
      }

      setTreeNumber("");
      setTreeNotes("");
      setShowTreeForm(false);
      
      // Refresh parcel and tree list
      fetchTrees(selectedParcel.id);
      fetchParcels(); // to sync tree counts on cards
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTree = async (treeId: string) => {
    if (!selectedParcel) return;
    if (!window.confirm("Bu ağaç kaydını sistemden silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/trees/${treeId}`, {
        method: "DELETE",
        headers
      });

      if (res.ok) {
        fetchTrees(selectedParcel.id);
        fetchParcels();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddTreeCountChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setCountChangeError("");
    if (!selectedParcel) return;

    if (newTreeCount === "") {
      setCountChangeError("Yeni sayı zorunludur.");
      return;
    }
    const parsedNewCount = parseInt(newTreeCount, 10);
    if (isNaN(parsedNewCount) || parsedNewCount < 0) {
      setCountChangeError("Yeni sayı sıfır veya pozitif bir tam sayı olmalıdır.");
      return;
    }
    if (parsedNewCount === selectedParcel.treeCount) {
      setCountChangeError(`Yeni sayı, mevcut sayıyla (${selectedParcel.treeCount}) aynı. Değişiklik kaydı oluşturmak için farklı bir değer girin.`);
      return;
    }

    setSavingCountChange(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/parcels/${selectedParcel.id}/tree-count-changes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          newCount: parsedNewCount,
          reason: changeReason,
          notes: changeNotes,
          changeDate
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sayı değişikliği kaydedilemedi.");
      }

      setNewTreeCount("");
      setChangeNotes("");
      setChangeReason("Dikim (Yeni Ekim)");
      setChangeDate(new Date().toISOString().split("T")[0]);
      setShowTreeCountChangeForm(false);

      // Refresh the change history, the selected parcel's updated count, and the parcel list badges
      await fetchTreeCountChanges(selectedParcel.id);
      await fetchParcels();
      setSelectedParcel((prev) => prev ? { ...prev, treeCount: parsedNewCount } : prev);
    } catch (err: any) {
      setCountChangeError(err.message);
    } finally {
      setSavingCountChange(false);
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
            Not: Ağaç/bitki sayısı burada tahmini olarak girilebilir. "Yeni {plantLabel} Tanımla" ile tekil kayıt eklemeye başladığınızda bu sayı otomatik olarak gerçek kayıt adedine göre güncellenir.
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

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
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

        {/* Right Side: Trees of Selected Parcel */}
        <div className="lg:col-span-2 space-y-4">
          {selectedParcel ? (
            <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#f0f4ee] pb-4">
                <div>
                  <h2 className="text-xl font-bold font-display text-[#1a2416]">{selectedParcel.name} - Detaylı {plantLabel} Listesi</h2>
                  <p className="text-xs text-[#5a6a55] mt-0.5">
                    Ürün: <span className="font-semibold text-[#1a2416]">{selectedParcel.cropType}</span> | Toprak: <span className="font-semibold text-[#1a2416]">{selectedParcel.soilType}</span> | Sulama: <span className="font-semibold text-[#1a2416]">{selectedParcel.irrigationType}</span>
                  </p>
                </div>

                <button
                  id="add-tree-btn"
                  onClick={() => setShowTreeForm(!showTreeForm)}
                  className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#556b2f] bg-[#f0f4ee] rounded-xl hover:bg-[#e4ebdf] transition-all"
                >
                  {showTreeForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>{showTreeForm ? "Kapat" : `Yeni ${plantLabel} Tanımla`}</span>
                </button>
              </div>

              {/* Manual Tree/Plant Count Change Section */}
              <div className="bg-[#f7f9f6] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Güncel {plantLabel} Sayısı</h3>
                    <p className="text-2xl font-bold font-display text-[#1a2416] mt-0.5">
                      {selectedParcel.treeCount} <span className="text-xs font-normal text-[#5a6a55]">{plantLabel}</span>
                    </p>
                  </div>
                  <button
                    id="update-tree-count-btn"
                    onClick={() => { setShowTreeCountChangeForm(!showTreeCountChangeForm); setCountChangeError(""); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all shadow-sm self-start"
                  >
                    {showTreeCountChangeForm ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                    <span>{showTreeCountChangeForm ? "Kapat" : "Sayıyı Güncelle"}</span>
                  </button>
                </div>

                {showTreeCountChangeForm && (
                  <form onSubmit={handleAddTreeCountChange} className="border-t border-[#e2e8df] pt-4 space-y-4 animate-slide-up">
                    {countChangeError && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{countChangeError}</p>}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Yeni {plantLabel} Sayısı</label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={newTreeCount}
                          onChange={(e) => setNewTreeCount(e.target.value)}
                          placeholder={String(selectedParcel.treeCount)}
                          className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Değişiklik Nedeni</label>
                        <select
                          value={changeReason}
                          onChange={(e) => setChangeReason(e.target.value as TreeCountChangeReason)}
                          className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        >
                          <option value="Dikim (Yeni Ekim)">Dikim (Yeni Ekim)</option>
                          <option value="Kesim/Budama">Kesim/Budama</option>
                          <option value="Don/Hastalık Kaybı">Don/Hastalık Kaybı</option>
                          <option value="Sayım Düzeltmesi">Sayım Düzeltmesi</option>
                          <option value="Diğer">Diğer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Değişiklik Tarihi</label>
                        <input
                          type="date"
                          value={changeDate}
                          onChange={(e) => setChangeDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Not (İsteğe Bağlı)</label>
                      <input
                        type="text"
                        value={changeNotes}
                        onChange={(e) => setChangeNotes(e.target.value)}
                        placeholder="Örn: Kuzey sırada 5 yeni fide dikildi."
                        className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      />
                    </div>

                    <p className="text-[10px] text-[#80907a] italic leading-relaxed">
                      Not: Bu değişiklik, geçmiş hasat ve verim raporlarını yeniden hesaplamaz — geçmiş kayıtlar o dönemki değerleriyle sabit kalır. Ayrıca, "Yeni {plantLabel} Tanımla" ile tekil kayıt eklemeye/silmeye devam ederseniz, sayı otomatik olarak gerçek kayıt adedine göre güncellenmeye devam eder.
                    </p>

                    <button
                      type="submit"
                      disabled={savingCountChange}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all shadow-sm disabled:opacity-50"
                    >
                      {savingCountChange ? "Kaydediliyor..." : "Değişikliği Kaydet"}
                    </button>
                  </form>
                )}

                {treeCountChanges.length > 0 && (
                  <div className="border-t border-[#e2e8df] pt-4 space-y-2">
                    <h3 className="text-[10px] font-bold text-[#80907a] uppercase tracking-wider flex items-center gap-1">
                      <History className="h-3.5 w-3.5" /> Değişiklik Geçmişi ({treeCountChanges.length})
                    </h3>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {treeCountChanges.map((log) => (
                        <div id={`tree-count-change-${log.id}`} key={log.id} className="flex items-center justify-between gap-3 text-xs bg-white border border-[#e2e8df] rounded-xl px-3 py-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1a2416]">
                              {log.previousCount} → {log.newCount} <span className="text-[#80907a] font-normal">({log.reason})</span>
                            </p>
                            {log.notes && <p className="text-[10px] text-[#5a6a55] truncate mt-0.5">{log.notes}</p>}
                            <p className="text-[10px] text-[#80907a] font-mono mt-0.5">{new Date(log.changeDate).toLocaleDateString("tr-TR")}</p>
                          </div>
                          <span className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                            log.delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                          }`}>
                            {log.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {log.delta > 0 ? "+" : ""}{log.delta}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {showTreeForm && (
                <form onSubmit={handleAddTree} className="bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-5 space-y-4 animate-slide-up">
                  <h3 className="text-xs font-bold text-[#1a2416] uppercase tracking-wider">{plantLabel} Referans Kartı</h3>
                  
                  {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">{plantLabel} No (Örn: T-12)</label>
                      <input
                        type="text"
                        value={treeNumber}
                        onChange={(e) => setTreeNumber(e.target.value)}
                        placeholder="P1-T12"
                        className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Varyete / Tür</label>
                      {selectedParcel.cropType === "Zeytin" ? (
                        <select
                          value={treeVariety}
                          onChange={(e) => setTreeVariety(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        >
                          <option value="Sarıulak">Sarıulak (Yerel Mersin)</option>
                          <option value="Ayvalık">Ayvalık / Edremit</option>
                          <option value="Gemlik">Gemlik (Salamuralık)</option>
                          <option value="Kalamata">Kalamata</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={treeVariety}
                          onChange={(e) => setTreeVariety(e.target.value)}
                          placeholder={selectedParcel.cropType === "Sebze" ? "Örn: Domates - Pembe Çeri" : "Örn: Elma - Starking"}
                          className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Dikim Yılı</label>
                      <input
                        type="number"
                        value={plantingYear}
                        onChange={(e) => setPlanttingYear(e.target.value)}
                        placeholder="Örn: 2015"
                        className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Özel Durum Notu (İsteğe Bağlı)</label>
                    <input
                      type="text"
                      value={treeNotes}
                      onChange={(e) => setTreeNotes(e.target.value)}
                      placeholder="Gelişimi yavaş, dal kanseri şüphesi vb."
                      className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-bold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all shadow-sm"
                  >
                    {plantLabel === "Ağaç" ? "Ağacı" : "Bitkiyi"} Kaydet
                  </button>
                </form>
              )}

              {/* Tree Grid */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#80907a] uppercase tracking-wider">{plantLabel} Haritası & Sağlık Durumları ({trees.length} {plantLabel})</h3>
                
                {trees.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {trees.map((tree) => (
                      <div id={`tree-card-${tree.id}`} key={tree.id} className="bg-[#f7f9f6] border border-[#e2e8df] p-4 rounded-2xl relative group hover:border-[#556b2f]/30 transition-all flex flex-col justify-between">
                        <button
                          id={`delete-tree-btn-${tree.id}`}
                          onClick={() => handleDeleteTree(tree.id)}
                          title={`Bu ${plantLabel.toLowerCase()} kaydını sil`}
                          aria-label={`${plantLabel} kaydını sil`}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/70 text-[#a3a99e] hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>

                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-[#80907a]">NO:</span>
                          <p className="text-sm font-bold text-[#1a2416] font-mono">{tree.treeNumber}</p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-[#e2e8df]/60 space-y-1">
                          <p className="text-[11px] text-[#5a6a55]"><span className="font-semibold text-[#2d3a2a]">Tür:</span> {tree.variety}</p>
                          <p className="text-[11px] text-[#5a6a55]"><span className="font-semibold text-[#2d3a2a]">Yaş:</span> {new Date().getFullYear() - tree.plantingYear} Yıl</p>
                          {tree.notes && (
                            <p className="text-[10px] text-amber-700 font-medium truncate mt-1 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-0.5" title={tree.notes}>
                              <Info className="h-3 w-3" /> {tree.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 text-center border-2 border-dashed border-[#e2e8df] rounded-2xl">
                    <Trees className="h-10 w-10 text-[#80907a] mx-auto mb-2" />
                    <p className="text-xs text-[#5a6a55] italic">Bu parsele henüz tekil {plantLabel.toLowerCase()} kaydı eklenmemiştir.</p>
                  </div>
                )}
              </div>
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
