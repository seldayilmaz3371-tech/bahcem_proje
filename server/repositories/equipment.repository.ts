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
}

export const equipmentRepository = new EquipmentRepository();
