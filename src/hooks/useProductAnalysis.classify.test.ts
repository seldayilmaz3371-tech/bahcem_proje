/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7E — Frontend hata/durum sınıflandırma testleri.
 *
 * ÖNEMLİ SINIRLAMA (dürüstçe belirtiliyor): Bu proje henüz bir React
 * render-test altyapısına (React Testing Library + jsdom/happy-dom)
 * sahip değil — `vite.config.ts`'de hiçbir `test.environment`
 * yapılandırılmamış, `package.json`'da `@testing-library/*` hiç kurulu
 * değil (doğrulandı). Yeni bir test altyapısı KURMAK (yeni bağımlılık +
 * config değişikliği) yerine, `useProductAnalysis.ts`'teki hata
 * sınıflandırma mantığı (`classifyFetchOutcome`) React'ten tamamen
 * bağımsız, saf bir fonksiyon olarak dışarı çıkarıldı ve BURADA
 * doğrudan test ediliyor.
 *
 * Bu, "Frontend hata durumu" senaryosunun ÇEKİRDEK mantığını (hangi
 * hata hangi kategoriye giriyor, hangi mesaj gösteriliyor) kanıtlar —
 * ama gerçek bir component render/DOM testi DEĞİLDİR. Bu, bilinçli bir
 * kapsam sınırlamasıdır (bkz. Sprint Sonu Raporu, Risk Analizi).
 *
 * "Frontend yükleme durumu" için: hook'un `status` alanının olası
 * değerleri (`idle`/`loading`/`success`/`error`) TypeScript'in kendisi
 * tarafından, derleme zamanında zaten garanti ediliyor (bkz.
 * `ProductAnalysisStatus` union tipi) — durum GEÇİŞLERİNİN (loading'den
 * success/error'a) doğruluğu ise `useProductAnalysis.ts`'in kendi kodu
 * içinde (her dalda tam olarak bir `setStatus` çağrısı olduğu, kod
 * okunarak doğrulanabilir) garanti ediliyor; DOM render'ı olmadan bunu
 * ayrıca "test etmek" mümkün değil.
 */

import { describe, it, expect } from "vitest";
import { classifyFetchOutcome } from "./useProductAnalysis";

describe("classifyFetchOutcome", () => {
  it("[Timeout] abort hatası -> kind:timeout, anlamlı Türkçe mesaj", () => {
    const result = classifyFetchOutcome(true, false, null, null);
    expect(result.kind).toBe("timeout");
    expect(result.message).toContain("zaman aşımı");
  });

  it("[Ağ hatası] network hatası -> kind:network", () => {
    const result = classifyFetchOutcome(false, true, null, null);
    expect(result.kind).toBe("network");
    expect(result.message).toContain("Ağ bağlantısı");
  });

  it("[Geçersiz dosya] backend 'Fotoğraf yüklenmedi' mesajı -> kind:invalid-file", () => {
    const result = classifyFetchOutcome(false, false, "Fotoğraf yüklenmedi.", null);
    expect(result.kind).toBe("invalid-file");
  });

  it("[Geçersiz dosya] backend 'Desteklenmeyen dosya formatı' mesajı -> kind:invalid-file", () => {
    const result = classifyFetchOutcome(false, false, "Desteklenmeyen dosya formatı: 'application/pdf'.", null);
    expect(result.kind).toBe("invalid-file");
  });

  it("[Vision hatası] backend'in genel analiz hatası mesajı -> kind:vision (dosya doğrulama değil)", () => {
    const result = classifyFetchOutcome(false, false, "Fotoğraf analizi şu anda gerçekleştirilemedi. Lütfen daha sonra tekrar deneyin.", null);
    expect(result.kind).toBe("vision");
  });

  it("[API başarısızlığı / bilinmeyen] hiçbir özel durum eşleşmezse -> kind:unknown, generic mesaj kullanılır", () => {
    const result = classifyFetchOutcome(false, false, null, "Beklenmedik bir JS hatası");
    expect(result.kind).toBe("unknown");
    expect(result.message).toBe("Beklenmedik bir JS hatası");
  });

  it("hiçbir hata bilgisi verilmezse güvenli bir varsayılan mesaj döner (asla boş/undefined mesaj üretmez)", () => {
    const result = classifyFetchOutcome(false, false, null, null);
    expect(result.message).toBeTruthy();
  });
});
