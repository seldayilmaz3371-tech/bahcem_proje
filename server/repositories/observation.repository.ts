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
   * Finds an existing photo record that already carries a completed AI
   * analysis for the given content hash, if one exists. Used to detect
   * when the exact same image has been uploaded more than once, so its
   * one-time analysis can be reused instead of calling Gemini again.
   * @param contentHash SHA-256 hash of the decoded image bytes
   */
  public async findAnalyzedPhotoByContentHash(contentHash: string): Promise<Photo | null> {
    return this.findOne((p) => p.contentHash === contentHash && !!p.aiAnalysis);
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

  /**
   * Finds the most recent photo, with a completed AI analysis, taken of a
   * specific individual tree — joining through that tree's observations.
   * Used to infer a reference tree's current condition without
   * re-analyzing every photo ever taken of it (see
   * growth-scoring.util.ts's summarizeParcelHealthFromReferenceTrees).
   * @param treeId Unique tree ID
   * @returns The latest analyzed photo, or null if the tree has none yet
   */
  /**
   * Resolves the set of observation IDs linked to a specific tree.
   * Shared join logic used by both photo-lookup methods below.
   */
  private async getObservationIdsForTree(treeId: string): Promise<Set<string>> {
    const rawDb = await db.readRaw();
    return new Set(
      (rawDb.observations || [])
        .filter((obs) => obs.treeId === treeId)
        .map((obs) => obs.id)
    );
  }

  public async getLatestAnalyzedPhotoByTreeId(treeId: string): Promise<Photo | null> {
    const obsIds = await this.getObservationIdsForTree(treeId);
    const rawDb = await db.readRaw();

    const analyzedPhotos = (rawDb.photos || [])
      .filter((p) => obsIds.has(p.observationId) && !!p.aiAnalysis)
      .sort((a, b) => new Date(b.takenAt || b.createdAt).getTime() - new Date(a.takenAt || a.createdAt).getTime());

    return analyzedPhotos[0] || null;
  }

  /**
   * Finds the most recent photo taken of a specific tree, regardless of
   * whether it has been analyzed yet. Used where the concern is simply
   * "has this tree ever been photographed" (e.g. the farm-wide reference
   * tree summary on the Dashboard), as opposed to
   * `getLatestAnalyzedPhotoByTreeId`, which is specifically for
   * one-time-analysis reuse logic.
   * @param treeId Unique tree ID
   */
  public async getLatestPhotoByTreeId(treeId: string): Promise<Photo | null> {
    const obsIds = await this.getObservationIdsForTree(treeId);
    const rawDb = await db.readRaw();

    const photos = (rawDb.photos || [])
      .filter((p) => obsIds.has(p.observationId))
      .sort((a, b) => new Date(b.takenAt || b.createdAt).getTime() - new Date(a.takenAt || a.createdAt).getTime());

    return photos[0] || null;
  }

  /**
   * Loads all photos ever taken of a specific reference tree, joining
   * through that tree's observations. Symmetric with
   * `getPhotosByParcelId`, but scoped to a single tree instead of the
   * whole parcel — used when a farmer wants a growth analysis for just
   * one reference tree rather than the parcel's aggregate photo set.
   * @param treeId Unique tree ID
   */
  public async getPhotosByTreeId(treeId: string): Promise<Photo[]> {
    const obsIds = await this.getObservationIdsForTree(treeId);
    const rawDb = await db.readRaw();
    return (rawDb.photos || []).filter((p) => obsIds.has(p.observationId));
  }
}

export const observationRepository = new ObservationRepository();
export const photoRepository = new PhotoRepository();
