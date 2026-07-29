/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/weather.evaluator.test.ts */

import { WeatherEvaluator } from "./weather.evaluator";
import { WeatherRuleRepository } from "../../repositories/weather-rule.repository";
import { WeatherRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

class MockWeatherRuleRepository extends WeatherRuleRepository {
  constructor(private readonly mockRules: WeatherRule[]) { super(); }
  public async getAllActive(): Promise<WeatherRule[]> { return this.mockRules; }
}

async function main() {
  const windRule: WeatherRule = {
    id: "wr-1", name: "Rüzgar Kuralı", maxWindSpeedKmh: 15, version: 1, isActive: true,
    sourceType: "Uzman Onayı", createdAt: "",
  };

  console.log("=== supports() ===");
  const evaluator = new WeatherEvaluator(new MockWeatherRuleRepository([windRule]));
  check("Her zaman supports=true (genel geçerli)", evaluator.supports({}));

  console.log("\n=== evaluate() — hiç aktif kural yok ===");
  const emptyEvaluator = new WeatherEvaluator(new MockWeatherRuleRepository([]));
  const emptyResult = await emptyEvaluator.evaluate({});
  check("Kural yoksa NOT_APPLICABLE", emptyResult.status === "NOT_APPLICABLE");

  console.log("\n=== YENİ: evaluate() — kural var ama GÜNCEL hava verisi YOK ===");
  const resultNoData = await evaluator.evaluate({});
  check("Güncel veri yoksa INSUFFICIENT_DATA (tahmin yapılmıyor)", resultNoData.status === "INSUFFICIENT_DATA");

  console.log("\n=== YENİ: evaluate() — rüzgar eşiği İHLAL EDİLİYOR (18 > 15) ===");
  const resultViolated = await evaluator.evaluate({ currentWindSpeedKmh: 18 });
  check("Eşik ihlali varsa FAIL", resultViolated.status === "FAIL");
  check("Eşik ihlalinde blocking=true", resultViolated.blocking === true);
  check("İhlal edilen kural evidence'da", resultViolated.evidence?.includes("Rüzgar Kuralı"));

  console.log("\n=== YENİ: evaluate() — rüzgar eşiği İHLAL EDİLMİYOR (10 <= 15) ===");
  const resultOk = await evaluator.evaluate({ currentWindSpeedKmh: 10 });
  check("Eşik ihlali yoksa PASS", resultOk.status === "PASS");
  check("Eşik ihlali yoksa blocking=false", resultOk.blocking === false);

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
