/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { Parcel, Tree, TreeCountChangeLog } from "../models";
import { db } from "../database";

/**
 * Repository to manage Land Parcels.
 */
export class ParcelRepository extends BaseRepository<Parcel> {
  constructor() {
    super("parcels");
  }

  /**
   * Automatically updates a parcel's tree count based on actual trees tracked.
   * @param parcelId Unique parcel ID
   */
  public async syncTreeCount(parcelId: string): Promise<number> {
    const rawDb = await db.readRaw();
    const trees = rawDb.trees || [];
    const count = trees.filter((t) => t.parcelId === parcelId).length;

    await this.update(parcelId, { treeCount: count });
    return count;
  }
}

/**
 * Repository to manage Individual Trees.
 */
export class TreeRepository extends BaseRepository<Tree> {
  constructor() {
    super("trees");
  }

  /**
   * Retrieves all individual trees registered under a single parcel.
   * @param parcelId Unique parcel ID
   */
  public async getByParcelId(parcelId: string): Promise<Tree[]> {
    return this.find((tree) => tree.parcelId === parcelId);
  }

  /**
   * Retrieves only the trees marked as "Referans Ağaç" (reference tree)
   * for a single parcel — the representative sample used to infer the
   * whole parcel's condition without analyzing every tree individually.
   * @param parcelId Unique parcel ID
   */
  public async getReferenceTreesByParcelId(parcelId: string): Promise<Tree[]> {
    return this.find((tree) => tree.parcelId === parcelId && !!tree.isReferenceTree);
  }

  /**
   * Find a specific tree by tree number within a parcel (e.g. "P1-T12").
   */
  public async getByTreeNumber(parcelId: string, treeNumber: string): Promise<Tree | null> {
    return this.findOne((tree) => tree.parcelId === parcelId && tree.treeNumber === treeNumber);
  }

  /**
   * Computes the farm-wide reference tree summary (total count, how many
   * still lack any photo, and the single most recently taken photo
   * across all of them) used by the Dashboard.
   *
   * Performs exactly ONE `db.readRaw()` call and does the tree →
   * observation → photo → parcel join entirely in memory. A prior
   * version of this logic lived directly in the route handler and
   * called a repository method inside a loop once per reference tree —
   * for N reference trees, that meant N full reads of the JSON database
   * file for a single API request (see denetim bulgusu: KRİTİK-002,
   * Katman 3). This version scales with the size of the farm's data,
   * not with an extra file read per tree.
   */
  public async getReferenceTreesSummary(): Promise<{
    totalReferenceTrees: number;
    treesWithoutPhoto: number;
    mostRecentPhoto: { photoUrl: string; treeNumber: string; parcelName: string; takenAt: string } | null;
  }> {
    const rawDb = await db.readRaw();
    const referenceTrees = (rawDb.trees || []).filter((tree) => !!tree.isReferenceTree);

    const parcelNameById = new Map((rawDb.parcels || []).map((p) => [p.id, p.name]));

    // Group observation IDs by the tree they belong to, once, instead of
    // re-scanning the full observations array for every reference tree.
    const observationIdsByTreeId = new Map<string, Set<string>>();
    for (const obs of rawDb.observations || []) {
      if (!obs.treeId) continue;
      if (!observationIdsByTreeId.has(obs.treeId)) {
        observationIdsByTreeId.set(obs.treeId, new Set());
      }
      observationIdsByTreeId.get(obs.treeId)!.add(obs.id);
    }

    let treesWithoutPhoto = 0;
    let mostRecentPhoto: { photoUrl: string; treeNumber: string; parcelName: string; takenAt: string } | null = null;

    for (const tree of referenceTrees) {
      const obsIds = observationIdsByTreeId.get(tree.id);
      const treePhotos = obsIds
        ? (rawDb.photos || []).filter((p) => obsIds.has(p.observationId))
        : [];

      if (treePhotos.length === 0) {
        treesWithoutPhoto++;
        continue;
      }

      const latestPhoto = treePhotos.reduce((latest, p) => {
        const pTime = new Date(p.takenAt || p.createdAt).getTime();
        const latestTime = new Date(latest.takenAt || latest.createdAt).getTime();
        return pTime > latestTime ? p : latest;
      });

      const photoTimestamp = latestPhoto.takenAt || latestPhoto.createdAt;
      if (!mostRecentPhoto || new Date(photoTimestamp).getTime() > new Date(mostRecentPhoto.takenAt).getTime()) {
        mostRecentPhoto = {
          photoUrl: latestPhoto.originalUrl,
          treeNumber: tree.treeNumber,
          parcelName: parcelNameById.get(tree.parcelId) || "Bilinmeyen Parsel",
          takenAt: photoTimestamp,
        };
      }
    }

    return {
      totalReferenceTrees: referenceTrees.length,
      treesWithoutPhoto,
      mostRecentPhoto,
    };
  }
}

/**
 * Repository to manage the immutable audit trail of manual tree/plant count
 * adjustments made to a parcel (as opposed to individually tracked Tree
 * records). Entries are append-only: once created, a change log record is
 * never edited or deleted, preserving an accurate historical record of how
 * and why a parcel's tree/plant count evolved over time.
 */
export class TreeCountChangeLogRepository extends BaseRepository<TreeCountChangeLog> {
  constructor() {
    super("treeCountChangeLogs");
  }

  /**
   * Retrieves the full change history for a single parcel, most recent
   * effective change date first.
   * @param parcelId Unique parcel ID
   */
  public async getByParcelId(parcelId: string): Promise<TreeCountChangeLog[]> {
    const logs = await this.find((log) => log.parcelId === parcelId);
    return logs.sort((a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime());
  }
}

export const parcelRepository = new ParcelRepository();
export const treeRepository = new TreeRepository();
export const treeCountChangeLogRepository = new TreeCountChangeLogRepository();
