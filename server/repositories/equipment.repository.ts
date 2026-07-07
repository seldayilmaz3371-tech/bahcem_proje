/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { Equipment } from "../models";

/**
 * Repository to manage farm Equipment (Ekipman/Demirbaş) records:
 * motorized tools and machinery. Distinct from InventoryRepository, which
 * manages consumable stock (fertilizer, pesticide).
 */
export class EquipmentRepository extends BaseRepository<Equipment> {
  constructor() {
    super("equipment");
  }

  /**
   * Retrieves equipment assigned to a specific land parcel. Equipment
   * with no parcelId (general farm equipment) is not included.
   */
  public async getByParcelId(parcelId: string): Promise<Equipment[]> {
    return this.find((e) => e.parcelId === parcelId);
  }
}

export const equipmentRepository = new EquipmentRepository();
