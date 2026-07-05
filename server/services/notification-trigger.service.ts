/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from "../logger";
import { inventoryItemRepository } from "../repositories/inventory.repository";
import { notificationRepository } from "../repositories/activity.repository";
import { weatherService } from "./weather.service";

/** How often the background condition checks run. */
const NOTIFICATION_CHECK_INTERVAL_HOURS = 6;

/**
 * Notification Trigger Service.
 *
 * The `Notification` data model and `NotificationRepository` already
 * existed in this codebase, but nothing ever called
 * `notificationRepository.create()` outside of demo seed data — the
 * conditions worth alerting on (critical stock levels, upcoming frost)
 * were already computed elsewhere (InventoryManager, Dashboard,
 * WeatherService) but never converted into a persisted notification a
 * farmer could see and act on.
 *
 * This service is the missing "wiring": a lightweight scheduled check,
 * following the exact same pattern already established by
 * BackupService (immediate check on startup, then a repeating
 * interval), that evaluates real farm conditions and creates a
 * Notification record only when one does not already exist unread for
 * that same condition (see NotificationRepository.hasUnreadNotificationForKey).
 *
 * Deliberately a standalone service rather than folded into
 * InventoryManager's or WeatherService's backend counterparts: it reads
 * from both, has its own scheduling lifecycle, and neither existing
 * service has a natural single-responsibility home for "periodically
 * decide what the farmer should be alerted about."
 */
export class NotificationTriggerService {
  private intervalHandle: NodeJS.Timeout | null = null;

  /**
   * Starts the periodic condition-check schedule: runs immediately, then
   * repeats every NOTIFICATION_CHECK_INTERVAL_HOURS. Safe to call once at
   * application startup; a failure in any individual check is logged and
   * never crashes the server (see HATA YÖNETİMİ).
   */
  public startMonitoring(): void {
    this.runChecksSafely();

    const intervalMs = NOTIFICATION_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
    this.intervalHandle = setInterval(() => this.runChecksSafely(), intervalMs);

    logger.info(
      "SYSTEM",
      `Bildirim kontrol zamanlayıcısı başlatıldı. Her ${NOTIFICATION_CHECK_INTERVAL_HOURS} saatte bir stok ve don riski kontrol edilecek.`
    );
  }

  /** Stops the periodic schedule. Provided for clean shutdown/test scenarios. */
  public stopMonitoring(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async runChecksSafely(): Promise<void> {
    try {
      await this.checkCriticalStock();
    } catch (error) {
      logger.error("SYSTEM", "Kritik stok kontrolü sırasında bir hata oluştu.", error);
    }

    try {
      await this.checkFrostRisk();
    } catch (error) {
      logger.error("SYSTEM", "Don riski kontrolü sırasında bir hata oluştu.", error);
    }
  }

  /**
   * Creates a "LowStock" notification for each inventory item at or
   * below its configured minimum stock threshold, skipping any item that
   * already has an unread notification for this exact condition.
   */
  private async checkCriticalStock(): Promise<void> {
    const items = await inventoryItemRepository.getAll();
    const criticalItems = items.filter((item) => item.stockQuantity <= item.minStockAlert);

    for (const item of criticalItems) {
      const referenceKey = `lowstock-${item.id}`;
      const alreadyNotified = await notificationRepository.hasUnreadNotificationForKey(referenceKey);
      if (alreadyNotified) continue;

      await notificationRepository.create({
        title: "Kritik Stok Uyarısı",
        message: `"${item.name}" stoğu kritik seviyeye düştü: ${item.stockQuantity} ${item.unit} kaldı (eşik: ${item.minStockAlert} ${item.unit}).`,
        type: "LowStock",
        isRead: false,
        referenceKey,
        createdAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Creates a "Frost" notification for the nearest upcoming forecast day
   * carrying a frost risk, skipping if an unread notification for that
   * exact date already exists. Silently does nothing if the live
   * weather forecast is unavailable — this is a best-effort enhancement,
   * not a critical path (see HATA YÖNETİMİ: harici servis çağrıları
   * try/catch ile korunmalı, and PERFORMANS: no forecast means nothing
   * new to report, not an error worth surfacing here).
   */
  private async checkFrostRisk(): Promise<void> {
    const forecast = await weatherService.getLiveForecast();
    const frostDay = forecast.daily.find((day) => day.hasFrostRisk);
    if (!frostDay) return;

    const referenceKey = `frost-${frostDay.date}`;
    const alreadyNotified = await notificationRepository.hasUnreadNotificationForKey(referenceKey);
    if (alreadyNotified) return;

    await notificationRepository.create({
      title: "Don Riski Uyarısı",
      message: `${frostDay.dateLabel} tarihinde don riski bekleniyor (en düşük ${frostDay.tempMin}°C). Zeytin ağaçları için önlem almayı unutmayın.`,
      type: "Frost",
      isRead: false,
      referenceKey,
      createdAt: new Date().toISOString(),
    });
  }
}

export const notificationTriggerService = new NotificationTriggerService();
