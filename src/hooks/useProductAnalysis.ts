/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { ProductAnalysisResult } from "../types";

export type ProductAnalysisStatus = "idle" | "loading" | "success" | "error";

/**
 * Farklı hata türlerini ayırt eder (Sprint 7E madde 6: "Ağ hatası, Vision
 * hatası, Geçersiz dosya, Timeout, API hatası ayrı ayrı ele alınsın").
 * Kullanıcıya gösterilecek mesaj her tür için farklıdır; hangi türün
 * oluştuğu bilgisi (test edilebilirlik için) de saklanır.
 */
export type ProductAnalysisErrorKind = "network" | "timeout" | "vision" | "invalid-file" | "api" | "unknown";

const REQUEST_TIMEOUT_MS = 30_000;

export interface ClassifiedError {
  kind: ProductAnalysisErrorKind;
  message: string;
}

/**
 * `analyzePhoto`'nun try/catch/if-not-ok dallarındaki hata sınıflandırma
 * mantığını, REACT'TEN TAMAMEN BAĞIMSIZ, saf bir fonksiyon olarak dışarı
 * çıkarır. Bu proje henüz bir React render-test altyapısına (React
 * Testing Library + jsdom/happy-dom) sahip değil (bkz.
 * `useProductAnalysis.test.ts` üst açıklaması) — yeni bir test
 * altyapısı KURMAK yerine (yeni bağımlılık + vite.config.ts değişikliği
 * gerektirirdi), bu fonksiyonun kendisi doğrudan, DOM/React olmadan
 * test edilebilir hale getirilmiştir. Hook, bu fonksiyonu çağırıp
 * sonucu state'e yazmaktan başka bir şey yapmaz.
 */
export function classifyFetchOutcome(
  abortError: boolean,
  networkError: boolean,
  httpErrorMessage: string | null,
  genericError: string | null
): ClassifiedError {
  if (abortError) {
    return { kind: "timeout", message: "İstek zaman aşımına uğradı. Lütfen tekrar deneyin." };
  }
  if (networkError) {
    return { kind: "network", message: "Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin." };
  }
  if (httpErrorMessage !== null) {
    const isFileValidationError = /yüklenmedi|boş|okunamadı|Desteklenmeyen dosya formatı|büyük/.test(httpErrorMessage);
    return { kind: isFileValidationError ? "invalid-file" : "vision", message: httpErrorMessage };
  }
  return { kind: "unknown", message: genericError || "Beklenmeyen bir hata oluştu." };
}

/**
 * Sprint 7E — Sprint 7D'nin Vision altyapısını (POST /api/ai/product-analysis
 * üzerinden) kullanan, tek-fotoğraflık analiz akışını yöneten hook.
 * Mevcut `useCreateObservation.ts` deseniyle (state/error/localStorage
 * token) tutarlı; yeni bir API çağırma yöntemi icat etmez.
 *
 * Bilinçli olarak HİÇBİR veritabanı yazma işlemi tetiklemez — `approve()`
 * yalnızca yerel (local) bir "onaylandı" durumunu işaretler, hiçbir API
 * çağrısı yapmaz (bkz. Sprint 7E kapsam sınırı — "henüz veritabanına
 * kayıt yapılmaz").
 */
export function useProductAnalysis() {
  const [status, setStatus] = useState<ProductAnalysisStatus>("idle");
  const [result, setResult] = useState<ProductAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ProductAnalysisErrorKind | null>(null);
  const [approved, setApproved] = useState(false);

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
    setErrorKind(null);
    setApproved(false);
  }, []);

  const analyzePhoto = useCallback(async (file: File) => {
    setStatus("loading");
    setErrorMessage("");
    setErrorKind(null);
    setResult(null);
    setApproved(false);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append("photo", file);

      const res = await fetch("/api/ai/product-analysis", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`
          // Kasıtlı olarak Content-Type YOK — tarayıcı, FormData için doğru
          // "multipart/form-data; boundary=..." değerini otomatik ayarlar
          // (bkz. AIRecommendations.tsx'teki aynı gerekçe).
        },
        body: formData,
        signal: controller.signal,
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        // Sunucu 200 dışı bir kodla JSON-olmayan bir gövde döndürdüyse
        // (örn. bir proxy hata sayfası) — bu "API hatası" kategorisidir,
        // "Vision hatası" değil (Vision hiç çalışmamış bile olabilir).
        setStatus("error");
        setErrorKind("api");
        setErrorMessage("Sunucudan geçersiz bir yanıt alındı.");
        return;
      }

      if (!res.ok) {
        const message = (data as { error?: string })?.error || "Analiz gerçekleştirilemedi.";
        const classified = classifyFetchOutcome(false, false, message, null);
        setStatus("error");
        setErrorKind(classified.kind);
        setErrorMessage(classified.message);
        return;
      }

      setResult(data as ProductAnalysisResult);
      setStatus("success");
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const isNetwork = err instanceof TypeError;
      const classified = classifyFetchOutcome(isAbort, isNetwork, null, err instanceof Error ? err.message : null);
      setStatus("error");
      setErrorKind(classified.kind);
      setErrorMessage(classified.message);
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  /** Yalnızca YEREL bir "kullanıcı sonucu gördü ve onayladı" işaretidir — hiçbir kayıt oluşturmaz (bkz. dosya üstü açıklama). */
  const approve = useCallback(() => setApproved(true), []);

  return { status, result, errorMessage, errorKind, approved, analyzePhoto, approve, reset };
}
