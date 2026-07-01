/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { Parcel, Tree } from "../models";
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

export const parcelRepository = new ParcelRepository();
export const treeRepository = new TreeRepository();
