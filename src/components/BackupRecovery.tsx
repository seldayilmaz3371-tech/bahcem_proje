/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Archive, RefreshCw, Plus, ShieldCheck, ShieldAlert, RotateCcw, Download, Upload, Clock, User } from "lucide-react";

interface BackupCheckpoint {
  id: string;
  label: string;
  createdBy: string;
  createdAt: string;
  fileSizeBytes: number;
  checksum: string;
}

/** Bayt cinsinden boyutu okunabilir bir metne (KB/MB) çevirir. */
function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function BackupRecovery() {
  const [checkpoints, setCheckpoints] = useState<BackupCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [verifyResults, setVerifyResults] = useState<Record<string, { valid: boolean; reason?: string }>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const authHeaders = () => ({ "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` });

  const fetchCheckpoints = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/backup/checkpoints", { headers: authHeaders() });
      if (res.ok) setCheckpoints(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCheckpoints();
  }, []);

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!newLabel.trim()) {
      setError("Checkpoint için bir açıklama girmelisiniz.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/backup/checkpoints", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Checkpoint oluşturulamadı.");
      }
      setNewLabel("");
      fetchCheckpoints();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    try {
      const res = await fetch(`/api/backup/checkpoints/${id}/verify`, { headers: authHeaders() });
      const data = await res.json();
      setVerifyResults((prev) => ({ ...prev, [id]: data }));
    } catch (err: any) {
      setVerifyResults((prev) => ({ ...prev, [id]: { valid: false, reason: "Doğrulama isteği başarısız oldu." } }));
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRestore = async (checkpoint: BackupCheckpoint) => {
    const confirmed = confirm(
      `"${checkpoint.label}" checkpoint'ine geri dönmek istediğinize emin misiniz?\n\nBu işlem MEVCUT verilerinizin üzerine yazacak. Geri dönmeden önce mevcut durumunuzun otomatik bir güvenlik yedeği alınacak.`
    );
    if (!confirmed) return;

    setRestoringId(checkpoint.id);
    setError("");
    try {
      const res = await fetch(`/api/backup/checkpoints/${checkpoint.id}/restore`, {
        method: "POST",
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Geri yükleme başarısız oldu.");
      }
      alert("Geri yükleme tamamlandı. Sayfa şimdi yenilenecek.");
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setRestoringId(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", `İçe aktarılan: ${file.name}`);

      const res = await fetch("/api/backup/checkpoints/import", {
        method: "POST",
        headers: authHeaders(),
        body: formData
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "İçe aktarma başarısız oldu.");
      }
      fetchCheckpoints();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const [exportingId, setExportingId] = useState<string | null>(null);

  /**
   * Kök neden düzeltmesi: önceki sürüm `<a href="...">` kullanıyordu —
   * tarayıcının kendi native navigasyonuyla giden bu istek, `localStorage`
   * tabanlı `Authorization` header'ımızı HİÇ İÇERMİYORDU (bu proje cookie
   * tabanlı oturum kullanmıyor, `<a>` etiketleri özel header ekleyemez).
   * Bu yüzden backend'in `requireAuth` middleware'i isteği reddediyordu —
   * kullanıcı gerçekten giriş yapmış olsa bile. Çözüm: kimlik doğrulamalı
   * bir `fetch()` isteği yapıp, cevabı `blob` olarak alıp, tarayıcıya
   * programatik olarak indirtmek.
   */
  const handleExport = async (checkpoint: BackupCheckpoint) => {
    setExportingId(checkpoint.id);
    setError("");
    try {
      const res = await fetch(`/api/backup/checkpoints/${checkpoint.id}/download`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Dışa aktarma başarısız oldu.");
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${checkpoint.label.replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ_ -]/g, "_")}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExportingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Yedekleme kayıtları yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="backup-recovery-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Yedekleme & Geri Yükleme</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Manuel checkpoint oluşturma, bütünlük doğrulama ve güvenli geri yükleme
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#556b2f] border border-[#556b2f] rounded-2xl hover:bg-[#556b2f]/5 transition-all cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>{importing ? "İçe aktarılıyor..." : "İçe Aktar"}</span>
            <input type="file" accept=".json" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <button
            onClick={fetchCheckpoints}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#556b2f] border border-[#556b2f] rounded-2xl hover:bg-[#556b2f]/5 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Yenile</span>
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

      {/* Manuel Checkpoint Oluşturma */}
      <form onSubmit={handleCreateCheckpoint} className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm space-y-3">
        <h3 className="text-sm font-bold text-[#1a2416] flex items-center gap-1.5"><Plus className="h-4 w-4" /> Manuel Yedek Oluştur</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Açıklama (örn: Sprint 3C öncesi)"
            maxLength={200}
            className="flex-1 px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-5 py-2.5 bg-[#556b2f] text-white text-sm font-bold rounded-2xl hover:bg-[#415324] transition-all disabled:opacity-50"
          >
            {creating ? "Oluşturuluyor..." : "Yedek Oluştur"}
          </button>
        </div>
      </form>

      {/* Checkpoint Listesi */}
      <div className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-[#1a2416] mb-4 flex items-center gap-1.5"><Archive className="h-4 w-4" /> Checkpoint Listesi ({checkpoints.length})</h3>
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {checkpoints.length > 0 ? (
            checkpoints.map((cp) => {
              const verifyResult = verifyResults[cp.id];
              return (
                <div key={cp.id} className="p-4 rounded-2xl bg-[#f7f9f6] border border-[#dee5db]/60 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-[#1a2416]">{cp.label}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#80907a]">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(cp.createdAt).toLocaleString("tr-TR")}</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" /> {cp.createdBy}</span>
                        <span>{formatFileSize(cp.fileSizeBytes)}</span>
                      </div>
                      {verifyResult && (
                        <p className={`text-[10px] font-semibold flex items-center gap-1 ${verifyResult.valid ? "text-emerald-700" : "text-red-600"}`}>
                          {verifyResult.valid ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                          {verifyResult.valid ? "Bütünlük doğrulandı" : verifyResult.reason}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        onClick={() => handleVerify(cp.id)}
                        disabled={verifyingId === cp.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#cdd4ca] text-[#5a6a55] text-[11px] font-bold rounded-xl hover:bg-[#f0f4ee] transition-all disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3 w-3" /> {verifyingId === cp.id ? "..." : "Doğrula"}
                      </button>
                      <button
                        onClick={() => handleExport(cp)}
                        disabled={exportingId === cp.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#cdd4ca] text-[#5a6a55] text-[11px] font-bold rounded-xl hover:bg-[#f0f4ee] transition-all disabled:opacity-50"
                      >
                        <Download className="h-3 w-3" /> {exportingId === cp.id ? "..." : "Dışa Aktar"}
                      </button>
                      <button
                        onClick={() => handleRestore(cp)}
                        disabled={restoringId === cp.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#556b2f] text-white text-[11px] font-bold rounded-xl hover:bg-[#415324] transition-all disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" /> {restoringId === cp.id ? "Geri yükleniyor..." : "Geri Yükle"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center">
              <Archive className="h-10 w-10 text-[#80907a] mx-auto mb-2" />
              <p className="text-xs text-[#5a6a55] italic">Henüz manuel bir checkpoint oluşturulmamış.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
