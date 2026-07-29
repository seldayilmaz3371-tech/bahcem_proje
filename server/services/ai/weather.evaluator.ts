/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseEvaluator, EvaluatorContext, EvaluatorResult } from "./evaluator-framework.service";
import { WeatherRuleRepository } from "../../repositories/weather-rule.repository";
import { WeatherRule } from "../../models";

/**
 * Sprint 5E — Rule Evaluation. Artık aktif kuralları LİSTELEMEKLE
 * kalmıyor — her kuralın eşik alanlarını (maxWindSpeedKmh vb.),
 * context'teki GERÇEK, o anki hava ölçümüyle KARŞILAŞTIRIYOR. Hiçbir
 * eşik ihlali yoksa PASS; herhangi biri ihlal edilmişse BLOCK
 * (uygulama güvenli değil).
 */
export class WeatherEvaluator extends BaseEvaluator {
  public readonly name = "WeatherEvaluator";

  constructor(private readonly weatherRuleRepository: WeatherRuleRepository) {
    super();
  }

  public supports(context: EvaluatorContext): boolean {
    // Hava kuralları genel geçerlidir (belirli bir bitkiye/ürüne bağlı değil), her bağlamda anlamlı.
    return true;
  }

  protected async doEvaluate(context: EvaluatorContext): Promise<EvaluatorResult> {
    const activeRules = await this.weatherRuleRepository.getAllActive();

    if (activeRules.length === 0) {
      return {
        status: "NOT_APPLICABLE",
        priority: "INFO",
        blocking: false,
        reason: "Aktif bir hava kuralı bulunamadı.",
        metadata: { loadedRuleCount: 0, activeRuleCount: 0 },
      };
    }

    const hasLiveWeatherData =
      context.currentWindSpeedKmh !== undefined ||
      context.currentTemperatureC !== undefined ||
      context.currentHumidityPercent !== undefined ||
      context.isPrecipitating !== undefined;

    if (!hasLiveWeatherData) {
      return {
        status: "INSUFFICIENT_DATA",
        priority: "HIGH",
        blocking: false,
        reason: `${activeRules.length} aktif hava kuralı var, ancak GÜNCEL hava verisi sağlanmadığı için karşılaştırma yapılamadı.`,
        metadata: { loadedRuleCount: activeRules.length, activeRuleCount: activeRules.length },
      };
    }

    const violatedRules = activeRules.filter((rule) => this.violatesRule(rule, context));

    return {
      status: violatedRules.length === 0 ? "PASS" : "FAIL",
      priority: violatedRules.length === 0 ? "INFO" : "CRITICAL",
      blocking: violatedRules.length > 0,
      reason: violatedRules.length === 0
        ? "Güncel hava koşulları, tüm aktif kuralların sınırları içinde."
        : `Güncel hava koşulları ${violatedRules.length} kuralı İHLAL EDİYOR.`,
      evidence: violatedRules.map((r) => r.name),
      metadata: { loadedRuleCount: activeRules.length, activeRuleCount: activeRules.length },
    };
  }

  /** Bir WeatherRule'ın herhangi bir eşiğinin, context'teki güncel değerlerce İHLAL edilip edilmediğini kontrol eder. Yalnızca HEM kuralda HEM context'te dolu olan alanlar karşılaştırılır. */
  private violatesRule(rule: WeatherRule, context: EvaluatorContext): boolean {
    if (rule.maxWindSpeedKmh !== undefined && context.currentWindSpeedKmh !== undefined && context.currentWindSpeedKmh > rule.maxWindSpeedKmh) {
      return true;
    }
    if (rule.minTemperatureC !== undefined && context.currentTemperatureC !== undefined && context.currentTemperatureC < rule.minTemperatureC) {
      return true;
    }
    if (rule.maxTemperatureC !== undefined && context.currentTemperatureC !== undefined && context.currentTemperatureC > rule.maxTemperatureC) {
      return true;
    }
    if (rule.maxHumidityPercent !== undefined && context.currentHumidityPercent !== undefined && context.currentHumidityPercent > rule.maxHumidityPercent) {
      return true;
    }
    if (rule.forbidsDuringPrecipitation && context.isPrecipitating === true) {
      return true;
    }
    return false;
  }
}
