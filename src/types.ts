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
}

export interface Observation {
  id: string;
  parcelId: string;
  treeId?: string;
  observerId: string;
  observationDate: string;
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
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: string;
  details: string;
  ipAddress?: string;
  createdAt: string;
}

export type ActiveTab = 
  | "dashboard" 
  | "parcels" 
  | "observations" 
  | "inventory" 
  | "finance" 
  | "ai-advisor" 
  | "photo-growth"
  | "document-hub"
  | "activities";
