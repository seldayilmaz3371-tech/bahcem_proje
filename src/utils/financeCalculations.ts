/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cost, Sale, Harvest, Parcel } from "../types";

/**
 * Aggregate financial and yield metrics for a set of cost, sale, and
 * harvest records. Pure, deterministic computation — no side effects,
 * no dependency on React or the DOM, fully unit-testable in isolation.
 */
export interface FinancialSummary {
  totalExpenses: number;
  totalRevenues: number;
  netProfit: number;
  /** Return on investment, as a percentage. 0 when there are no expenses to divide by. */
  roiPercent: number;
  totalYieldKg: number;
  yieldPerTree: number;
  /** Average production cost per kilogram harvested. 0 when there is no yield yet. */
  costPerKg: number;
}

/**
 * Financial Calculations Utility.
 *
 * This logic previously lived directly inside FinanceManager.tsx, mixing
 * business rules (how ROI and yield-per-tree are defined) with
 * presentation code — a violation of this project's "İş kuralları
 * component içinde bulunmasın" architecture rule. Extracted here so the
 * calculation can be tested independently of any UI and reused wherever
 * else it may be needed (e.g. a future export/reporting feature) without
 * duplicating the formulas.
 *
 * @param costs All recorded cost entries
 * @param sales All recorded sale entries
 * @param harvests All recorded harvest entries
 * @param parcels All parcels, used to compute total tree count for yield-per-tree
 */
export function calculateFinancialSummary(
  costs: Cost[],
  sales: Sale[],
  harvests: Harvest[],
  parcels: Parcel[]
): FinancialSummary {
  const totalExpenses =
    costs.reduce((sum, cost) => sum + cost.amount, 0) +
    harvests.reduce((sum, harvest) => sum + harvest.totalCost, 0);

  const totalRevenues = sales.reduce((sum, sale) => sum + sale.totalRevenue, 0);
  const netProfit = totalRevenues - totalExpenses;
  const roiPercent = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : 0;

  const totalYieldKg = harvests.reduce((sum, harvest) => sum + harvest.quantityKg, 0);
  const totalTrees = parcels.reduce((sum, parcel) => sum + parcel.treeCount, 0);
  const yieldPerTree = totalTrees > 0 ? totalYieldKg / totalTrees : 0;
  const costPerKg = totalYieldKg > 0 ? totalExpenses / totalYieldKg : 0;

  return {
    totalExpenses,
    totalRevenues,
    netProfit,
    roiPercent,
    totalYieldKg,
    yieldPerTree,
    costPerKg,
  };
}
