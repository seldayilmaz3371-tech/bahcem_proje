/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Plus, X, Trees, Trash2, Info, Star, ShieldCheck, AlertTriangle, Camera, RefreshCw } from "lucide-react";
import { Parcel, Tree, ParcelHealthSummary } from "../../types";
import { useCreateObservation } from "../../hooks/useCreateObservation";

interface TreeManagerProps {
  parcel: Parcel;
  trees: Tree[];
  healthSummary: ParcelHealthSummary | null;
  plantLabel: string;
  onTreesChanged: () => void;
  onHealthSummaryChanged: () => void;
}

/**
 * Individual tree/plant management: the add-tree form, the deterministic
 * "Referans Ağaç" health summary card, and the tree grid (reference
 * toggle, one-tap quick photo, delete) — extracted from ParcelManager.tsx
 * (see TreeCountManager.tsx for the full rationale behind this split).
 */
export default function TreeManager({ parcel, trees, healthSummary, plantLabel, onTreesChanged, onHealthSummaryChanged }: TreeManagerProps) {
  const [showTreeForm, setShowTreeForm] = useState(false);
  const [treeNumber, setTreeNumber] = useState("");
  const [treeVariety, setTreeVariety] = useState(parcel.cropType === "Zeytin" ? "Sarıulak" : "");
  const [plantingYear, setPlantingYear] = useState("2016");
  const [treeNotes, setTreeNotes] = useState("");
  const [error, setError] = useState("");
  const [uploadingPhotoForTreeId, setUploadingPhotoForTreeId] = useState<string | null>(null);
  const { createObservation } = useCreateObservation();

  const handleAddTree = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!treeNumber) {
      setError("Ağaç referans numarası zorunludur.");
      return;
    }

    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/parcels/${parcel.id}/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ treeNumber, variety: treeVariety, plantingYear, notes: treeNotes })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ağaç kaydı eklenemedi.");
      }

      setTreeNumber("");
      setTreeNotes("");
      setShowTreeForm(false);
      onTreesChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteTree = async (treeId: string) => {
    if (!window.confirm("Bu ağaç kaydını sistemden silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      const res = await fetch(`/api/trees/${treeId}`, { method: "DELETE", headers });

      if (res.ok) {
        onTreesChanged();
        onHealthSummaryChanged();
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Toggles a tree's "Referans Ağaç" (reference tree) status. Reference
   * trees receive closer photo-based monitoring and stand in for the
   * whole parcel's condition (see ParcelHealthSummary) without requiring
   * every tree in a large parcel to be individually AI-analyzed.
   */
  const handleToggleReferenceTree = async (tree: Tree) => {
    try {
      const headers = {
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };
      const res = await fetch(`/api/trees/${tree.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ isReferenceTree: !tree.isReferenceTree })
      });

      if (res.ok) {
        onTreesChanged();
        onHealthSummaryChanged();
      }
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * One-tap photo shortcut directly from a tree's card — the most
   * frequent action for a "Referans Ağaç" (reference tree), which
   * benefits from close, up-to-date photo monitoring. Deliberately reuses
   * the existing observation-create and photo-upload endpoints rather
   * than introducing a new creation route. If the tree is a reference
   * tree, the server analyzes the photo immediately (see server.ts's
   * upload-photo route); the health summary is refreshed afterward.
   */
  const handleQuickTreePhoto = (tree: Tree) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // Allow re-selecting the same file consecutively
    if (!file) return;

    setUploadingPhotoForTreeId(tree.id);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const observationPayload = {
          parcelId: parcel.id,
          treeId: tree.id,
          activityType: "Genel Gözlem",
          notes: `${tree.treeNumber} için hızlı ağaç fotoğrafı.`
        };

        const result = await createObservation(observationPayload, reader.result as string);

        if (!result.queued) {
          // Refresh the reference-tree health summary, since a
          // reference-tree photo may have just been analyzed.
          onHealthSummaryChanged();
        }
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Fotoğraf eklenirken bir hata oluştu.");
      } finally {
        setUploadingPhotoForTreeId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button
          id="add-tree-btn"
          onClick={() => setShowTreeForm(!showTreeForm)}
          className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#556b2f] bg-[#f0f4ee] rounded-xl hover:bg-[#e4ebdf] transition-all"
        >
          {showTreeForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span>{showTreeForm ? "Kapat" : `Yeni ${plantLabel} Tanımla`}</span>
        </button>
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
              {parcel.cropType === "Zeytin" ? (
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
                  placeholder={parcel.cropType === "Sebze" ? "Örn: Domates - Pembe Çeri" : "Örn: Elma - Starking"}
                  className="w-full px-3 py-2 bg-white border border-[#cdd4ca] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Dikim Yılı</label>
              <input
                type="number"
                value={plantingYear}
                onChange={(e) => setPlantingYear(e.target.value)}
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

      {/* Reference Tree Health Summary — deterministic, computed from
          reference trees' latest AI analyses. Never calls Gemini itself;
          see growth-scoring.util.ts. */}
      {healthSummary && healthSummary.referenceTreeCount > 0 && (
        <div className={`rounded-2xl border p-4 space-y-2 ${
          healthSummary.overallStatus === "Riskli Bölgeler Var"
            ? "bg-red-50 border-red-200"
            : healthSummary.overallStatus === "Sağlıklı"
            ? "bg-emerald-50 border-emerald-200"
            : "bg-stone-50 border-stone-200"
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              {healthSummary.overallStatus === "Riskli Bölgeler Var" ? (
                <AlertTriangle className="h-4 w-4 text-red-600" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              )}
              Referans Ağaç Durumu: {healthSummary.overallStatus}
            </h3>
            <span className="text-[10px] text-[#80907a] font-mono">
              {healthSummary.analyzedTreeCount}/{healthSummary.referenceTreeCount} referans {plantLabel.toLowerCase()} analiz edildi
            </span>
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="text-emerald-700 font-semibold">✓ Sağlıklı: {healthSummary.healthyCount}</span>
            <span className="text-red-700 font-semibold">⚠ Riskli: {healthSummary.atRiskCount}</span>
            <span className="text-stone-500 font-semibold">? Belirsiz: {healthSummary.uncertainCount}</span>
            {healthSummary.averageHealthScore !== null && (
              <span className="text-[#5a6a55] font-semibold">Ortalama Sağlık: {healthSummary.averageHealthScore}/100</span>
            )}
          </div>
          <p className="text-[10px] text-[#80907a] italic">
            Bu özet, sadece &quot;Referans Ağaç&quot; olarak işaretlediğiniz {plantLabel.toLowerCase()}lerin en son fotoğraf analizinden hesaplanır — yapay zekaya tekrar sorulmaz, anlık ve ücretsizdir.
          </p>
        </div>
      )}

      {/* Tree Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-bold text-[#80907a] uppercase tracking-wider">{plantLabel} Haritası & Sağlık Durumları ({trees.length} {plantLabel})</h3>
          <p className="text-[10px] text-[#80907a] italic">
            <Star className="h-3 w-3 inline mb-0.5" /> ile işaretlenenler &quot;Referans {plantLabel}&quot; — parselin genel durumu bunlardan hesaplanır.
          </p>
        </div>

        {trees.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {trees.map((tree) => (
              <div id={`tree-card-${tree.id}`} key={tree.id} className={`bg-[#f7f9f6] border p-4 rounded-2xl relative group hover:border-[#556b2f]/30 transition-all flex flex-col justify-between ${
                tree.isReferenceTree ? "border-amber-300 ring-1 ring-amber-200" : "border-[#e2e8df]"
              }`}>
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <label
                    id={`quick-photo-btn-${tree.id}`}
                    title="Bu ağaca hızlıca fotoğraf ekle"
                    aria-label="Ağaca hızlı fotoğraf ekle"
                    className={`p-1.5 rounded-lg cursor-pointer transition-colors flex items-center justify-center ${
                      uploadingPhotoForTreeId === tree.id
                        ? "bg-[#556b2f]/10 text-[#556b2f]"
                        : "bg-white/70 text-[#a3a99e] hover:bg-[#f0f4ee] hover:text-[#556b2f]"
                    }`}
                  >
                    {uploadingPhotoForTreeId === tree.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleQuickTreePhoto(tree)}
                      disabled={uploadingPhotoForTreeId === tree.id}
                      className="hidden"
                    />
                  </label>
                  <button
                    id={`reference-tree-btn-${tree.id}`}
                    onClick={() => handleToggleReferenceTree(tree)}
                    title={tree.isReferenceTree ? "Referans ağaç işaretini kaldır" : "Bu ağacı referans ağaç olarak işaretle"}
                    aria-label="Referans ağaç işaretle/kaldır"
                    className={`p-1.5 rounded-lg transition-colors ${
                      tree.isReferenceTree
                        ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                        : "bg-white/70 text-[#a3a99e] hover:bg-amber-50 hover:text-amber-500"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" fill={tree.isReferenceTree ? "currentColor" : "none"} />
                  </button>
                  <button
                    id={`delete-tree-btn-${tree.id}`}
                    onClick={() => handleDeleteTree(tree.id)}
                    title={`Bu ${plantLabel.toLowerCase()} kaydını sil`}
                    aria-label={`${plantLabel} kaydını sil`}
                    className="p-1.5 rounded-lg bg-white/70 text-[#a3a99e] hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-[#80907a]">NO:</span>
                  <p className="text-sm font-bold text-[#1a2416] font-mono">{tree.treeNumber}</p>
                  {tree.isReferenceTree && (
                    <span className="inline-block text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Referans {plantLabel}</span>
                  )}
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
  );
}
