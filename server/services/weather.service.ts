/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { config } from "../config";
import { logger } from "../logger";

/**
 * A single day's forecast, derived entirely from live Open-Meteo data.
 */
export interface LiveWeatherDailyForecast {
  /** ISO date string, e.g. "2026-07-03" */
  date: string;
  /** Turkish formatted label, e.g. "Cuma, 3 Tem" */
  dateLabel: string;
  tempMax: number;
  tempMin: number;
  humidityPercent: number | null;
  windSpeedMaxKmh: number;
  precipitationProbabilityPercent: number | null;
  /** Human-readable Turkish weather condition, derived from the WMO weather code */
  condition: string;
  /** Raw WMO weather interpretation code as returned by Open-Meteo */
  weatherCode: number;
  /** True when the forecasted minimum temperature is at or below the olive-tree frost threshold */
  hasFrostRisk: boolean;
}

/**
 * The current (right-now) weather conditions at the configured farm location.
 */
export interface LiveWeatherCurrentConditions {
  temperatureCelsius: number;
  apparentTemperatureCelsius: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number;
  precipitationMm: number | null;
  condition: string;
  weatherCode: number;
  /** ISO timestamp (in the location's local timezone) that this reading was observed */
  observedAt: string;
}

/**
 * Complete live weather forecast payload, always sourced from an external
 * web API (Open-Meteo) rather than any locally stored or fabricated data.
 */
export interface LiveWeatherForecast {
  /** Human-readable attribution of the data source, safe to display in UI or AI prompts */
  source: string;
  locationName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  /** ISO timestamp of when this payload was retrieved from Open-Meteo (server time) */
  fetchedAt: string;
  current: LiveWeatherCurrentConditions;
  daily: LiveWeatherDailyForecast[];
  /** True if any of the returned forecast days carries a frost risk */
  hasUpcomingFrostRisk: boolean;
}

/**
 * Internal shape of the raw Open-Meteo /v1/forecast JSON response.
 * Only the fields actually requested and consumed are declared here.
 */
interface OpenMeteoRawResponse {
  timezone: string;
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m: number;
    precipitation?: number;
    weather_code: number;
  };
  daily?: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    relative_humidity_2m_mean?: number[];
    wind_speed_10m_max: number[];
    precipitation_probability_max?: number[];
    weather_code: number[];
  };
}

/**
 * Live Weather Integration Service.
 *
 * Responsible exclusively for retrieving real, current, and forecasted
 * meteorological conditions for the farm's configured coordinates from the
 * Open-Meteo public weather API (https://open-meteo.com). Open-Meteo
 * requires no API key for non-commercial use, which keeps this integration
 * free of secret management while still providing genuine, verifiable data.
 *
 * This service NEVER fabricates, randomizes, or falls back to synthetic
 * weather values. If the external API is unreachable or returns malformed
 * data, callers receive a thrown error so they can surface an honest
 * "data unavailable" state instead of silently displaying invented numbers.
 *
 * Results are cached in-memory for a short interval to avoid redundant
 * external calls when multiple parts of the application (dashboard,
 * AI decision support) request weather data in quick succession.
 */
export class WeatherService {
  private static readonly API_BASE_URL = "https://api.open-meteo.com/v1/forecast";
  private static readonly REQUEST_TIMEOUT_MS = 8000;
  private static readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly FORECAST_DAYS = 4;

  /**
   * Minimum forecasted temperature (°C) at or below which young olive tree
   * buds/blossoms are considered at risk of frost damage. Mirrors the
   * agronomic threshold previously used by the dashboard's forecast display.
   */
  public static readonly FROST_RISK_THRESHOLD_CELSIUS = 3;

  private cachedForecast: LiveWeatherForecast | null = null;
  private cachedAtEpochMs = 0;

  /**
   * Retrieves the current live weather forecast for the farm's configured
   * location. Serves a cached result when available and still fresh unless
   * a forced refresh is requested.
   * @param forceRefresh When true, bypasses the cache and always calls Open-Meteo.
   * @throws Error if the external API request fails or returns an unusable payload.
   */
  public async getLiveForecast(forceRefresh = false): Promise<LiveWeatherForecast> {
    const isCacheFresh = this.cachedForecast !== null && Date.now() - this.cachedAtEpochMs < WeatherService.CACHE_TTL_MS;

    if (!forceRefresh && isCacheFresh) {
      return this.cachedForecast!;
    }

    const forecast = await this.fetchFromOpenMeteo();
    this.cachedForecast = forecast;
    this.cachedAtEpochMs = Date.now();
    return forecast;
  }

  /**
   * Builds a compact, source-labeled text block summarizing the current live
   * forecast, suitable for direct inclusion in an AI prompt. If live data
   * cannot be retrieved, returns an explicit unavailability notice instead
   * of omitting the section or inventing placeholder values, so the AI model
   * never mistakes missing data for "no risk."
   */
  public async getWeatherSummaryForAI(): Promise<{ text: string; available: boolean; daysUsed: number }> {
    try {
      const forecast = await this.getLiveForecast();

      const dailyLines = forecast.daily
        .map(
          (day) =>
            `[${day.dateLabel}]: ${day.condition}, En Yüksek ${day.tempMax}°C / En Düşük ${day.tempMin}°C` +
            `${day.humidityPercent !== null ? `, Nem %${day.humidityPercent}` : ""}` +
            `, Rüzgar ${day.windSpeedMaxKmh}km/h, Don Riski: ${day.hasFrostRisk ? "EVET" : "HAYIR"}`
        )
        .join("\n");

      const text =
        `Şu An (${forecast.current.observedAt}): ${forecast.current.condition}, ${forecast.current.temperatureCelsius}°C` +
        `${forecast.current.humidityPercent !== null ? `, Nem %${forecast.current.humidityPercent}` : ""}, Rüzgar ${forecast.current.windSpeedKmh}km/h\n` +
        `${dailyLines}\n` +
        `Genel Don Riski Durumu (Önümüzdeki ${forecast.daily.length} Gün): ${forecast.hasUpcomingFrostRisk ? "RİSK VAR" : "RİSK YOK"}`;

      return { text, available: true, daysUsed: forecast.daily.length };
    } catch (error) {
      logger.warn(
        "WEATHER",
        "Canlı hava durumu verisi AI karar destek modülü için alınamadı; bu bölüm 'veri yok' olarak işaretlendi.",
        { reason: error instanceof Error ? error.message : String(error) }
      );
      return {
        text: "Canlı harici hava durumu verisi şu anda alınamadı (Open-Meteo API'sine ulaşılamıyor). Bu değerlendirmede güncel meteorolojik veri KULLANILAMAMIŞTIR; sadece aşağıdaki yerel kayıtlara güvenilmelidir.",
        available: false,
        daysUsed: 0,
      };
    }
  }

  /**
   * Performs the actual HTTP request to Open-Meteo, validates and transforms
   * the raw response into the service's structured, strongly-typed shape.
   */
  private async fetchFromOpenMeteo(): Promise<LiveWeatherForecast> {
    const { latitude, longitude, locationName } = config.geography;

    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation",
      daily: "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,wind_speed_10m_max,precipitation_probability_max,weather_code",
      timezone: "auto",
      forecast_days: String(WeatherService.FORECAST_DAYS),
    });

    const requestUrl = `${WeatherService.API_BASE_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), WeatherService.REQUEST_TIMEOUT_MS);

    try {
      logger.info("WEATHER", "Open-Meteo API isteği gönderiliyor.", { latitude, longitude, locationName });

      const response = await fetch(requestUrl, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Open-Meteo API HTTP ${response.status} durum koduyla yanıt verdi.`);
      }

      const raw = (await response.json()) as OpenMeteoRawResponse;

      if (!raw.current || !raw.daily || !Array.isArray(raw.daily.time) || raw.daily.time.length === 0) {
        throw new Error("Open-Meteo API beklenmeyen veya eksik bir veri formatı döndürdü.");
      }

      const forecast = this.mapRawResponseToForecast(raw, latitude, longitude, locationName);

      logger.info(
        "WEATHER",
        `Canlı hava durumu başarıyla alındı. Şu anki sıcaklık: ${forecast.current.temperatureCelsius}°C, Don riski: ${forecast.hasUpcomingFrostRisk ? "VAR" : "YOK"}.`
      );

      return forecast;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        logger.error("WEATHER", `Open-Meteo API isteği ${WeatherService.REQUEST_TIMEOUT_MS}ms zaman aşımına uğradı.`, error);
        throw new Error("Hava durumu servisine bağlanırken zaman aşımı oluştu.");
      }
      logger.error("WEATHER", "Open-Meteo API isteği başarısız oldu.", error);
      throw error instanceof Error ? error : new Error("Hava durumu servisinden bilinmeyen bir hata alındı.");
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Transforms the raw Open-Meteo JSON payload into the service's public,
   * strongly-typed forecast shape, computing frost-risk flags along the way.
   */
  private mapRawResponseToForecast(
    raw: OpenMeteoRawResponse,
    latitude: number,
    longitude: number,
    locationName: string
  ): LiveWeatherForecast {
    const dailyFormatter = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "short" });

    const daily: LiveWeatherDailyForecast[] = raw.daily!.time.map((isoDate, index) => {
      const tempMin = raw.daily!.temperature_2m_min[index];
      const weatherCode = raw.daily!.weather_code[index];
      return {
        date: isoDate,
        dateLabel: dailyFormatter.format(new Date(`${isoDate}T12:00:00`)),
        tempMax: Math.round(raw.daily!.temperature_2m_max[index]),
        tempMin: Math.round(tempMin),
        humidityPercent: raw.daily!.relative_humidity_2m_mean
          ? Math.round(raw.daily!.relative_humidity_2m_mean[index])
          : null,
        windSpeedMaxKmh: Math.round(raw.daily!.wind_speed_10m_max[index]),
        precipitationProbabilityPercent: raw.daily!.precipitation_probability_max
          ? Math.round(raw.daily!.precipitation_probability_max[index])
          : null,
        condition: this.mapWeatherCodeToCondition(weatherCode),
        weatherCode,
        hasFrostRisk: tempMin <= WeatherService.FROST_RISK_THRESHOLD_CELSIUS,
      };
    });

    const current: LiveWeatherCurrentConditions = {
      temperatureCelsius: Math.round(raw.current!.temperature_2m),
      apparentTemperatureCelsius:
        raw.current!.apparent_temperature !== undefined ? Math.round(raw.current!.apparent_temperature) : null,
      humidityPercent: raw.current!.relative_humidity_2m !== undefined ? Math.round(raw.current!.relative_humidity_2m) : null,
      windSpeedKmh: Math.round(raw.current!.wind_speed_10m),
      precipitationMm: raw.current!.precipitation !== undefined ? raw.current!.precipitation : null,
      condition: this.mapWeatherCodeToCondition(raw.current!.weather_code),
      weatherCode: raw.current!.weather_code,
      observedAt: raw.current!.time,
    };

    return {
      source: "Open-Meteo (api.open-meteo.com) — Canlı Harici Hava Durumu API'si",
      locationName,
      latitude,
      longitude,
      timezone: raw.timezone,
      fetchedAt: new Date().toISOString(),
      current,
      daily,
      hasUpcomingFrostRisk: daily.some((day) => day.hasFrostRisk),
    };
  }

  /**
   * Translates a WMO (World Meteorological Organization) weather
   * interpretation code, as returned by Open-Meteo, into a concise Turkish
   * condition label consistent with the application's existing terminology.
   * @param code WMO weather interpretation code (see https://open-meteo.com/en/docs)
   */
  private mapWeatherCodeToCondition(code: number): string {
    const conditionMap: Record<number, string> = {
      0: "Açık ve Güneşli",
      1: "Genellikle Açık",
      2: "Parçalı Bulutlu",
      3: "Kapalı / Bulutlu",
      45: "Sisli",
      48: "Kırağı Sisi",
      51: "Hafif Çisenti",
      53: "Çisenti",
      55: "Yoğun Çisenti",
      56: "Donan Hafif Çisenti",
      57: "Donan Yoğun Çisenti",
      61: "Hafif Yağmurlu",
      63: "Yağmurlu",
      65: "Kuvvetli Yağmurlu",
      66: "Donan Hafif Yağmur",
      67: "Donan Kuvvetli Yağmur",
      71: "Hafif Kar Yağışlı",
      73: "Kar Yağışlı",
      75: "Kuvvetli Kar Yağışlı",
      77: "Kar Taneli",
      80: "Hafif Sağanak Yağışlı",
      81: "Sağanak Yağışlı",
      82: "Kuvvetli Sağanak Yağışlı",
      85: "Hafif Kar Sağanağı",
      86: "Kuvvetli Kar Sağanağı",
      95: "Gök Gürültülü Fırtına",
      96: "Dolu ile Gök Gürültülü Fırtına",
      99: "Şiddetli Dolu ile Fırtına",
    };

    return conditionMap[code] || "Bilinmeyen Hava Durumu";
  }
}

export const weatherService = new WeatherService();
