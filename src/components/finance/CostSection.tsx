/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, TrendingDown, Trash2, RefreshCw } from "lucide-react";
import { Cost, Parcel } from "../../types";

interface CostSectionProps {
  costs: Cost[];
  parcels: Parcel[];
  /** Called after a successful add or delete, so the parent can refetch shared data (e.g. the aggregate ROI summary depends on this list). */
  onDataChanged: () => void;
  getParcelName: (id: string) => string;
}

/**
 * Cost (expense) management: the "Gider Kaydı Gir" form and the costs
 * ledger list, together — extracted from FinanceManager.tsx, which had
 * grown to manage three unrelated entities (Cost, Sale, Harvest) in a
 * single 915-line file, violating Single Responsibility.
 *
 * Owns its own form/error/deleting state rather than sharing a single
 * error/saving/deletingId across all three entities as the original
 * component did — this was itself a minor coupling issue in the
 * original design (a Sale deletion error could not be distinguished
 * from a Cost deletion error). Each section is now fully independent.
 */
export default function CostSection({ costs, parcels, onDataChanged, getParcelName }: CostSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Gübreleme");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [parcelId, setParcelId] = useState("");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const handleAddCost = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!amount || !category || !date) {
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
          parcelId: parcelId || undefined,
          amount,
          category,
          costDate: date,
          description
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Gider kaydedilemedi.");
      }

      setAmount("");
      setDescription("");
      setShowForm(false);
      onDataChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deletes a single expense/cost record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
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

      onDataChanged();
    } catch (err: any) {
      setDeleteError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <button
        id="new-cost-btn"
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#8b263e] bg-red-50 hover:bg-red-100/80 rounded-2xl border border-red-200 transition-all"
      >
        <Plus className="h-4 w-4" />
        <span>Gider Kaydı Gir</span>
      </button>

      {showForm && (
        <form onSubmit={handleAddCost} className="bg-[#fcfdfc] p-6 rounded-3xl border border-red-200 space-y-4 max-w-3xl animate-slide-up">
          <h3 className="text-sm font-bold text-red-900 flex items-center gap-1"><TrendingDown className="h-4 w-4" /> Yeni Gider Masraf Kaydı</h3>
          {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Tutar (TL)</label>
              <input
                type="number"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Örn: 1500"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Masraf Kategorisi</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">İlgili Parsel (Opsiyonel)</label>
              <select
                value={parcelId}
                onChange={(e) => setParcelId(e.target.value)}
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Hektaş göztaşı ilacı alımı faturası..."
              className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-red-600"
            />
          </div>

          <button type="submit" disabled={saving} className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white font-bold rounded-2xl text-xs transition-colors">
            Kaydet
          </button>
        </form>
      )}

      {deleteError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded-2xl">{deleteError}</p>
      )}

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
    </>
  );
}
