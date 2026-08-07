/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { classifyFetchOutcome, ProductAnalysisErrorKind } from "./useProductAnalysis";
import { ProductCreateFormValues } from "./useProductCreateFromAnalysis";

/**
 * Sprint 8 — Product Capture Session akışı.
 *
 * NOT (dürüstçe belirtiliyor): Backend, analiz ve kayıt için İKİ AYRI,
 * senkron istek kullanıyor (bkz. product-capture-session.service.ts,
 * "stateless tasarım" gerekçesi) — dosya başına GERÇEK, granüler bir
 * arka plan ilerleme sinyali (örn. WebSocket/SSE) YOK. Bu yüzden
 * aşağıdaki "Bekliyor/Analiz ediliyor/İşleniyor/İndeksleniyor/Hazır"
 * durumları, bu İKİ isteğin YAŞAM DÖNGÜSÜNE göre SENTETİK olarak
 * hesaplanıyor — her dosya için ayrı bir backend olayı DİNLENMİYOR. Bu,
 * "yeni bir gerçek zamanlı altyapı icat etme" riskinden kaçınan, bilinçli
 * bir basitleştirmedir.
 */
export type CaptureFileStatus = "waiting" | "analyzing" | "processing" | "indexing" | "ready" | "failed";

export interface CaptureFileEntry {
  file: File;
  kind: "photo" | "document";
  documentCategory?: string;
  status: CaptureFileStatus;
  errorMessage?: string;
}

export type CaptureSessionPhase = "idle" | "analyzing" | "reviewing" | "saving" | "saved" | "error";

export interface CaptureAnalysisSummary {
  description: string;
  confidence: number;
  structuredExtraction: Record<string, unknown>;
}

export function useProductCaptureSession() {
  const [phase, setPhase] = useState<CaptureSessionPhase>("idle");
  const [entries, setEntries] = useState<CaptureFileEntry[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState<CaptureAnalysisSummary | null>(null);
  const [saveResult, setSaveResult] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ProductAnalysisErrorKind | null>(null);

  const addPhotos = useCallback((files: File[]) => {
    setEntries((prev) => [...prev, ...files.map((file): CaptureFileEntry => ({ file, kind: "photo", status: "waiting" }))]);
  }, []);

  const addDocuments = useCallback((files: File[], category?: string) => {
    setEntries((prev) => [...prev, ...files.map((file): CaptureFileEntry => ({ file, kind: "document", documentCategory: category, status: "waiting" }))]);
  }, []);

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setEntries([]);
    setAnalysisSummary(null);
    setSaveResult(null);
    setErrorMessage("");
    setErrorKind(null);
  }, []);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("agri_token") || ""}` });

  const analyze = useCallback(async () => {
    const photoEntries = entries.filter((e) => e.kind === "photo");
    if (photoEntries.length === 0) {
      setPhase("error");
      setErrorKind("invalid-file");
      setErrorMessage("En az bir fotoğraf seçmelisiniz.");
      return;
    }

    setPhase("analyzing");
    setEntries((prev) => prev.map((e) => (e.kind === "photo" ? { ...e, status: "analyzing" } : e)));

    try {
      const formData = new FormData();
      photoEntries.forEach((e) => formData.append("photos", e.file));

      const res = await fetch("/api/products/capture-session/analyze", { method: "POST", headers: authHeader(), body: formData });
      const data = await res.json();

      if (!res.ok) {
        const classified = classifyFetchOutcome(false, false, data?.error || "Analiz başarısız.", null);
        setPhase("error");
        setErrorKind(classified.kind);
        setErrorMessage(classified.message);
        setEntries((prev) => prev.map((e) => (e.kind === "photo" ? { ...e, status: "failed" } : e)));
        return;
      }

      setAnalysisSummary({ description: data.description, confidence: data.confidence, structuredExtraction: data.structuredExtraction ?? {} });
      // DÜZELTME (2. tur — GERÇEK kök neden): Türkçe/özel karakter içeren
      // dosya adları multipart upload'ta bozulabildiği için isim eşleştirmesi
      // (fr.fileName === e.file.name) güvenilmezdi — bu YİNE DOĞRU bir
      // tespitti. AMA ilk düzeltmemde `photoIndex` sayacı setEntries
      // ÇAĞRISININ DIŞINDA tanımlanmıştı — React'in functional state updater
      // sözleşmesi, bu fonksiyonun SAF (pure) olmasını, yani DIŞARIDAKİ
      // değişkenleri MUTASYONA UĞRATMAMASINI gerektirir. Bu proje
      // `<StrictMode>` kullanıyor (src/main.tsx) — React, geliştirme
      // modunda functional updater'ları YAN ETKİLERİ YAKALAMAK için İKİ KEZ
      // çağırır. İKİNCİ çağrıda `photoIndex` zaten ilerlemiş durumda
      // olduğundan `data.fileResults[photoIndex]` dizinin SONUNU aşıyor,
      // `undefined` dönüyor, TÜM dosyalar "failed" oluyordu — gerçek
      // simülasyonla kanıtlandı (bkz. sprint sonu raporu).
      //
      // GERÇEK DÜZELTME: sayaç, updater'ın GÖVDESİNİN İÇİNDE tanımlanır —
      // her çağrıda (StrictMode ister 1 kez ister 2 kez çağırsın) SIFIRDAN
      // başlar, updater artık tamamen SAF, sonuç HER ZAMAN aynı ve doğru.
      setEntries((prev) => {
        let photoIndex = 0;
        return prev.map((e) => {
          if (e.kind !== "photo") return e;
          const fileResult = (data.fileResults || [])[photoIndex];
          photoIndex++;
          return fileResult?.status === "analyzed" ? { ...e, status: "ready" } : { ...e, status: "failed", errorMessage: fileResult?.errorMessage };
        });
      });
      setPhase("reviewing");
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      const classified = classifyFetchOutcome(false, isNetwork, null, err instanceof Error ? err.message : null);
      setPhase("error");
      setErrorKind(classified.kind);
      setErrorMessage(classified.message);
    }
  }, [entries]);

  const save = useCallback(
    async (confirmedRequest: ProductCreateFormValues) => {
      setPhase("saving");
      setEntries((prev) => prev.map((e) => (e.kind === "document" ? { ...e, status: "processing" } : e)));

      try {
        const formData = new FormData();
        formData.append("product", JSON.stringify(confirmedRequest));
        const documentEntries = entries.filter((e) => e.kind === "document");
        formData.append("documentCategories", JSON.stringify(documentEntries.map((e) => e.documentCategory || "")));
        entries.filter((e) => e.kind === "photo").forEach((e) => formData.append("photos", e.file));
        documentEntries.forEach((e) => formData.append("documents", e.file));

        setEntries((prev) => prev.map((e) => (e.kind === "document" ? { ...e, status: "indexing" } : e)));

        const res = await fetch("/api/products/capture-session/save", { method: "POST", headers: authHeader(), body: formData });
        const data = await res.json();

        if (!res.ok) {
          const classified = classifyFetchOutcome(false, false, data?.error || "Kayıt başarısız.", null);
          setPhase("error");
          setErrorKind(classified.kind);
          setErrorMessage(classified.message);
          return;
        }

        setSaveResult(data);
        setEntries((prev) => prev.map((e) => ({ ...e, status: "ready" })));
        setPhase("saved");
      } catch (err) {
        const isNetwork = err instanceof TypeError;
        const classified = classifyFetchOutcome(false, isNetwork, null, err instanceof Error ? err.message : null);
        setPhase("error");
        setErrorKind(classified.kind);
        setErrorMessage(classified.message);
      }
    },
    [entries]
  );

  return { phase, entries, analysisSummary, saveResult, errorMessage, errorKind, addPhotos, addDocuments, removeEntry, analyze, save, reset };
}
