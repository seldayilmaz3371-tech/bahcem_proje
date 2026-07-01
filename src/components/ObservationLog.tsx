/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Eye, 
  Plus, 
  MapPin, 
  Camera, 
  Mic, 
  MicOff, 
  Volume2, 
  Image as ImageIcon, 
  X, 
  User as UserIcon, 
  Calendar,
  AlertCircle,
  RefreshCw,
  Clock
} from "lucide-react";
import { Observation, Parcel, Tree, Photo } from "../types";

export default function ObservationLog() {
  const [observations, setObservations] = useState<Observation[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [selectedParcelId, setSelectedParcelId] = useState("");
  const [selectedTreeId, setSelectedTreeId] = useState("");
  const [notes, setNotes] = useState("");
  
  // Photo Simulation
  const [base64Photo, setBase64Photo] = useState<string | null>(null);
  
  // Audio Note Simulation
  const [isRecording, setIsRecording] = useState(false);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [simulatedAudioPath, setSimulatedAudioPath] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
      
      const [obsRes, photosRes, parcelsRes] = await Promise.all([
        fetch("/api/observations", { headers }),
        fetch("/api/observations/photos", { headers }),
        fetch("/api/parcels", { headers })
      ]);

      if (obsRes.ok) setObservations(await obsRes.ok ? await obsRes.json() : []);
      if (photosRes.ok) setPhotos(await photosRes.ok ? await photosRes.json() : []);
      if (parcelsRes.ok) setParcels(await parcelsRes.ok ? await parcelsRes.json() : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch trees when parcel selection changes
  useEffect(() => {
    if (!selectedParcelId) {
      setTrees([]);
      return;
    }
    const fetchLinkedTrees = async () => {
      try {
        const headers = { "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}` };
        const res = await fetch(`/api/parcels/${selectedParcelId}/trees`, { headers });
        if (res.ok) setTrees(await res.json());
      } catch (err) {
        console.error(err);
      }
    };
    fetchLinkedTrees();
  }, [selectedParcelId]);

  // Handle Photo Import / simulation
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBase64Photo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Simulated Voice Note
  const startRecording = () => {
    setIsRecording(true);
    setRecordedDuration(0);
    timerRef.current = setInterval(() => {
      setRecordedDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setSimulatedAudioPath(`/audio/memos/memo_${Date.now()}.mp3`);
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedParcelId || !notes) {
      setError("Parsel seçimi ve gözlem notları zorunludur.");
      return;
    }

    setSaving(true);
    try {
      const headers = { 
        "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
        "Content-Type": "application/json"
      };

      // 1. Create Observation Log
      const obsRes = await fetch("/api/observations", {
        method: "POST",
        headers,
        body: JSON.stringify({
          parcelId: selectedParcelId,
          treeId: selectedTreeId || undefined,
          notes,
          audioNotePath: simulatedAudioPath || undefined
        })
      });

      const obsData = await obsRes.json();
      if (!obsRes.ok) {
        throw new Error(obsData.error || "Gözlem kaydedilemedi.");
      }

      // 2. If photo is uploaded, post it to photo endpoint
      if (base64Photo) {
        const photoRes = await fetch("/api/observations/upload-photo", {
          method: "POST",
          headers,
          body: JSON.stringify({
            observationId: obsData.id,
            base64Data: base64Photo,
            label: "Saha Gözlemi Görseli"
          })
        });
        if (!photoRes.ok) {
          console.error("Gözlem fotoğrafı yüklenemedi.");
        }
      }

      // Reset
      setSelectedParcelId("");
      setSelectedTreeId("");
      setNotes("");
      setBase64Photo(null);
      setSimulatedAudioPath(null);
      setShowForm(false);
      
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Helper mapping helper functions
  const getParcelName = (id: string) => parcels.find(p => p.id === id)?.name || "Bilinmeyen Parsel";
  const getTreeNumber = (id: string) => trees.find(t => t.id === id)?.treeNumber || "Genel Gözlem";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 py-24">
        <RefreshCw className="h-8 w-8 text-[#556b2f] animate-spin" />
        <span className="text-sm font-medium text-[#5a6a55]">Saha gözlem hafızası yükleniyor...</span>
      </div>
    );
  }

  return (
    <div id="observation-log-tab" className="p-8 max-w-7xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#1a2416] tracking-tight">Saha Gözlem Hafızası</h1>
          <p className="text-sm text-[#5a6a55] mt-1">
            Gelişmiş fotoğraf koordinat analizi ve sesli not destekli anlık arazi gözlem kayıtları
          </p>
        </div>
        <button
          id="add-observation-btn"
          onClick={() => setShowForm(!showForm)}
          className="self-start flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#556b2f] hover:bg-[#415324] rounded-2xl transition-all shadow-sm"
        >
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{showForm ? "Vazgeç" : "Saha Gözlemi Ekle"}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-[#fcfdfc] p-6 rounded-3xl border border-[#e2e8df] space-y-5 max-w-3xl animate-slide-up shadow-sm">
          <h2 className="text-md font-bold text-[#1a2416]">Yeni Saha Gözlem Kaydı</h2>
          {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Gözlem Yapılan Parsel</label>
              <select
                value={selectedParcelId}
                onChange={(e) => setSelectedParcelId(e.target.value)}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
              >
                <option value="">Parsel Seçin</option>
                {parcels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Bağlantılı Ağaç (İsteğe Bağlı)</label>
              <select
                value={selectedTreeId}
                onChange={(e) => setSelectedTreeId(e.target.value)}
                disabled={!selectedParcelId}
                className="w-full px-4 py-2.5 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f] disabled:opacity-50"
              >
                <option value="">Genel Gözlem (Tüm Parsel)</option>
                {trees.map(t => (
                  <option key={t.id} value={t.id}>{t.treeNumber} ({t.variety})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider mb-1">Gözlem Notları ve Teşhis</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn: Yapraklarda lekeler (halkalı leke şüphesi) tespit edildi, ağaçta gelişme geriliği gözlemlendi..."
              className="w-full px-4 py-3 bg-white border border-[#cdd4ca] rounded-2xl text-sm focus:ring-2 focus:ring-[#556b2f]"
            />
          </div>

          {/* Multimedia Upload Elements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-[#f0f4ee]">
            {/* Image Upload Simulator */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider">Fotoğraf Kaydet (EXIF GPS Simülatörlü)</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 px-4 py-2.5 bg-[#f0f4ee] hover:bg-[#e4ebdf] text-[#556b2f] text-xs font-bold rounded-xl cursor-pointer transition-all border border-[#dee5db]">
                  <Camera className="h-4 w-4" />
                  <span>Fotoğraf Seç</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                </label>

                {base64Photo && (
                  <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-[#cdd4ca]">
                    <img src={base64Photo} alt="Preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setBase64Photo(null)}
                      className="absolute top-0 right-0 p-0.5 bg-black/60 text-white rounded-bl"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-[#80907a] italic">
                Fotoğraf yüklendiğinde Mersin Değirmençay koordinatları (EXIF GPS verisi) otomatik eklenir.
              </p>
            </div>

            {/* Audio Memo Simulator */}
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[#5a6a55] uppercase tracking-wider">Sesli Arazi Notu</span>
              <div className="flex items-center gap-4">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#f0f4ee] hover:bg-[#e4ebdf] text-[#556b2f] text-xs font-bold rounded-xl transition-all border border-[#dee5db]"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Ses Kaydını Başlat</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold rounded-xl transition-all border border-red-200 animate-pulse"
                  >
                    <MicOff className="h-4 w-4" />
                    <span>Durdur ({formatDuration(recordedDuration)})</span>
                  </button>
                )}

                {simulatedAudioPath && (
                  <div className="flex items-center gap-1.5 bg-[#f0f4ee] px-3 py-1.5 rounded-lg text-xs font-mono text-[#556b2f] border border-[#dee5db]">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>SesliNot.mp3</span>
                    <button type="button" onClick={() => setSimulatedAudioPath(null)} className="text-[#80907a] hover:text-red-600 ml-1">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-[#556b2f] text-white font-bold rounded-2xl text-xs hover:bg-[#415324] transition-all disabled:opacity-50"
          >
            {saving ? "Gözlem Hafızaya Kaydediliyor..." : "Gözlem Raporunu Kaydet"}
          </button>
        </form>
      )}

      {/* Observation History Feed */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-[#5a6a55] uppercase tracking-wider">Geçmiş Saha Günlükleri ve Teşhisler</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {observations.length > 0 ? (
            observations.map((obs) => {
              // Find matching photo
              const obsPhoto = photos.find(p => p.observationId === obs.id);
              return (
                <div id={`obs-card-${obs.id}`} key={obs.id} className="bg-[#fcfdfc] border border-[#e2e8df] rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-xs bg-[#f0f4ee] text-[#556b2f] px-2.5 py-1 rounded-full font-bold">
                        {getParcelName(obs.parcelId)}
                      </span>
                      <span className="text-[10px] font-mono text-[#80907a] flex items-center gap-0.5">
                        <Calendar className="h-3 w-3" />
                        {new Date(obs.observationDate).toLocaleDateString("tr-TR")}
                      </span>
                    </div>

                    <p className="text-xs text-[#1a2416] leading-relaxed font-medium">
                      {obs.notes}
                    </p>

                    {obs.treeId && (
                      <div className="text-[11px] font-mono bg-stone-100 text-[#556b2f] px-2 py-0.5 rounded inline-block">
                        Ağaç Referans: <span className="font-bold">{obs.treeId}</span>
                      </div>
                    )}
                  </div>

                  {/* Display simulated Photo & EXIF coordinates */}
                  {obsPhoto && (
                    <div className="rounded-2xl overflow-hidden border border-[#e2e8df] relative group">
                      <img src={obsPhoto.originalUrl} alt="Field observation" className="w-full h-40 object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-[10px] font-mono text-[#f1f5f0] flex justify-between">
                        <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3 text-red-400" /> {obsPhoto.latitude}, {obsPhoto.longitude}</span>
                        <span>Mersin, Toroslar</span>
                      </div>
                    </div>
                  )}

                  {/* Audio memo display */}
                  {obs.audioNotePath && (
                    <div className="flex items-center gap-2 bg-[#f0f4ee] p-2.5 rounded-xl border border-[#dee5db]">
                      <Volume2 className="h-4 w-4 text-[#556b2f]" />
                      <div className="flex-1">
                        <p className="text-[10px] font-bold text-[#1a2416]">Sesli Tarla Notu</p>
                        <p className="text-[9px] text-[#80907a] font-mono">0:24 Dakika • MP3</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center border-2 border-dashed border-[#e2e8df] rounded-3xl col-span-3 bg-[#fcfdfc]">
              <Eye className="h-10 w-10 text-[#80907a] mx-auto mb-2" />
              <p className="text-xs text-[#5a6a55] italic">Kayıtlı saha gözlem raporu bulunmamaktadır.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
