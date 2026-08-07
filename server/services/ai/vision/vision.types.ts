/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7D — AI Vision Altyapısı.
 *
 * `VisionProvider`, "Gemini çağrıları doğrudan route içinde yazılmasın,
 * ileride farklı Vision sağlayıcıları eklenebilmeli" gereğini karşılayan
 * soyutlama katmanıdır. `VisionService`, bu arayüze bağımlıdır — hangi
 * sağlayıcının (Gemini, ileride başka bir sağlayıcı) kullanıldığını
 * bilmez. Yeni bir sağlayıcı eklemek, yalnızca bu arayüzü implement eden
 * yeni bir adaptör dosyası eklemeyi gerektirir; `VisionService`'in
 * kendisi hiç değişmez.
 *
 * Adaptör yalnızca "sağlayıcıya bir prompt + görsel gönder, ham metin
 * yanıtı al" sorumluluğunu taşır — yanıtı ayrıştırma (parse etme)
 * sorumluluğu KASITLI OLARAK burada değil, ayrı bir Response Parser
 * katmanındadır (bkz. vision-response.parser.ts). Bu ayrım, ileride
 * farklı sağlayıcıların (her biri farklı ham yanıt formatına sahip
 * olabilir) aynı parser mantığını paylaşabilmesini / gerektiğinde
 * sağlayıcıya özel parser'lara kolayca geçilebilmesini sağlar.
 */

/** Bir görsel dosyasının, sağlayıcıya gönderilmeye hazır ham verisi. */
export interface VisionImageInput {
  base64Data: string;
  mimeType: string;
}

/**
 * Herhangi bir Vision sağlayıcısının implement etmesi gereken minimal
 * sözleşme. Yalnızca tek bir metod içeriyor — daha fazlası bu aşamada
 * "gereksiz karmaşıklık" olurdu (bkz. Sprint 7D kısıtları).
 */
export interface VisionProvider {
  /**
   * Sağlayıcıya bir prompt + tek bir görsel gönderir, ham (ayrıştırılmamış)
   * metin yanıtını döndürür. Sağlayıcıya özgü hatalar (ağ, kota, kimlik
   * doğrulama) olduğu gibi yukarı fırlatılır — hata yönetimi çağıran
   * `VisionService`'in sorumluluğundadır.
   */
  analyzeImage(prompt: string, image: VisionImageInput): Promise<string>;
}
