/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { Observation, ObservationActivityType, Photo } from "../models";
import { db } from "../database";

/**
 * Repository to manage Field Observations.
 */
export class ObservationRepository extends BaseRepository<Observation> {
  constructor() {
    super("observations");
  }

  /**
   * Retrieves observations sorted chronologically for a specific parcel.
   */
  public async getByParcelId(parcelId: string): Promise<Observation[]> {
    const list = await this.find((obs) => obs.parcelId === parcelId);
    return list.sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime());
  }

  /**
   * Retrieves observations sorted chronologically for a specific individual tree.
   */
  public async getByTreeId(treeId: string): Promise<Observation[]> {
    const list = await this.find((obs) => obs.treeId === treeId);
    return list.sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime());
  }

  /**
   * Retrieves observations of a specific field activity type (e.g. İlaçlama,
   * Sulama, Budama, Gübreleme, Biçme), sorted chronologically.
   */
  public async getByActivityType(activityType: ObservationActivityType): Promise<Observation[]> {
    const list = await this.find((obs) => obs.activityType === activityType);
    return list.sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime());
  }
}

/**
 * Repository to manage Photo assets linked to observations.
 */
export class PhotoRepository extends BaseRepository<Photo> {
  constructor() {
    super("photos");
  }

  /**
   * Loads all photo attachments linked to a unique field observation.
   */
  public async getByObservationId(observationId: string): Promise<Photo[]> {
    return this.find((p) => p.observationId === observationId);
  }

  /**
   * Loads all photos taken in a specific parcel by joining through observations.
   */
  public async getPhotosByParcelId(parcelId: string): Promise<Photo[]> {
    const rawDb = await db.readRaw();
    const obsIds = new Set(
      (rawDb.observations || [])
        .filter((obs) => obs.parcelId === parcelId)
        .map((obs) => obs.id)
    );

    return (rawDb.photos || []).filter((p) => obsIds.has(p.observationId));
  }
}

export const observationRepository = new ObservationRepository();
export const photoRepository = new PhotoRepository();
