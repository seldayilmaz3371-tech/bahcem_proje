/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";

/**
 * Agricultural and Geographic Utility Module.
 * Designed specifically for agricultural analytics, calculations, and conversions
 * for Mersin Toroslar/Değirmençay region assets.
 */
export class AgriUtils {
  /**
   * Generates a secure, unique, and collision-resistant v4 UUID.
   * Useful for primary keys and reference numbers.
   * @returns UUID string
   */
  public static generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Formats a standard ISO string or Date into Turkish localization layout.
   * Example: "2026-07-01" -> "1 Temmuz 2026"
   * @param date Date input (Date or string)
   * @param includeTime Whether to append time format (HH:MM)
   * @returns Formatted Turkish date string
   */
  public static formatTurkishDate(date: Date | string, includeTime = false): string {
    try {
      const parsedDate = typeof date === "string" ? new Date(date) : date;
      if (isNaN(parsedDate.getTime())) {
        return "Geçersiz Tarih";
      }

      const options: Intl.DateTimeFormatOptions = {
        day: "numeric",
        month: "long",
        year: "numeric",
      };

      if (includeTime) {
        options.hour = "2-digit";
        options.minute = "2-digit";
      }

      return parsedDate.toLocaleDateString("tr-TR", options);
    } catch (error) {
      return "Tarih Dönüştürülemedi";
    }
  }

  /**
   * Converts area values between "Dekar" (dönüm) and square meters (m²).
   * 1 Dekar = 1000 m²
   * @param dekar Area value in Dekar
   * @returns Area in square meters
   */
  public static dekarToSquareMeters(dekar: number): number {
    return dekar * 1000;
  }

  /**
   * Converts area values from square meters (m²) to "Dekar" (dönüm).
   * @param sqm Area value in square meters
   * @returns Area in Dekar
   */
  public static squareMetersToDekar(sqm: number): number {
    return sqm / 1000;
  }

  /**
   * Calculates the geographic distance between two sets of coordinates on Earth
   * using the Haversine formula. Excellent for finding nearest trees or verifying
   * observation points relative to the parcel perimeter.
   * @param lat1 Latitude of source coordinate
   * @param lon1 Longitude of source coordinate
   * @param lat2 Latitude of target coordinate
   * @param lon2 Longitude of target coordinate
   * @returns Distance in meters
   */
  public static calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    try {
      const earthRadiusMeters = 6371e3; // Earth's mean radius in meters
      const phi1 = (lat1 * Math.PI) / 180;
      const phi2 = (lat2 * Math.PI) / 180;
      const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
      const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

      const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const distance = earthRadiusMeters * c;
      return Math.round(distance * 100) / 100; // Return rounded to 2 decimals
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculates chemical/fertilizer dosage requirement.
   * Evaluates how many grams/milliliters of material are needed based on recommended dosage per tree or per dekar.
   * @param dosagePerUnit Recommended dose (e.g. ml or gr per tree or dekar)
   * @param unitCount Number of units (e.g. trees count or area in dekar)
   * @returns Total amount required in grams/milliliters
   */
  public static calculateTotalDosage(dosagePerUnit: number, unitCount: number): number {
    if (dosagePerUnit < 0 || unitCount < 0) return 0;
    return Math.round(dosagePerUnit * unitCount * 100) / 100;
  }

  /**
   * Safe JSON parse helper to prevent crashes and provide safe fallbacks.
   * @param jsonString String to parse
   * @param fallback Default value if parse fails
   * @returns Parsed object or fallback
   */
  public static safeJsonParse<T>(jsonString: string, fallback: T): T {
    try {
      if (!jsonString) return fallback;
      return JSON.parse(jsonString) as T;
    } catch (e) {
      return fallback;
    }
  }
}
