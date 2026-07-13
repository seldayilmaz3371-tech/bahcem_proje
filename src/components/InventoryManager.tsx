/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Package, 
  Plus, 
  Minus, 
  AlertTriangle, 
  X, 
  RefreshCw, 
  Info,
  Calendar,
  Layers,
  CircleDollarSign,
  Search,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  History,
  Trash2,
  MapPin
} from "lucide-react";
import { InventoryItem, InventoryCategory, Parcel, Tree, ProductApplication } from "../types";

export default function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Add Item Form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [unit, setUnit] = useState("Litre");
  const [minStockAlert, setMinStockAlert] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [type, setType] = useState("Standard"); // Standard, Fertilizer, Chemical
  
  // Specific Details Form
  const [npkRatio, setNpkRatio] = useState("15-15-15");
  const [organicContent, setOrganicContent] = useState("0");
  const [microElements, setMicroElements] = useState("");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [preHarvestInterval, setPreHarvestInterval] = useState("15");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Stock Adjustment Form
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");

  // Details expansion (photos + application history), lazy-loaded per item
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [applicationsByItem, setApplicationsByItem] = useState<Record<string, ProductApplication[]>>({});
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);

  // New application record form
  const [showApplyFormFor, setShowApplyFormFor] = useState<string | null>(null);
  const [applyDate, setApplyDate] = useState(new Date().toISOString().split("T")[0]);
  const [applyParcelIds, setApplyParcelIds] = useState<string[]>([]);
  const [applyTreeIds, setApplyTreeIds] = useState<string[]>([]);
  const [applyAmountNote, setApplyAmountNote] = useState("");
  const [applyNotes, setApplyNotes] = useState("");
  const [applySaving, setApplySaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const [itemsRes, catRes, parcelsRes] = await Promise.all([
        fetch("/api/inventory", { headers }),
        fetch("/api/inventory/categories", { headers }),
        fetch("/api/parcels", { headers })
      ]);

      if (itemsRes.ok) setItems(await itemsRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      if (parcelsRes.ok) setParcels(await parcelsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Trees are only ever exposed per-parcel in this codebase
   * (GET /api/parcels/:id/trees) — there is no farm-wide "all trees"
   * endpoint. Rather than looping through every parcel up front to
   * build one, reference trees are fetched lazily, only for parcels the
   * user has actually selected in the application form below.
   */
  const fetchTreesForParcel = async (parcelId: string) => {
    if (trees.some((t) => t.parcelId === parcelId)) return; // already have them
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/parcels/${parcelId}/trees`, { headers });
      if (res.ok) {
        const parcelTrees: Tree[] = await res.json();
        setTrees((prev) => [...prev, ...parcelTrees]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !categoryId || !stockQuantity || !unit || !minStockAlert) {
      setError("Ürün adı, kategori, stok miktarı, birim ve minimum stok uyarısı zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const payload = {
        name,
        categoryId,
        brand,
        sku,
        stockQuantity,
        unit,
        minStockAlert,
        unitPrice,
        type,
        specificDetails: type === "Fertilizer" ? {
          npkRatio,
          organicContentPercent: organicContent,
          microElements
        } : type === "Chemical" ? {
          activeIngredient,
          targetPests: [],
          preHarvestIntervalDays: preHarvestInterval
        } : undefined
      };

      const res = await fetch("/api/inventory", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ürün kaydedilemedi.");
      }

      // Reset
      setName("");
      setBrand("");
      setSku("");
      setStockQuantity("");
      setMinStockAlert("");
      setUnitPrice("");
      setType("Standard");
      setShowForm(false);
      
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItemId || !adjustDelta) return;

    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: adjustingItemId,
          delta: adjustDelta,
          notes: adjustNotes
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Stok güncellenemedi.");
      }

      setAdjustingItemId(null);
      setAdjustDelta("");
      setAdjustNotes("");
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  /**
   * Uploads (or replaces) an inventory item's invoice/label photo.
   * Reuses the `invoicePhotoUrl`/`labelPhotoUrl` fields already present
   * on InventoryItem — they existed in the data model but had no route
   * or UI wired to them until now.
   */
  const handleUploadPhoto = (itemId: string, photoType: "invoice" | "label") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      setUploadingPhotoFor(itemId);
      try {
        const headers = {
          "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
          "Content-Type": "application/json"
        };
        const res = await fetch(`/api/inventory/${itemId}/photo`, {
          method: "POST",
          headers,
          body: JSON.stringify({ base64Data: reader.result, photoType })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Fotoğraf yüklenemedi.");
        }
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === itemId ? updated : it)));
      } catch (err: any) {
        alert(err.message);
      } finally {
        setUploadingPhotoFor(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleToggleExpand = async (itemId: string) => {
    if (expandedItemId === itemId) {
      setExpandedItemId(null);
      return;
    }
    setExpandedItemId(itemId);
    if (!applicationsByItem[itemId]) {
      setLoadingApplications(true);
      try {
        const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
        const res = await fetch(`/api/inventory/${itemId}/applications`, { headers });
        if (res.ok) {
          const list: ProductApplication[] = await res.json();
          setApplicationsByItem((prev) => ({ ...prev, [itemId]: list }));
        }
      } finally {
        setLoadingApplications(false);
      }
    }
  };

  const toggleApplyParcel = (parcelId: string) => {
    setApplyParcelIds((prev) =>
      prev.includes(parcelId) ? prev.filter((id) => id !== parcelId) : [...prev, parcelId]
    );
    fetchTreesForParcel(parcelId);
  };

  const toggleApplyTree = (treeId: string) => {
    setApplyTreeIds((prev) =>
      prev.includes(treeId) ? prev.filter((id) => id !== treeId) : [...prev, treeId]
    );
  };

  const resetApplyForm = () => {
    setShowApplyFormFor(null);
    setApplyDate(new Date().toISOString().split("T")[0]);
    setApplyParcelIds([]);
    setApplyTreeIds([]);
    setApplyAmountNote("");
    setApplyNotes("");
  };

  const handleSubmitApplication = async (itemId: string) => {
    if (applyParcelIds.length === 0) {
      alert("En az bir parsel seçmelisiniz.");
      return;
    }
    setApplySaving(true);
    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/inventory/${itemId}/applications`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          applicationDate: applyDate,
          parcelIds: applyParcelIds,
          treeIds: applyTreeIds,
          amountNote: applyAmountNote,
          notes: applyNotes
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Uygulama kaydedilemedi.");
      }
      const newRecord = await res.json();
      setApplicationsByItem((prev) => ({
        ...prev,
        [itemId]: [newRecord, ...(prev[itemId] || [])]
      }));
      resetApplyForm();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setApplySaving(false);
    }
  };

  const handleDeleteApplication = async (itemId: string, applicationId: string) => {
    if (!confirm("Bu uygulama kaydını silmek istediğinize emin misiniz?")) return;
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/inventory/applications/${applicationId}`, { method: "DELETE", headers });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kayıt silinemedi.");
      }
      setApplicationsByItem((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).filter((a) => a.id !== applicationId)
      }));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const getParcelName = (id: string) => parcels.find((p) => p.id === id)?.name || "Bilinmeyen Parsel";
  const getTreeLabel = (id: string) => {
    const tree = trees.find((t) => t.id === id);
    return tree ? `${tree.treeNumber} (${getParcelName(tree.parcelId)})` : "Bilinmeyen Ağaç";
  };

  // Helper mappings
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || "Genel Tarım Malzemesi";

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === "all" || item.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Depo ve stok bilgileri yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="inventory-manager-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Depo & Envanter Yönetimi</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Gübre, pestisit, ambalaj ve sulama ekipmanı envanter takibi ve otomatik kritik seviye uyarıları
          </p>
        </div>
        <button
          id="add-inventory-item-btn"
          onClick={() => setShowForm(!showForm)}
          className="self-start flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? "Vazgeç" : "Envantere Ürün Ekle"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddItem} className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] space-y-4 max-w-3xl animate-slide-up shadow-sm">
          <h2 className="text-md font-bold text-[#1a2416]">Yeni Tarım Malzemesi Girişi</h2>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Ürün Adı</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Bakır Sülfat (Göztaşı)"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Kategori</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="">Seçin</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Tip / Sınıf</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="Standard">Standart Malzeme (Ambalaj vb.)</option>
                <option value="Fertilizer">Gübre (Gübreleme)</option>
                <option value="Chemical">Zirai İlaç / Kimyasal</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Stok Miktarı</label>
              <input
                type="number"
                step="0.1"
                required
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                placeholder="25"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Birim</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="Kg">Kilogram (Kg)</option>
                <option value="Litre">Litre (L)</option>
                <option value="Ton">Ton</option>
                <option value="Adet">Adet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Minimum Alarm</label>
              <input
                type="number"
                required
                value={minStockAlert}
                onChange={(e) => setMinStockAlert(e.target.value)}
                placeholder="5"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Birim Fiyat (TL)</label>
              <input
                type="number"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="Örn: 240"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Marka</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Hektaş vb."
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
          </div>

          {/* Conditional Sub-Form for Fertilizer */}
          {type === "Fertilizer" && (
            <div className="bg-[#f7f9f6] p-4 rounded-2xl border border-[#dee5db] grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up">
              <div>
                <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">NPK Oranı</label>
                <input
                  type="text"
                  value={npkRatio}
                  onChange={(e) => setNpkRatio(e.target.value)}
                  placeholder="20-20-20"
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Organik Madde %</label>
                <input
                  type="number"
                  value={organicContent}
                  onChange={(e) => setOrganicContent(e.target.value)}
                  placeholder="30"
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Mikro Elementler</label>
                <input
                  type="text"
                  value={microElements}
                  onChange={(e) => setMicroElements(e.target.value)}
                  placeholder="Çinko, Bor, Demir"
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
            </div>
          )}

          {/* Conditional Sub-Form for Chemical */}
          {type === "Chemical" && (
            <div className="bg-[#f7f9f6] p-4 rounded-2xl border border-[#dee5db] grid grid-cols-1 md:grid-cols-2 gap-4 animate-slide-up">
              <div>
                <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Etken Madde</label>
                <input
                  type="text"
                  value={activeIngredient}
                  onChange={(e) => setActiveIngredient(e.target.value)}
                  placeholder="Bakır Hidroksit"
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Hasat Öncesi Bekleme (Gün)</label>
                <input
                  type="number"
                  value={preHarvestInterval}
                  onChange={(e) => setPreHarvestInterval(e.target.value)}
                  placeholder="14"
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-[#556b2f] text-white font-bold rounded-2xl text-xs hover:bg-[#415324] transition-all disabled:opacity-50"
          >
            {saving ? "Ekleniyor..." : "Yeni Ürünü Envantere Kaydet"}
          </button>
        </form>
      )}

      {/* Filter and Search Panel */}
      <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#80907a]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Depoda ürün veya marka ara..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
          />
        </div>

        <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all shrink-0 ${
              selectedCategory === "all" 
                ? "bg-[#556b2f] text-white" 
                : "bg-[#f0f4ee] text-[#556b2f] hover:bg-[#e4ebdf]"
            }`}
          >
            Tümü
          </button>
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-4 py-2 text-xs font-bold rounded-full transition-all shrink-0 ${
                selectedCategory === c.id 
                  ? "bg-[#556b2f] text-white" 
                  : "bg-[#f0f4ee] text-[#556b2f] hover:bg-[#e4ebdf]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Items Feed */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => {
            const isLowStock = item.stockQuantity <= item.minStockAlert;
            return (
              <div id={`inventory-card-${item.id}`} key={item.id} className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono bg-stone-100 text-stone-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {getCategoryName(item.categoryId)}
                    </span>
                    {isLowStock && (
                      <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-amber-200">
                        <AlertTriangle className="h-3 w-3" /> Kritik Stok
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold text-base text-[#1a2416]">{item.name}</h3>
                    {item.brand && <p className="text-xs text-[#80907a] font-mono mt-0.5">Marka: {item.brand}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#f0f4ee]">
                    <div>
                      <span className="text-[9px] text-[#80907a] font-mono uppercase block">Mevcut Stok</span>
                      <span className="text-lg font-bold font-display text-[#1a2416]">{item.stockQuantity} <span className="text-xs font-normal text-[#5a6a55]">{item.unit}</span></span>
                    </div>
                    <div>
                      <span className="text-[9px] text-[#80907a] font-mono uppercase block">Birim Fiyat</span>
                      <span className="text-lg font-bold font-display text-[#1a2416]">{item.unitPrice} <span className="text-xs font-normal text-[#5a6a55]">TL</span></span>
                    </div>
                  </div>
                </div>

                {/* Stock Quick Adjustment */}
                <div className="pt-4 border-t border-[#f0f4ee] flex justify-between items-center gap-2">
                  {adjustingItemId === item.id ? (
                    <form onSubmit={handleAdjustStock} className="w-full flex items-center gap-2 animate-fade-in">
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={adjustDelta}
                        onChange={(e) => setAdjustDelta(e.target.value)}
                        placeholder="Miktar (örn: -5)"
                        className="w-24 px-2 py-1.5 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-1 focus:ring-[#556b2f]"
                      />
                      <input
                        type="text"
                        value={adjustNotes}
                        onChange={(e) => setAdjustNotes(e.target.value)}
                        placeholder="Kullanım sebebi"
                        className="flex-1 px-2 py-1.5 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-1 focus:ring-[#556b2f]"
                      />
                      <button type="submit" className="px-2 py-1.5 bg-[#556b2f] text-white text-xs font-bold rounded-xl hover:bg-[#415324]">Ok</button>
                      <button type="button" onClick={() => setAdjustingItemId(null)} className="text-[#80907a] hover:text-red-600 text-xs font-bold">X</button>
                    </form>
                  ) : (
                    <>
                      <span className="text-[10px] text-[#80907a] font-mono">Min Alert: {item.minStockAlert} {item.unit}</span>
                      <button
                        id={`adjust-stock-btn-${item.id}`}
                        onClick={() => {
                          setAdjustingItemId(item.id);
                          setAdjustDelta("");
                          setAdjustNotes("");
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#f0f4ee] hover:bg-[#e4ebdf] text-[#556b2f] text-[11px] font-bold rounded-xl transition-all"
                      >
                        <Plus className="h-3 w-3" />
                        <span>Stok Güncelle</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Expand toggle for photos + application history */}
                <button
                  type="button"
                  onClick={() => handleToggleExpand(item.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-[#556b2f] hover:bg-[#f0f4ee] rounded-xl transition-all border-t border-[#f0f4ee]"
                >
                  {expandedItemId === item.id ? (
                    <>Detayları Gizle <ChevronUp className="h-3.5 w-3.5" /></>
                  ) : (
                    <>Fotoğraf & Uygulama Geçmişi <ChevronDown className="h-3.5 w-3.5" /></>
                  )}
                </button>

                {expandedItemId === item.id && (
                  <div className="space-y-4 pt-3 border-t border-[#f0f4ee] animate-fade-in">
                    {/* Invoice / Label Photos */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-[#80907a] uppercase tracking-wider flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Fotoğraflar
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          {item.invoicePhotoUrl ? (
                            <a href={item.invoicePhotoUrl} target="_blank" rel="noopener noreferrer">
                              <img src={item.invoicePhotoUrl} alt="Fatura" className="h-16 w-full object-cover rounded-lg border border-[#e2e8df]" />
                            </a>
                          ) : (
                            <label className="h-16 flex flex-col items-center justify-center gap-0.5 border border-dashed border-[#cdd4ca] rounded-lg cursor-pointer hover:bg-[#f0f4ee] text-[9px] text-[#80907a] font-bold">
                              {uploadingPhotoFor === item.id ? "Yükleniyor..." : "Fatura Ekle"}
                              <input type="file" accept="image/*" onChange={handleUploadPhoto(item.id, "invoice")} className="hidden" />
                            </label>
                          )}
                        </div>
                        <div>
                          {item.labelPhotoUrl ? (
                            <a href={item.labelPhotoUrl} target="_blank" rel="noopener noreferrer">
                              <img src={item.labelPhotoUrl} alt="Etiket" className="h-16 w-full object-cover rounded-lg border border-[#e2e8df]" />
                            </a>
                          ) : (
                            <label className="h-16 flex flex-col items-center justify-center gap-0.5 border border-dashed border-[#cdd4ca] rounded-lg cursor-pointer hover:bg-[#f0f4ee] text-[9px] text-[#80907a] font-bold">
                              {uploadingPhotoFor === item.id ? "Yükleniyor..." : "Etiket Ekle"}
                              <input type="file" accept="image/*" onChange={handleUploadPhoto(item.id, "label")} className="hidden" />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Application History */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#80907a] uppercase tracking-wider flex items-center gap-1">
                          <History className="h-3 w-3" /> Uygulama Geçmişi
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowApplyFormFor(showApplyFormFor === item.id ? null : item.id)}
                          className="text-[10px] font-bold text-[#556b2f] hover:underline"
                        >
                          + Yeni Kayıt
                        </button>
                      </div>

                      {showApplyFormFor === item.id && (
                        <div className="bg-[#f7f9f6] p-3 rounded-xl border border-[#dee5db] space-y-2 animate-slide-up">
                          <input
                            type="date"
                            value={applyDate}
                            max={new Date().toISOString().split("T")[0]}
                            onChange={(e) => setApplyDate(e.target.value)}
                            className="w-full text-xs border border-[#cdd4ca] rounded-lg px-2 py-1.5"
                          />
                          <div>
                            <span className="text-[9px] font-bold text-[#80907a] uppercase block mb-1">Parseller (birden fazla seçilebilir)</span>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                              {parcels.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggleApplyParcel(p.id)}
                                  className={`px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                    applyParcelIds.includes(p.id)
                                      ? "bg-[#556b2f] text-white border-[#556b2f]"
                                      : "bg-white text-[#5a6a55] border-[#cdd4ca] hover:bg-[#f0f4ee]"
                                  }`}
                                >
                                  {p.name}
                                </button>
                              ))}
                            </div>
                          </div>
                          {applyParcelIds.length > 0 && (
                            <div>
                              <span className="text-[9px] font-bold text-[#80907a] uppercase block mb-1">Referans Ağaçlar (isteğe bağlı)</span>
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                                {trees.filter((t) => applyParcelIds.includes(t.parcelId) && t.isReferenceTree).map((t) => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => toggleApplyTree(t.id)}
                                    className={`px-2 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                      applyTreeIds.includes(t.id)
                                        ? "bg-[#556b2f] text-white border-[#556b2f]"
                                        : "bg-white text-[#5a6a55] border-[#cdd4ca] hover:bg-[#f0f4ee]"
                                    }`}
                                  >
                                    {t.treeNumber}
                                  </button>
                                ))}
                                {trees.filter((t) => applyParcelIds.includes(t.parcelId) && t.isReferenceTree).length === 0 && (
                                  <span className="text-[10px] text-[#80907a] italic">Seçili parsellerde referans ağaç yok.</span>
                                )}
                              </div>
                            </div>
                          )}
                          <input
                            type="text"
                            value={applyAmountNote}
                            onChange={(e) => setApplyAmountNote(e.target.value)}
                            placeholder="Miktar (örn: 2 litre) — isteğe bağlı"
                            className="w-full text-xs border border-[#cdd4ca] rounded-lg px-2 py-1.5"
                          />
                          <textarea
                            value={applyNotes}
                            onChange={(e) => setApplyNotes(e.target.value)}
                            placeholder="Not (isteğe bağlı)"
                            rows={2}
                            className="w-full text-xs border border-[#cdd4ca] rounded-lg px-2 py-1.5 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={applySaving}
                              onClick={() => handleSubmitApplication(item.id)}
                              className="flex-1 text-[11px] font-bold bg-[#556b2f] text-white py-1.5 rounded-lg hover:bg-[#415324] disabled:opacity-50"
                            >
                              {applySaving ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                            <button
                              type="button"
                              onClick={resetApplyForm}
                              className="flex-1 text-[11px] font-bold bg-white text-[#5a6a55] py-1.5 rounded-lg border border-[#cdd4ca]"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      )}

                      {loadingApplications && !applicationsByItem[item.id] ? (
                        <p className="text-[10px] text-[#80907a] italic">Yükleniyor...</p>
                      ) : (applicationsByItem[item.id] || []).length > 0 ? (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {(applicationsByItem[item.id] || []).map((app) => (
                            <div key={app.id} className="bg-white border border-[#e2e8df] rounded-lg p-2 text-[10px] flex justify-between items-start gap-2">
                              <div>
                                <span className="font-bold text-[#1a2416] flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> {new Date(app.applicationDate).toLocaleDateString("tr-TR")}
                                </span>
                                <span className="text-[#5a6a55] flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" /> {app.parcelIds.map(getParcelName).join(", ")}
                                </span>
                                {app.treeIds.length > 0 && (
                                  <span className="text-[#80907a] block mt-0.5">
                                    Ağaçlar: {app.treeIds.map(getTreeLabel).join(", ")}
                                  </span>
                                )}
                                {app.amountNote && <span className="text-[#80907a] block mt-0.5">Miktar: {app.amountNote}</span>}
                                {app.notes && <span className="text-[#80907a] block mt-0.5 italic">{app.notes}</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteApplication(item.id, app.id)}
                                className="text-[#a8b5a2] hover:text-red-600 shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#80907a] italic">Henüz uygulama kaydı yok.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-12 text-center border-2 border-dashed border-[#e2e8df] rounded-3xl col-span-3 bg-[#fcfdfc]">
            <Package className="h-10 w-10 text-[#80907a] mx-auto mb-2" />
            <p className="text-xs text-[#5a6a55] italic">Kriterlere uyan depo malzemesi bulunamadı.</p>
          </div>
        )}
      </div>
    </div>
  );
}
