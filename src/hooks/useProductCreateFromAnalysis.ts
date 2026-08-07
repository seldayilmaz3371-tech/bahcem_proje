/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { classifyFetchOutcome, ProductAnalysisErrorKind } from "./useProductAnalysis";

/**
 * Sprint 7F — Product Bank'e kaydetme akışını yönetir. Mevcut
 * `useProductAnalysis.ts` ile AYNI hata sınıflandırma fonksiyonunu
 * (`classifyFetchOutcome`) yeniden kullanır — yeni bir hata yönetimi
 * deseni icat edilmedi.
 */

export type ProductCreateStatus = "idle" | "saving" | "success" | "error";

export interface ProductCreateFormValues {
  type: "Fertilizer" | "Chemical";
  name: string;
  brand?: string;
  unit: string;
  npkRatio?: string;
  organicContentPercent?: number;
  microElements?: string;
  activeIngredient?: string;
  concentration?: string;
  targetPests?: string[];
  preHarvestIntervalDays?: number;
  /** Orijinal ProductAnalysisResult'ın güven skoru — yalnızca izlenebilirlik amaçlı (bkz. backend product-create-request.types.ts). */
  sourceAnalysisConfidence?: number;
}

export interface ProductCreateOutcomeUi {
  type: "Fertilizer" | "Chemical";
  productId: string;
  duplicateFound: boolean;
  duplicateProductName?: string;
}

export function useProductCreateFromAnalysis() {
  const [status, setStatus] = useState<ProductCreateStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ProductAnalysisErrorKind | null>(null);
  const [result, setResult] = useState<ProductCreateOutcomeUi | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setErrorMessage("");
    setErrorKind(null);
    setResult(null);
  }, []);

  const saveProduct = useCallback(async (values: ProductCreateFormValues) => {
    setStatus("saving");
    setErrorMessage("");
    setErrorKind(null);

    try {
      const res = await fetch("/api/products/from-analysis", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        setStatus("error");
        setErrorKind("api");
        setErrorMessage("Sunucudan geçersiz bir yanıt alındı.");
        return false;
      }

      if (!res.ok) {
        const classified = classifyFetchOutcome(false, false, data?.error || "Kayıt gerçekleştirilemedi.", null);
        setStatus("error");
        setErrorKind(classified.kind);
        setErrorMessage(classified.message);
        return false;
      }

      setResult({
        type: data.type,
        productId: data.product?.id,
        duplicateFound: !!data.duplicateWarning?.found,
        duplicateProductName: data.duplicateWarning?.matchedProductName,
      });
      setStatus("success");
      return true;
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      const classified = classifyFetchOutcome(false, isNetwork, null, err instanceof Error ? err.message : null);
      setStatus("error");
      setErrorKind(classified.kind);
      setErrorMessage(classified.message);
      return false;
    }
  }, []);

  return { status, result, errorMessage, errorKind, saveProduct, reset };
}
