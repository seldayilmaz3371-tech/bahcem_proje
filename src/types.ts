/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = "Admin",
  WORKER = "Çalışan",
  GUEST = "Misafir"
}

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  email: string;
  phoneNumber?: string;
  createdAt: string;
}

export type CropType = "Zeytin" | "Sebze" | "Meyve";

export interface Parcel {
  id: string;
  name: string;
  cropType: CropType;
  latitude: number;
  longitude: number;
  areaDekar: number;
  treeCount: number;
  soilType: string;
  irrigationType: string;
  notes?: string;
  qrCodeData?: string;
  createdAt: string;
  updatedAt: string;
}

export type PhotoGrowthStage = "Fide" | "Gelişim" | "Çiçeklenme" | "Meyve/Ürün" | "Olgunlaşma" | "Belirsiz";

export interface PhotoAiAnalysis {
  growthStage: PhotoGrowthStage;
  healthScore: number | null;
  diseaseIndication: string | null;
  confidence: number;
  isUncertain: boolean;
  analyzedAt: string;
}

export interface Tree {
  id: string;
  parcelId: string;
  treeNumber: string;
  variety: string;
  plantingYear: number;
  latitude?: number;
  longitude?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  isReferenceTree?: boolean;
}

/** A single reference tree's identity paired with its latest known analysis (if any). */
export interface ReferenceTreeStatus {
  treeId: string;
  treeNumber: string;
  latestAnalysis: PhotoAiAnalysis | null;
}

/** Deterministic, parcel-wide health summary computed from its reference trees. */
export interface ParcelHealthSummary {
  referenceTreeCount: number;
  analyzedTreeCount: number;
  healthyCount: number;
  atRiskCount: number;
  uncertainCount: number;
  averageHealthScore: number | null;
  overallStatus: "Sağlıklı" | "Riskli Bölgeler Var" | "Belirsiz" | "Veri Yok";
  treeStatuses: ReferenceTreeStatus[];
}

export type TreeCountChangeReason =
  | "Dikim (Yeni Ekim)"
  | "Kesim/Budama"
  | "Don/Hastalık Kaybı"
  | "Sayım Düzeltmesi"
  | "Diğer";

/**
 * A single immutable historical entry recording a manual adjustment to a
 * parcel's aggregate tree/plant count.
 */
export interface TreeCountChangeLog {
  id: string;
  parcelId: string;
  previousCount: number;
  newCount: number;
  delta: number;
  reason: TreeCountChangeReason;
  notes?: string;
  changedBy: string;
  changeDate: string;
  createdAt: string;
}

export type ObservationActivityType =
  | "Genel Gözlem"
  | "İlaçlama"
  | "Sulama"
  | "Budama"
  | "Gübreleme"
  | "Biçme";

export interface Observation {
  id: string;
  parcelId: string;
  treeId?: string;
  observerId: string;
  observationDate: string;
  activityType: ObservationActivityType;
  notes: string;
  audioNotePath?: string;
  createdAt: string;
}

export interface Photo {
  id: string;
  observationId: string;
  originalUrl: string;
  thumbnailUrl: string;
  latitude?: number;
  longitude?: number;
  takenAt?: string;
  fileSize: number;
  createdAt: string;
  contentHash?: string;
  aiAnalysis?: PhotoAiAnalysis;
}

export type EquipmentStatus = "Aktif" | "Bakımda" | "Arızalı" | "Hizmet Dışı";

export interface Equipment {
  id: string;
  name: string;
  category: string;
  brand?: string;
  model?: string;
  parcelId?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  status: EquipmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItem {
  id: string;
  categoryId: string;
  name: string;
  brand?: string;
  sku?: string;
  stockQuantity: number;
  unit: string;
  minStockAlert: number;
  unitPrice: number;
  expiryDate?: string;
  invoicePhotoUrl?: string;
  labelPhotoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Cost {
  id: string;
  parcelId?: string;
  category: string;
  amount: number;
  costDate: string;
  description?: string;
  referenceId?: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  harvestId?: string;
  saleDate: string;
  buyerName?: string;
  productType: string;
  quantityKg: number;
  unitPrice: number;
  totalRevenue: number;
  notes?: string;
  isOrganikSaglikBrand: boolean;
  createdAt: string;
}

export interface Harvest {
  id: string;
  parcelId: string;
  harvestDate: string;
  quantityKg: number;
  qualityGrade: string;
  personnelCount: number;
  laborCost: number;
  transportCost: number;
  otherCosts: number;
  totalCost: number;
  notes?: string;
  createdAt: string;
}

export interface WeatherRecord {
  id: string;
  recordDate: string;
  tempMax: number;
  tempMin: number;
  humidity: number;
  windSpeed: number;
  precipitationMm: number;
  condition: string;
  hasFrostRisk: boolean;
  soilTemperature?: number;
  createdAt: string;
}

/**
 * A single day's forecast within a LiveWeatherForecast payload, sourced
 * live from the Open-Meteo external API (never fabricated).
 */
export interface LiveWeatherDailyForecast {
  date: string;
  dateLabel: string;
  tempMax: number;
  tempMin: number;
  humidityPercent: number | null;
  windSpeedMaxKmh: number;
  precipitationProbabilityPercent: number | null;
  condition: string;
  weatherCode: number;
  hasFrostRisk: boolean;
}

/**
 * Real-time current weather conditions at the farm's configured location.
 */
export interface LiveWeatherCurrentConditions {
  temperatureCelsius: number;
  apparentTemperatureCelsius: number | null;
  humidityPercent: number | null;
  windSpeedKmh: number;
  precipitationMm: number | null;
  condition: string;
  weatherCode: number;
  observedAt: string;
}

/**
 * Complete live weather forecast response returned by
 * GET /api/weather/live-forecast, always sourced from Open-Meteo.
 */
export interface LiveWeatherForecast {
  source: string;
  locationName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: string;
  current: LiveWeatherCurrentConditions;
  daily: LiveWeatherDailyForecast[];
  hasUpcomingFrostRisk: boolean;
}

export interface AIRecommendation {
  id: string;
  parcelId?: string;
  recommendationType: "Hastalık" | "Gübreleme" | "Sulama" | "Genel" | "Gelişim Analizi";
  content: string;
  confidenceScore: number;
  usedDocumentsCount: number;
  usedObservationsCount: number;
  usedWeatherCount: number;
  usedInventoryCount: number;
  createdDate: string;
}

export interface UploadedDocument {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadDate: string;
  summary?: string;
  linkedEntityType?: "equipment";
  linkedEntityId?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "Frost" | "Rain" | "LowStock" | "Task" | "System";
  isRead: boolean;
  createdAt: string;
  referenceKey?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

/**
 * Estimated Gemini API usage for a single model, as reported by
 * GET /api/ai/usage. This is a self-reported estimate maintained by the
 * application itself, not a live figure sourced from Google — Google
 * does not expose a public endpoint for querying remaining free-tier
 * quota in real time (as of July 2026).
 */
export interface AiModelUsage {
  modelName: string;
  usedToday: number;
  dailyLimit: number | null;
  remaining: number | null;
  percentageUsed: number | null;
}

/**
 * Farm-wide "Referans Ağaç" photo summary shown on the Dashboard — see
 * GET /api/reference-trees/summary. Purely aggregated counts and the
 * single most recent photo; no AI analysis involved.
 */
export interface ReferenceTreeSummary {
  totalReferenceTrees: number;
  treesWithoutPhoto: number;
  mostRecentPhoto: {
    photoUrl: string;
    treeNumber: string;
    parcelName: string;
    takenAt: string;
  } | null;
}

export interface AiUsageSnapshot {
  pacificDate: string;
  models: AiModelUsage[];
}

export type ActiveTab = 
  | "dashboard" 
  | "parcels" 
  | "observations" 
  | "inventory" 
  | "equipment"
  | "finance" 
  | "ai-advisor" 
  | "photo-growth"
  | "document-hub"
  | "activities";
