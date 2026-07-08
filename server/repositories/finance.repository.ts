/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { Harvest, Cost, Sale } from "../models";
import { db } from "../database";

/**
 * Repository to manage Harvest (Hasat) Records.
 */
export class HarvestRepository extends BaseRepository<Harvest> {
  constructor() {
    super("harvest");
  }

  /**
   * Retrieves harvest runs for a specific land parcel.
   */
  public async getByParcelId(parcelId: string): Promise<Harvest[]> {
    return this.find((h) => h.parcelId === parcelId);
  }
}

/**
 * Repository to manage Farm expenditures (Giderler).
 */
export class CostRepository extends BaseRepository<Cost> {
  constructor() {
    super("costs");
  }

  /**
   * Retrieves expenditures associated with a specific land parcel.
   */
  public async getByParcelId(parcelId: string): Promise<Cost[]> {
    return this.find((c) => c.parcelId === parcelId);
  }

  /**
   * Retrieves expenditures associated with an operation reference ID.
   */
  public async getByReferenceId(refId: string): Promise<Cost[]> {
    return this.find((c) => c.referenceId === refId);
  }
}

/**
 * Repository to manage Sales & Revenues (Gelirler).
 */
export class SaleRepository extends BaseRepository<Sale> {
  constructor() {
    super("sales");
  }

  /**
   * Retrieves sales logged under our organic trade label: "Organik Sağlık".
   */
  public async getOrganikSaglikSales(): Promise<Sale[]> {
    return this.find((s) => s.isOrganikSaglikBrand);
  }
}

export const harvestRepository = new HarvestRepository();
export const costRepository = new CostRepository();
export const saleRepository = new SaleRepository();
