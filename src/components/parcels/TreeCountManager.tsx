/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Edit3, X, History, TrendingUp, TrendingDown } from "lucide-react";
import { Parcel, TreeCountChangeLog, TreeCountChangeReason } from "../../types";

interface TreeCountManagerProps {
  parcel: Parcel;
  treeCountChanges: TreeCountChangeLog[];
  plantLabel: string;
  /** Called after a successful count change with the new count, so the parent can keep its selected-parcel state in sync without a full refetch. */
  onCountChanged: (newCount: number) => void;
  /** Called after a successful count change so the parent can refresh the change-history list and parcel list badges. */
  onDataChanged: () => void;
}

/**
 * Manual tree/plant count change: the "Güncel Sayı" card, its update form,
 * and the change history log — extracted from ParcelManager.tsx, which
 * had grown to manage Parcel CRUD, this count-change workflow, and full
 * individual tree management (including Reference Trees and quick photo
 * upload) all in a single ~980-line file, violating Single Responsibility.
 */
export default function TreeCountManager({ parcel, treeCountChanges, plantLabel, onCountChanged, onDataChanged }: TreeCountManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [newCount, setNewCount] = useState("");
  const [reason, setReason] = useState<TreeCountChangeReason>("Dikim (Yeni Ekim)");
  const [notes, setNotes] = useState("");
  const [changeDate, setChangeDate] = useState(new Date().toISOString().split("T")[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAddTreeCountChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newCount === "") {
      setError("Yeni sayı zorunludur.");
      return;
    }
    const parsedNewCount = parseInt(newCount, 10);
    if (isNaN(parsedNewCount) || parsedNewCount < 0) {
      setError("Yeni sayı sıfır veya pozitif bir tam sayı olmalıdır.");
      return;
    }
    if (parsedNewCount === parcel.treeCount) {
      setError(`Yeni sayı, mevcut sayıyla (${parcel.treeCount}) aynı. Değişiklik kaydı oluşturmak için farklı bir değer girin.`);
      return;
    }

    setSaving(true);
    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/parcels/${parcel.id}/tree-count-changes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ newCount: parsedNewCount, reason, notes, changeDate })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sayı değişikliği kaydedilemedi.");
      }

      setNewCount("");
      setNotes("");
      setReason("Dikim (Yeni Ekim)");
      setChangeDate(new Date().toISOString().split("T")[0]);
      setShowForm(false);

      onCountChanged(parsedNewCount);
      onDataChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#f7f9f6] border border-[#e2e8df] rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-[#80907a] uppercase tracking-wider">Güncel {plantLabel} Sayısı</h3>
          <p className="text-2xl font-bold font-display text-[#1a2416] mt-0.5">
            {parcel.treeCount} <span className="text-xs font-normal text-[#5a6a55]">{plantLabel}</span>
          </p>
        </div>
        <button
          id="update-tree-count-btn"
          onClick={() => { setShowForm(!showForm); setError(""); }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all shadow-sm self-start"
        >
          {showForm ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
          <span>{showForm ? "Kapat" : "Sayıyı Güncelle"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAddTreeCountChange} className="border-t border-[#e2e8df] pt-4 space-y-4 animate-slide-up">
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Yeni {plantLabel} Sayısı</label>
              <input
                type="number"
                min="0"
                step="1"
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
                placeholder={String(parcel.treeCount)}
                className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Değişiklik Nedeni</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as TreeCountChangeReason)}
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Kuzey sırada 5 yeni fide dikildi."
              className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
            />
          </div>

          <p className="text-[10px] text-[#80907a] italic leading-relaxed">
            Not: Bu değişiklik, geçmiş hasat ve verim raporlarını yeniden hesaplamaz — geçmiş kayıtlar o dönemki değerleriyle sabit kalır. Ayrıca, &quot;Yeni {plantLabel} Tanımla&quot; ile tekil kayıt eklemeye/silmeye devam ederseniz, sayı otomatik olarak gerçek kayıt adedine göre güncellenmeye devam eder.
          </p>

          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-bold text-white bg-[#556b2f] hover:bg-[#415324] rounded-xl transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? "Kaydediliyor..." : "Değişikliği Kaydet"}
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
  );
}
