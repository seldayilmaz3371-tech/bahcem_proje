/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import { logger } from "../../logger";

/**
 * Sprint 9.15 — DEBUG AMAÇLI, İSTEĞE BAĞLI dosya yazıcı.
 *
 * YALNIZCA `process.env.DEBUG_PROMPT === "true"` iken çalışır — VARSAYILAN
 * KAPALI, üretim davranışını (performans, disk kullanımı, güvenlik)
 * HİÇ ETKİLEMEZ. Ana akışı ASLA bozmaz (hata olursa yalnızca loglar,
 * throw etmez) — bu yüzden çağıran kodun try/catch bloklarına dahil
 * edilmesine gerek yoktur.
 *
 * Kullanım: geliştirici kendi ortamında `DEBUG_PROMPT=true` ile
 * çalıştırıp, `debug_last_prompt.txt` / `debug_raw_response.txt`
 * dosyalarını (proje kök dizininde) inceleyebilir.
 */
export function writeDebugFile(filename: string, content: string): void {
  if (process.env.DEBUG_PROMPT !== "true") return;
  try {
    fs.writeFileSync(filename, content, "utf8");
  } catch (error) {
    logger.error("SYSTEM", `[DEBUG] ${filename} yazılamadı.`, error);
  }
}
