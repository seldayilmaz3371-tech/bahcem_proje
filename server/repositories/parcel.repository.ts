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
   * Find a specific tree by tree number within a parcel (e.g. "P1-T12").
   */
  public async getByTreeNumber(parcelId: string, treeNumber: string): Promise<Tree | null> {
    return this.findOne((tree) => tree.parcelId === parcelId && tree.treeNumber === treeNumber);
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
