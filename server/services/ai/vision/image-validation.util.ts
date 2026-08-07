/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 7D — Image Validation.
 *
 * "Tüm kullanıcı girdilerini doğrula" (GÜVENLİK) ilkesinin bu sprintteki
 * karşılığı: bir görsel Vision sağlayıcısına gönderilmeden önce burada
 * doğrulanır. Route katmanı bu fonksiyonu çağırır, sonucu kendi HTTP
 * yanıt koduna (400) çevirir — doğrulama mantığının kendisi HTTP'den
 * bağımsızdır (test edilebilirlik, bkz. proje geneli TEST EDİLEBİLİRLİK
 * ilkesi).
 *
 * Desteklenen formatlar KASITLI OLARAK `photo-storage.service.ts`'teki
 * genel envanter/gözlem fotoğrafı listesinden (7 format, GIF dahil) DAHA
 * DAR: yalnızca Gemini'nin resmi olarak vision girdisi için desteklediği,
 * bilinen 4 format (jpeg, png, webp, heic/heif) kabul edilir. GIF'in
 * Gemini vision tarafından güvenilir şekilde desteklenip desteklenmediği
 * bu sprint kapsamında DOĞRULANMADI — belirsiz bir formatı kabul edip
 * sağlayıcı tarafında sessizce başarısız olmaktansa, burada açıkça
 * reddetmek daha güvenli bir varsayılandır.
 */

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Route'taki multer limitiyle (8 MB) aynı — tek bir sabit kaynaktan yönetilmesi gerekirdi, ama mevcut multer config'i değiştirmek Sprint 7D kapsamı dışı; burada aynı değer bağımsız olarak uygulanıyor (bkz. Risk Analizi). */
const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024;

export interface ImageValidationResult {
  valid: boolean;
  errorMessage?: string;
}

/** Multer'ın bellek deposunda (memoryStorage) sağladığı dosya şekliyle uyumlu minimal arayüz — gerçek `Express.Multer.File`'a bağımlı olmadan test edilebilir. */
export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

/**
 * Bir görsel dosyasını sırayla doğrular: dosya var mı → okunabilir mi
 * (buffer geçerli mi) → boş mu → format destekleniyor mu → boyut sınırı
 * aşılmış mı. İlk başarısız kontrolde durur, en anlaşılır (kullanıcıya
 * gösterilebilir Türkçe) hatayı döndürür.
 */
export function validateImageFile(file: UploadedImageFile | null | undefined): ImageValidationResult {
  if (!file) {
    return { valid: false, errorMessage: "Fotoğraf yüklenmedi." };
  }

  if (!Buffer.isBuffer(file.buffer)) {
    return { valid: false, errorMessage: "Fotoğraf dosyası okunamadı." };
  }

  if (file.buffer.length === 0) {
    return { valid: false, errorMessage: "Yüklenen dosya boş." };
  }

  if (!file.mimetype || !SUPPORTED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return { valid: false, errorMessage: `Desteklenmeyen dosya formatı: '${file.mimetype || "bilinmiyor"}'. Desteklenen formatlar: JPEG, PNG, WEBP, HEIC/HEIF.` };
  }

  if (file.buffer.length > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, errorMessage: `Dosya boyutu çok büyük (maksimum ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB).` };
  }

  return { valid: true };
}
