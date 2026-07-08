/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { 
  Application, 
  Irrigation, 
  WeatherRecord, 
  Notification, 
  ActivityLog 
} from "../models";
import { db } from "../database";

/**
 * Repository to manage Irrigation (Sulama) Activities.
 */
export class IrrigationRepository extends BaseRepository<Irrigation> {
  constructor() {
    super("irrigation");
  }

  /**
   * Retrieves watering histories for a specific land parcel.
   */
  public async getByParcelId(parcelId: string): Promise<Irrigation[]> {
    return this.find((irr) => irr.parcelId === parcelId);
  }
}

/**
 * Repository to manage fertilizer/chemical application histories.
 */
export class ApplicationRepository extends BaseRepository<Application> {
  constructor() {
    super("applications");
  }

  /**
   * Retrieves chemical or fertilizing application logs for a parcel.
   */
  public async getByParcelId(parcelId: string): Promise<Application[]> {
    return this.find((app) => app.parcelId === parcelId);
  }
}

/**
 * Repository to manage logged meteorological patterns.
 */
export class WeatherRepository extends BaseRepository<WeatherRecord> {
  constructor() {
    super("weatherHistory");
  }
}

/**
 * Repository to manage alerts and notifications.
 */
export class NotificationRepository extends BaseRepository<Notification> {
  constructor() {
    super("notifications");
  }

  /**
   * Retrieves unread notifications sorted by timestamp.
   */
  public async getUnreadNotifications(): Promise<Notification[]> {
    const list = await this.find((n) => !n.isRead);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Checks whether an unread notification already exists for the given
   * reference key, to avoid creating a duplicate alert for a condition
   * that was already reported and has not yet been acknowledged.
   * @param referenceKey Stable identifier for the specific condition (e.g. "lowstock-<itemId>")
   */
  public async hasUnreadNotificationForKey(referenceKey: string): Promise<boolean> {
    const existing = await this.findOne((n) => !n.isRead && n.referenceKey === referenceKey);
    return existing !== null;
  }

  /**
   * Marks all notifications as read.
   */
  public async markAllAsRead(): Promise<void> {
    await db.transaction((rawDb) => {
      rawDb.notifications.forEach((n) => {
        n.isRead = true;
      });
    });
  }
}

/**
 * Repository to record administrative audit logs.
 */
export class ActivityLogRepository extends BaseRepository<ActivityLog> {
  constructor() {
    super("activityLogs");
  }

  /**
   * Appends an audit trailing action.
   */
  public async writeLog(userId: string, action: string, details: string, ipAddress?: string): Promise<ActivityLog> {
    return this.create({
      userId,
      action,
      details,
      ipAddress,
      createdAt: new Date().toISOString()
    });
  }
}

export const irrigationRepository = new IrrigationRepository();
export const applicationRepository = new ApplicationRepository();
export const weatherRepository = new WeatherRepository();
export const notificationRepository = new NotificationRepository();
export const activityLogRepository = new ActivityLogRepository();
