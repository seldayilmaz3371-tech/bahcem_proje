/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config";
import { logger } from "../logger";
import { db } from "../database";
import { photoRepository } from "../repositories/observation.repository";

/**
 * Result of persisting a base64-encoded photo to disk.
 */
export interface SavedPhotoFile {
  relativeUrl: string;
  fileSizeBytes: number;
  /** SHA-256 hash of the decoded image bytes, for exact-duplicate detection. */
  contentHash: string;
}

/**
 * A newly created photo file, including the generated identifier used as
 * both the file's base name and the eventual Photo record's primary key.
 */
export interface NewPhotoFile extends SavedPhotoFile {
  photoId: string;
}

/**
 * Inline (base64) representation of a stored photo, suitable for sending
 * to Gemini's multimodal vision API as an `inlineData` content part.
 */
export interface InlinePhotoData {
  mimeType: string;
  base64Data: string;
}

/**
 * Maps common image MIME types to file extensions. Falls back to ".bin"
 * for any unrecognized type so a save operation can never silently fail
 * due to an unexpected format.
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

/**
 * Photo Storage Service.
 *
 * Persists uploaded field-observation photos as individual files on disk
 * under the configured photos directory, rather than embedding them as
 * base64 text inside the main JSON database. Previously, every single
 * database write (even an unrelated one, like adding a cost entry) had to
 * re-serialize and rewrite every embedded photo, since the whole database
 * lives in one JSON file. As the photo collection grows, this made every
 * write progressively slower. Storing photos as separate files removes
 * this bottleneck entirely: the database file now only stores a small
 * reference URL per photo.
 *
 * Photo records continue to expose `originalUrl`/`thumbnailUrl` exactly as
 * before; these fields now hold a root-relative URL (e.g.
 * "/uploads/photos/<uuid>.jpg") served statically by Express, instead of
 * the raw base64 payload. This keeps every existing consumer (the
 * Saha Gözlemleri photo grid, the lightbox viewer, Fotoğraflı Gelişim
 * Analizi) working unchanged, since an `<img>` tag renders a relative URL
 * exactly the same way it renders a base64 data URL.
 */
export class PhotoStorageService {
  private readonly photosDirectory: string;
  private readonly urlPrefix = "/uploads/photos";

  constructor() {
    this.photosDirectory = config.storage.photosDirectory;
    this.ensureDirectoryExists();
  }

  /**
   * Returns the absolute filesystem directory where photo files are
   * stored, for wiring up Express static file serving.
   */
  public getPhotosDirectoryPath(): string {
    return this.photosDirectory;
  }

  /**
   * Ensures the on-disk photos directory exists, creating it (and any
   * missing parent directories) if necessary.
   */
  private ensureDirectoryExists(): void {
    try {
      if (!fs.existsSync(this.photosDirectory)) {
        fs.mkdirSync(this.photosDirectory, { recursive: true });
        logger.info("SYSTEM", `Fotoğraf depolama klasörü oluşturuldu: ${this.photosDirectory}`);
      }
    } catch (error) {
      logger.error("SYSTEM", "Fotoğraf depolama klasörü oluşturulamadı.", error, { path: this.photosDirectory });
      throw error;
    }
  }

  /**
   * Parses a base64 data URL (e.g. "data:image/jpeg;base64,/9j/4AAQ...")
   * into its MIME type and raw base64 payload.
   * @param dataUrl Data URL string to parse
   * @returns Parsed MIME type and base64 payload, or null if malformed
   */
  private parseDataUrl(dataUrl: string): { mimeType: string; base64Payload: string } | null {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match) return null;
    return { mimeType: match[1], base64Payload: match[2] };
  }

  /**
   * Reverse-maps a file extension back to its MIME type. Used when reading
   * a photo file from disk, where only the file path (not the original
   * upload's MIME type) is known.
   */
  private extensionToMimeType(extension: string): string {
    const entry = Object.entries(MIME_TO_EXTENSION).find(([, ext]) => ext === extension.toLowerCase());
    return entry ? entry[0] : "image/jpeg";
  }

  /**
   * Decodes a base64 data URL and writes it to disk under the given photo
   * ID as the file's base name, using an atomic write-then-rename pattern
   * so an interrupted write can never leave a corrupted/partial file
   * behind.
   * @param base64DataUrl Full data URL string (e.g. "data:image/jpeg;base64,...")
   * @param photoId Unique identifier to use as the file's base name
   * @returns The saved file's relative URL and byte size
   * @throws Error if the data URL is malformed or the file cannot be written
   */
  private writePhotoFile(base64DataUrl: string, photoId: string): SavedPhotoFile {
    const parsed = this.parseDataUrl(base64DataUrl);
    if (!parsed) {
      throw new Error("Fotoğraf verisi geçersiz bir base64 formatında (data:image/...;base64,... bekleniyor).");
    }

    const extension = MIME_TO_EXTENSION[parsed.mimeType.toLowerCase()] || ".bin";
    const fileName = `${photoId}${extension}`;
    const finalPath = path.join(this.photosDirectory, fileName);
    const tempPath = `${finalPath}.tmp`;

    try {
      const buffer = Buffer.from(parsed.base64Payload, "base64");
      const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, finalPath);

      logger.info("SYSTEM", `Fotoğraf diske kaydedildi: ${fileName} (${buffer.length} bayt)`);

      return {
        relativeUrl: `${this.urlPrefix}/${fileName}`,
        fileSizeBytes: buffer.length,
        contentHash,
      };
    } catch (error) {
      logger.error("SYSTEM", "Fotoğraf diske yazılırken hata oluştu.", error, { fileName });
      throw new Error("Fotoğraf diske kaydedilirken bir hata oluştu.");
    }
  }

  /**
   * Persists a newly uploaded base64-encoded photo as an individual file
   * on disk, generating a fresh unique identifier for it.
   * @param base64DataUrl Full data URL string received from the client
   * @returns The generated photo ID, relative URL, and byte size
   * @throws Error if the data URL is malformed or the file cannot be written
   */
  public saveNewPhoto(base64DataUrl: string): NewPhotoFile {
    const photoId = crypto.randomUUID();
    const saved = this.writePhotoFile(base64DataUrl, photoId);
    return { photoId, ...saved };
  }

  /**
   * Permanently removes a previously saved photo's file from disk, given
   * its stored `originalUrl`. Legacy records whose `originalUrl` is still
   * an inline base64 data URL (never migrated to a file) have nothing on
   * disk to remove — this is a no-op for those, not an error, since the
   * caller's job (deleting the Photo record) still succeeds regardless.
   * A missing file (already deleted, or never wrote successfully) is
   * likewise treated as success: the end state the caller wants — "no
   * file on disk for this photo" — is already true.
   * @param originalUrl The Photo record's `originalUrl` value
   */
  public deletePhotoFile(originalUrl: string): void {
    if (!originalUrl.startsWith(this.urlPrefix)) {
      return; // Legacy inline data URL — nothing on disk to delete.
    }

    const fileName = path.basename(originalUrl);
    const filePath = path.join(this.photosDirectory, fileName);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info("SYSTEM", `Fotoğraf dosyası diskten silindi: ${fileName}`);
      }
    } catch (error) {
      // A failed disk deletion must never block removing the database
      // record — an orphaned file on disk is a minor cleanup issue, but
      // failing to let the user remove a mistakenly added photo from
      // their observation history would be a worse outcome.
      logger.error("SYSTEM", "Fotoğraf dosyası diskten silinirken hata oluştu (kayıt yine de silinecek).", error, { fileName });
    }
  }

  /**
   * Reads a previously saved photo (whether stored as a file on disk or,
   * for not-yet-migrated legacy records, still embedded as an inline
   * base64 data URL) and returns it as base64-encoded inline data suitable
   * for Gemini's multimodal vision API.
   * @param storedUrl The Photo record's `originalUrl` value
   * @returns MIME type and base64 payload, or null if the photo cannot be read
   */
  public readPhotoAsInlineData(storedUrl: string): InlinePhotoData | null {
    // Legacy records created before this storage system existed may still
    // hold a full base64 data URL directly. Support both transparently so
    // any record not yet migrated keeps working correctly.
    if (storedUrl.startsWith("data:")) {
      const parsed = this.parseDataUrl(storedUrl);
      return parsed ? { mimeType: parsed.mimeType, base64Data: parsed.base64Payload } : null;
    }

    try {
      const fileName = path.basename(storedUrl);
      const filePath = path.join(this.photosDirectory, fileName);
      if (!fs.existsSync(filePath)) {
        logger.error("SYSTEM", `Fotoğraf dosyası diskte bulunamadı: ${filePath}`);
        return null;
      }

      const buffer = fs.readFileSync(filePath);
      const mimeType = this.extensionToMimeType(path.extname(fileName));

      return { mimeType, base64Data: buffer.toString("base64") };
    } catch (error) {
      logger.error("SYSTEM", "Fotoğraf diskten okunurken hata oluştu.", error, { storedUrl });
      return null;
    }
  }

  /**
   * One-time startup migration: scans all photo records for any that
   * still hold their image data inline as a base64 data URL (the legacy
   * storage format used before this service existed) and converts each
   * one to an individual file on disk, updating the database record to
   * reference the new file path instead. Idempotent — records already
   * using file-based storage are left untouched, and running this again
   * after all legacy records have been converted has no further effect.
   * @returns The number of photo records that were successfully migrated
   */
  public async migrateAllLegacyPhotos(): Promise<number> {
    const rawDb = await db.readRaw();
    const legacyPhotos = (rawDb.photos || []).filter((p) => p.originalUrl.startsWith("data:"));

    if (legacyPhotos.length === 0) {
      return 0;
    }

    logger.warn(
      "SYSTEM",
      `${legacyPhotos.length} adet eski (veritabanı dosyasına gömülü) fotoğraf tespit edildi, dosya sistemine taşınıyor...`
    );

    let migratedCount = 0;
    for (const photo of legacyPhotos) {
      try {
        const saved = this.writePhotoFile(photo.originalUrl, photo.id);
        await photoRepository.update(photo.id, {
          originalUrl: saved.relativeUrl,
          thumbnailUrl: saved.relativeUrl,
        });
        migratedCount++;
      } catch (error) {
        logger.error(
          "SYSTEM",
          `Eski fotoğraf kaydı taşınamadı, kayıt olduğu gibi bırakıldı. Photo ID: ${photo.id}`,
          error
        );
      }
    }

    logger.info(
      "SYSTEM",
      `Fotoğraf taşıma tamamlandı: ${migratedCount}/${legacyPhotos.length} kayıt başarıyla dosya sistemine taşındı.`
    );
    return migratedCount;
  }
}

export const photoStorageService = new PhotoStorageService();
