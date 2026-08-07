/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from "react";
import { classifyFetchOutcome, ProductAnalysisErrorKind } from "./useProductAnalysis";

/**
 * Sprint 7H — "Belgelere Sor" akışı. Mevcut `classifyFetchOutcome`
 * (Sprint 7E) yeniden kullanılıyor — yeni bir hata sınıflandırma
 * deseni icat edilmedi.
 */
export type ProductDocumentQaStatus = "idle" | "asking" | "success" | "error";

export interface ProductDocumentQaAnswer {
  answer: string;
  confidence: number;
  citations: { documentId: string; excerpt?: string }[];
  warnings: string[];
  hasLinkedDocuments: boolean;
  usedDocuments: { documentId: string; fileName: string; heading?: string }[];
}

export function useProductDocumentQa() {
  const [status, setStatus] = useState<ProductDocumentQaStatus>("idle");
  const [answer, setAnswer] = useState<ProductDocumentQaAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKind, setErrorKind] = useState<ProductAnalysisErrorKind | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setAnswer(null);
    setErrorMessage("");
    setErrorKind(null);
  }, []);

  const askQuestion = useCallback(async (productId: string, question: string) => {
    setStatus("asking");
    setErrorMessage("");
    setErrorKind(null);
    setAnswer(null);

    try {
      const res = await fetch(`/api/products/${encodeURIComponent(productId)}/ask`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("agri_token") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      let data: any;
      try {
        data = await res.json();
      } catch {
        setStatus("error");
        setErrorKind("api");
        setErrorMessage("Sunucudan geçersiz bir yanıt alındı.");
        return;
      }

      if (!res.ok) {
        const classified = classifyFetchOutcome(false, false, data?.error || "Soru yanıtlanamadı.", null);
        setStatus("error");
        setErrorKind(classified.kind);
        setErrorMessage(classified.message);
        return;
      }

      setAnswer(data as ProductDocumentQaAnswer);
      setStatus("success");
    } catch (err) {
      const isNetwork = err instanceof TypeError;
      const classified = classifyFetchOutcome(false, isNetwork, null, err instanceof Error ? err.message : null);
      setStatus("error");
      setErrorKind(classified.kind);
      setErrorMessage(classified.message);
    }
  }, []);

  return { status, answer, errorMessage, errorKind, askQuestion, reset };
}
