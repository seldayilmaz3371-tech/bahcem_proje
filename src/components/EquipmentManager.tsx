/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Wrench,
  Plus,
  X,
  Trash2,
  FileText,
  Upload,
  MessageCircle,
  Send,
  CircleDollarSign,
  AlertTriangle,
  Loader2,
  ShieldAlert
} from "lucide-react";
import { Equipment, EquipmentStatus, Parcel, UploadedDocument, Cost } from "../types";

const EQUIPMENT_CATEGORY_SUGGESTIONS = [
  "Çapa Motoru",
  "Su Motoru",
  "Ot Biçme Makinesi",
  "Budama Makası/Testeresi",
  "Pülverizatör / İlaçlama Makinesi",
  "Traktör",
  "Diğer"
];

const EQUIPMENT_STATUS_OPTIONS: EquipmentStatus[] = ["Aktif", "Bakımda", "Arızalı", "Hizmet Dışı"];

const EQUIPMENT_COST_CATEGORIES = ["Yakıt", "Bakım", "Yedek Parça", "Tamir", "Amortisman"];

function getAuthHeaders(withJson = false): Record<string, string> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`
  };
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
}

function getStatusBadgeStyle(status: EquipmentStatus): string {
  switch (status) {
    case "Aktif": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Bakımda": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Arızalı": return "bg-red-50 text-red-700 border-red-200";
    case "Hizmet Dışı": return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

export default function EquipmentManager() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add Equipment Form
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [parcelId, setParcelId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Selected equipment detail panel
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);

  const getParcelName = (id?: string) => parcels.find(p => p.id === id)?.name;

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [equipRes, parcelRes] = await Promise.all([
        fetch("/api/equipment", { headers }),
        fetch("/api/parcels", { headers })
      ]);
      if (equipRes.ok) setEquipmentList(await equipRes.json());
      if (parcelRes.ok) setParcels(await parcelRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setName("");
    setCategory("");
    setBrand("");
    setModel("");
    setParcelId("");
    setPurchaseDate("");
    setPurchasePrice("");
    setNotes("");
    setShowForm(false);
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !category) {
      setError("Ekipman adı ve kategorisi zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          name,
          category,
          brand: brand || undefined,
          model: model || undefined,
          parcelId: parcelId || undefined,
          purchaseDate: purchaseDate || undefined,
          purchasePrice: purchasePrice || undefined,
          notes: notes || undefined
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ekipman kaydedilemedi.");
      }

      resetForm();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEquipment = async (equipment: Equipment) => {
    if (!confirm(`"${equipment.name}" ekipmanını ve buna bağlı tüm kılavuzları kalıcı olarak silmek istediğinize emin misiniz? Bu masraf geçmişini etkilemez.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ekipman silinemedi.");
      }
      if (selectedEquipment?.id === equipment.id) setSelectedEquipment(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (selectedEquipment) {
    return (
      <EquipmentDetailPanel
        equipment={selectedEquipment}
        parcelName={getParcelName(selectedEquipment.parcelId)}
        onBack={() => { setSelectedEquipment(null); fetchData(); }}
      />
    );
  }

  return (
    <div id="equipment-manager-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Ekipman & Demirbaş Yönetimi</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Çapa motoru, su motoru, ot biçme makinesi gibi demirbaşlarınızı, kullanım kılavuzlarını ve bakım masraflarını tek yerden takip edin
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? "Vazgeç" : "Yeni Ekipman Ekle"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddEquipment} className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] space-y-4 max-w-3xl animate-slide-up shadow-sm">
          <h2 className="text-md font-bold text-[#1a2416]">Yeni Ekipman Kaydı</h2>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Ekipman Adı</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Honda GX35 Çapa Motoru"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Kategori</label>
              <input
                type="text"
                required
                list="equipment-category-suggestions"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Örn: Çapa Motoru"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
              <datalist id="equipment-category-suggestions">
                {EQUIPMENT_CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Marka</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Honda, Stihl vb."
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="GX35"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Bağlı Parsel (İsteğe Bağlı)</label>
              <select
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="">Genel Çiftlik Demirbaşı</option>
                {parcels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Satın Alma Tarihi</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Satın Alma Fiyatı (TL)</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Örn: 8500"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Notlar (İsteğe Bağlı)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Seri numarası, satın alınan bayi vb."
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-[#556b2f] text-white font-bold rounded-2xl text-xs hover:bg-[#415324] transition-all disabled:opacity-50"
          >
            {saving ? "Kaydediliyor..." : "Ekipmanı Kaydet"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-[#5a6a55]">Ekipmanlar yükleniyor...</p>
      ) : equipmentList.length === 0 ? (
        <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-10 text-center">
          <Wrench className="h-8 w-8 text-[#a8b5a2] mx-auto mb-3" />
          <p className="text-sm text-[#5a6a55]">Henüz kayıtlı bir ekipman yok. "Yeni Ekipman Ekle" ile başlayın.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {equipmentList.map((eq) => (
            <div
              key={eq.id}
              onClick={() => setSelectedEquipment(eq)}
              className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-[#cdd4ca] transition-all cursor-pointer group relative"
            >
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteEquipment(eq); }}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-[#a8b5a2] hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="Ekipmanı Sil"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-[#f0f4ee] rounded-xl">
                  <Wrench className="h-4 w-4 text-[#556b2f]" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getStatusBadgeStyle(eq.status)}`}>
                  {eq.status}
                </span>
              </div>

              <h3 className="font-bold text-[#1a2416] text-sm">{eq.name}</h3>
              <p className="text-xs text-[#5a6a55] mt-0.5">{eq.category}{eq.brand ? ` · ${eq.brand}` : ""}{eq.model ? ` ${eq.model}` : ""}</p>
              <p className="text-[11px] text-[#8a9585] mt-2">
                {getParcelName(eq.parcelId) || "Genel Çiftlik Demirbaşı"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EQUIPMENT DETAIL PANEL — manuals, AI troubleshooting support, and costs
// ============================================================================

type DetailTab = "manuals" | "ai-support" | "costs";

interface ChatMessage {
  sender: "user" | "bot";
  text: string;
}

function EquipmentDetailPanel({ equipment: initialEquipment, parcelName, onBack }: { equipment: Equipment; parcelName?: string; onBack: () => void }) {
  const [equipment, setEquipment] = useState<Equipment>(initialEquipment);
  const [statusSaving, setStatusSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("manuals");

  // Manuals
  const [manuals, setManuals] = useState<UploadedDocument[]>([]);
  const [manualsLoading, setManualsLoading] = useState(true);
  const [parsingFile, setParsingFile] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState("");
  const [uploadError, setUploadError] = useState("");

  // AI Support Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { sender: "bot", text: `Merhaba, ben "${equipment.name}" için arıza destek asistanınızım. Cevaplarım yalnızca bu ekipman için yüklediğiniz kullanım kılavuzuna dayanır.` }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Costs
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costsLoading, setCostsLoading] = useState(true);
  const [showCostForm, setShowCostForm] = useState(false);
  const [costCategory, setCostCategory] = useState(EQUIPMENT_COST_CATEGORIES[0]);
  const [costAmount, setCostAmount] = useState("");
  const [costDate, setCostDate] = useState(new Date().toISOString().split("T")[0]);
  const [costDescription, setCostDescription] = useState("");
  const [costSaving, setCostSaving] = useState(false);
  const [costError, setCostError] = useState("");

  const fetchManuals = async () => {
    setManualsLoading(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/documents`, { headers: getAuthHeaders() });
      if (res.ok) setManuals(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setManualsLoading(false);
    }
  };

  const fetchCosts = async () => {
    setCostsLoading(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/costs`, { headers: getAuthHeaders() });
      if (res.ok) setCosts(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setCostsLoading(false);
    }
  };

  useEffect(() => {
    fetchManuals();
    fetchCosts();
  }, [equipment.id]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    const allowedExtensions = ["txt", "md", "pdf", "docx", "doc"];
    if (!allowedExtensions.includes(extension || "")) {
      setUploadError("Yalnızca .txt, .md, .pdf, .doc ve .docx uzantılı dosyalar desteklenmektedir.");
      e.target.value = "";
      return;
    }

    setUploadError("");
    setParsingFile(true);
    setUploadFeedback("Kılavuz yükleniyor ve yapay zeka motoru ile dizine ekleniyor, lütfen bekleyin...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/ai/documents/parse", {
        method: "POST",
        headers: getAuthHeaders(),
        body: formData
      });

      if (!parseRes.ok) {
        const errData = await parseRes.json();
        throw new Error(errData.error || "Dosya işlenirken sunucuda bir hata oluştu.");
      }

      const parsed = await parseRes.json();

      let mappedType = "text/plain";
      if (extension === "md") mappedType = "text/markdown";
      else if (extension === "pdf") mappedType = "application/pdf";
      else if (extension === "docx" || extension === "doc") mappedType = "application/msword";

      const uploadRes = await fetch(`/api/equipment/${equipment.id}/documents`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          fileName: parsed.fileName,
          fileType: mappedType,
          textContent: parsed.text
        })
      });

      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error || "Kılavuz dizine eklenemedi.");
      }

      setUploadFeedback(`"${file.name}" başarıyla yüklendi ve dizine eklendi.`);
      fetchManuals();
    } catch (err: any) {
      setUploadError(err.message || "Kılavuz yüklenirken bir hata oluştu.");
      setUploadFeedback("");
    } finally {
      setParsingFile(false);
      e.target.value = "";
    }
  };

  const handleDeleteManual = async (docId: string, fileName: string) => {
    if (!confirm(`"${fileName}" kılavuzunu silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/documents/${docId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Kılavuz silinemedi.");
      }
      fetchManuals();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const question = chatInput.trim();
    setChatMessages(prev => [...prev, { sender: "user", text: question }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch(`/api/equipment/${equipment.id}/ai-support`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ query: question })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Yapay zeka asistanından yanıt alınamadı.");
      }

      const data = await res.json();
      setChatMessages(prev => [...prev, { sender: "bot", text: data.text }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { sender: "bot", text: `Bir hata oluştu: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setCostError("");

    if (!costAmount || !costCategory || !costDate) {
      setCostError("Tutar, kategori ve tarih zorunludur.");
      return;
    }

    setCostSaving(true);
    try {
      const res = await fetch("/api/finance/costs", {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          amount: costAmount,
          category: costCategory,
          costDate,
          description: costDescription || `Ekipman: ${equipment.name}`,
          referenceId: equipment.id
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Masraf kaydedilemedi.");
      }

      setCostAmount("");
      setCostDescription("");
      setShowCostForm(false);
      fetchCosts();
    } catch (err: any) {
      setCostError(err.message);
    } finally {
      setCostSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: EquipmentStatus) => {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PUT",
        headers: getAuthHeaders(true),
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Durum güncellenemedi.");
      }
      const updated = await res.json();
      setEquipment(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setStatusSaving(false);
    }
  };

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <button onClick={onBack} className="text-xs font-semibold text-[#556b2f] hover:underline flex items-center gap-1">
        ← Ekipman Listesine Dön
      </button>

      <div className="flex items-center gap-3">
        <div className="p-3 bg-[#f0f4ee] rounded-2xl">
          <Wrench className="h-6 w-6 text-[#556b2f]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-[#1a2416]">{equipment.name}</h1>
          <p className="text-sm text-[#5a6a55]">
            {equipment.category}{equipment.brand ? ` · ${equipment.brand}` : ""}{equipment.model ? ` ${equipment.model}` : ""} · {parcelName || "Genel Çiftlik Demirbaşı"}
          </p>
        </div>
        <select
          value={equipment.status}
          disabled={statusSaving}
          onChange={(e) => handleStatusChange(e.target.value as EquipmentStatus)}
          className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50 ${getStatusBadgeStyle(equipment.status)}`}
        >
          {EQUIPMENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#e2e8df]">
        {([
          { id: "manuals", label: "Kullanım Kılavuzları", icon: FileText },
          { id: "ai-support", label: "AI Arıza Desteği", icon: MessageCircle },
          { id: "costs", label: "Masraflar", icon: CircleDollarSign }
        ] as { id: DetailTab; label: string; icon: any }[]).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${
                activeTab === tab.id
                  ? "border-[#556b2f] text-[#556b2f]"
                  : "border-transparent text-[#8a9585] hover:text-[#5a6a55]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Manuals Tab */}
      {activeTab === "manuals" && (
        <div className="space-y-4">
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#cdd4ca] rounded-3xl p-8 cursor-pointer hover:border-[#556b2f] hover:bg-[#f7f9f6] transition-all">
            <Upload className="h-6 w-6 text-[#8a9585]" />
            <span className="text-xs font-bold text-[#5a6a55]">
              {parsingFile ? "İşleniyor..." : "Kullanım kılavuzu yüklemek için tıklayın (.pdf, .docx, .txt, .md)"}
            </span>
            <input type="file" className="hidden" onChange={handleFileSelect} disabled={parsingFile} accept=".pdf,.docx,.doc,.txt,.md" />
          </label>

          {uploadError && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{uploadError}</p>}
          {uploadFeedback && <p className="text-xs font-bold text-emerald-700 bg-emerald-50 p-3 rounded-xl">{uploadFeedback}</p>}

          {manualsLoading ? (
            <p className="text-sm text-[#5a6a55]">Kılavuzlar yükleniyor...</p>
          ) : manuals.length === 0 ? (
            <p className="text-sm text-[#8a9585] text-center py-6">Bu ekipman için henüz bir kılavuz yüklenmedi.</p>
          ) : (
            <div className="space-y-2">
              {manuals.map(doc => (
                <div key={doc.id} className="flex items-center justify-between bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-[#556b2f] shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-[#1a2416]">{doc.fileName}</p>
                      {doc.summary && <p className="text-xs text-[#5a6a55] mt-0.5">{doc.summary}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteManual(doc.id, doc.fileName)}
                    className="p-1.5 rounded-lg text-[#a8b5a2] hover:text-red-600 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Support Tab */}
      {activeTab === "ai-support" && (
        <div className="space-y-4">
          {manuals.length === 0 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-800">
                Bu ekipman için henüz bir kılavuz yüklenmedi. Sağlıklı bir arıza tavsiyesi alabilmek için önce "Kullanım Kılavuzları" sekmesinden bir kılavuz yükleyin.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2.5 bg-[#f0f4ee] border border-[#dee5db] rounded-2xl p-4">
            <ShieldAlert className="h-4 w-4 text-[#556b2f] shrink-0 mt-0.5" />
            <p className="text-xs text-[#5a6a55]">
              Bu asistan yalnızca yüklediğiniz kılavuza dayanarak yönlendirme yapar; kesin bir teknik servis kararı değildir. Ciddi arızalarda yetkili servise başvurun.
            </p>
          </div>

          <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-4 space-y-3 max-h-96 overflow-y-auto">
            {chatMessages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                  msg.sender === "user"
                    ? "bg-[#556b2f] text-white"
                    : "bg-[#f0f4ee] text-[#1a2416]"
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-[#f0f4ee] px-4 py-2.5 rounded-2xl">
                  <Loader2 className="h-4 w-4 text-[#556b2f] animate-spin" />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Örn: Motor çalışmıyor, ne yapmalıyım?"
              disabled={chatLoading}
              className="flex-1 px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-2.5 bg-[#556b2f] text-white rounded-2xl hover:bg-[#415324] transition-all disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Costs Tab */}
      {activeTab === "costs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#5a6a55]">Toplam Masraf: <span className="font-bold text-[#1a2416]">{totalCost.toLocaleString("tr-TR")} TL</span></p>
            <button
              onClick={() => setShowCostForm(!showCostForm)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all"
            >
              {showCostForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showCostForm ? "Vazgeç" : "Masraf Ekle"}
            </button>
          </div>

          {showCostForm && (
            <form onSubmit={handleAddCost} className="bg-[#fcfdfc] p-4 rounded-2xl border border-[#e2e8df] space-y-3 animate-slide-up">
              {costError && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl">{costError}</p>}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Kategori</label>
                  <select
                    value={costCategory}
                    onChange={(e) => setCostCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                  >
                    {EQUIPMENT_COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Tutar (TL)</label>
                  <input
                    type="number"
                    value={costAmount}
                    onChange={(e) => setCostAmount(e.target.value)}
                    placeholder="450"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Tarih</label>
                  <input
                    type="date"
                    value={costDate}
                    onChange={(e) => setCostDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Açıklama (İsteğe Bağlı)</label>
                  <input
                    type="text"
                    value={costDescription}
                    onChange={(e) => setCostDescription(e.target.value)}
                    placeholder="Örn: Buji değişimi"
                    className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:ring-2 focus:ring-[#556b2f]"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={costSaving}
                className="w-full py-2.5 bg-[#556b2f] text-white font-bold rounded-xl text-xs hover:bg-[#415324] transition-all disabled:opacity-50"
              >
                {costSaving ? "Kaydediliyor..." : "Masrafı Kaydet"}
              </button>
            </form>
          )}

          {costsLoading ? (
            <p className="text-sm text-[#5a6a55]">Masraflar yükleniyor...</p>
          ) : costs.length === 0 ? (
            <p className="text-sm text-[#8a9585] text-center py-6">Bu ekipman için henüz bir masraf kaydı yok.</p>
          ) : (
            <div className="space-y-2">
              {costs.map(cost => (
                <div key={cost.id} className="flex items-center justify-between bg-[#fcfdfc] border border-[#e2e8df] rounded-2xl p-4">
                  <div>
                    <p className="text-sm font-bold text-[#1a2416]">{cost.category}</p>
                    <p className="text-xs text-[#5a6a55]">{cost.description} · {new Date(cost.costDate).toLocaleDateString("tr-TR")}</p>
                  </div>
                  <p className="text-sm font-bold text-[#1a2416]">{cost.amount.toLocaleString("tr-TR")} TL</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
