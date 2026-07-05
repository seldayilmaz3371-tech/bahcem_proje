/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, TrendingUp, Award, Trash2, RefreshCw } from "lucide-react";
import { Sale } from "../../types";

interface SaleSectionProps {
  sales: Sale[];
  onDataChanged: () => void;
}

/**
 * Sale (revenue) management: the "Satış Geliri Gir" form and the sales
 * ledger list — extracted from FinanceManager.tsx (see CostSection.tsx
 * for the full rationale behind this split).
 */
export default function SaleSection({ sales, onDataChanged }: SaleSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [productType, setProductType] = useState("Zeytinyağı (Sızma)");
  const [quantityKg, setQuantityKg] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);
  const [isOrganik, setIsOrganik] = useState(false);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!quantityKg || !unitPrice || !saleDate) {
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
          productType,
          quantityKg,
          unitPrice,
          buyerName: buyerName || undefined,
          saleDate,
          isOrganikSaglikBrand: isOrganik
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Satış kaydedilemedi.");
      }

      setQuantityKg("");
      setUnitPrice("");
      setBuyerName("");
      setIsOrganik(false);
      setShowForm(false);
      onDataChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Deletes a single sale/revenue record after user confirmation. Used to
   * correct a wrong amount or any other mistakenly entered information.
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
        id="new-sale-btn"
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#1c6446] bg-emerald-50 hover:bg-emerald-100/80 rounded-2xl border border-emerald-200 transition-all"
      >
        <Plus className="h-4 w-4" />
        <span>Zeytin/Yağ Satış Geliri Gir</span>
      </button>

      {showForm && (
        <form onSubmit={handleAddSale} className="bg-[#fcfdfc] p-6 rounded-3xl border border-emerald-200 space-y-4 max-w-3xl animate-slide-up">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center gap-1"><TrendingUp className="h-4 w-4" /> Yeni Satış Gelir Kaydı</h3>
          {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Ürün Türü</label>
              <select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
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
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                placeholder="Örn: 250"
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] mb-1">Birim Fiyat (TL/Kg)</label>
              <input
                type="number"
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
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

      {deleteError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 p-3 rounded-2xl">{deleteError}</p>
      )}

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
    </>
  );
}
