/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseRepository } from "./base.repository";
import { PlantInfo } from "../models";

/**
 * Repository for the Bitki Bilgi Sözlüğü (Plant Info Dictionary).
 *
 * Sprint 1 scope only: plain CRUD over PlantInfo records. Deliberately
 * NOT wired into any AI/RAG/Intent Router flow yet — those connections
 * are an explicitly separate, later sprint (see PlantInfo in models.ts).
 */
export class PlantInfoRepository extends BaseRepository<PlantInfo> {
  constructor() {
    super("plantInfo");
  }

  /**
   * Case-insensitive lookup by plant name — the natural way this
   * dictionary will eventually be queried once connected to AI/RAG,
   * even though nothing calls this yet in Sprint 1.
   */
  public async getByName(name: string): Promise<PlantInfo | null> {
    const normalized = name.trim().toLowerCase();
    return this.findOne((p) => p.name.trim().toLowerCase() === normalized);
  }
}

export const plantInfoRepository = new PlantInfoRepository();
