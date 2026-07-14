/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * User Roles Enum
 */
export enum UserRole {
  ADMIN = "Admin",
  WORKER = "Çalışan",
  GUEST = "Misafir"
}

/**
 * 1. Users Table Schema
 */
export interface User {
  id: string; // UUID
  username: string;
  passwordHash: string; // bcrypt hash
  fullName: string;
  role: UserRole;
  email: string;
  phoneNumber?: string;
  createdAt: string; // ISO DateTime
  updatedAt: string; // ISO DateTime
  isActive: boolean;
}

/**
 * 2. Roles Table Schema
 */
export interface Role {
  id: string;
  name: UserRole;
  description: string;
  permissions: string[]; // List of permission codes e.g. "parcels:write", "finance:read"
}

/**
 * Crop Type Enum
 * Distinguishes olive orchards from other vegetable/fruit cultivation parcels,
 * allowing the existing Parcel/Tree infrastructure (observations, applications,
 * harvests, finance, AI recommendations) to be reused for non-olive crops.
 */
export type CropType = "Zeytin" | "Sebze" | "Meyve";

/**
 * 3. Parcels Table Schema (Mersin Toroslar / Değirmençay fields)
 */
export interface Parcel {
  id: string;
  name: string; // e.g. "Değirmençay Merkez Zeytinlik"
  cropType: CropType; // Ürün türü: Zeytin, Sebze veya Meyve
  latitude: number;
  longitude: number;
  areaDekar: number; // Alan bilgisi (Dekar)
  treeCount: number;
  soilType: string; // e.g. "Killi-Tınlı", "Kireçli"
  irrigationType: string; // e.g. "Damlama", "Yağmurlama", "Kuru"
  notes?: string;
  qrCodeData?: string; // Serialized link or token
  createdAt: string;
  updatedAt: string;
}

/**
 * 4. Trees Table Schema (Tree-by-tree tracking option)
 */
export interface Tree {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  treeNumber: string; // e.g. "P1-T12"
  variety: string; // e.g. "Ayvalık", "Gemlik", "Sarıulak"
  plantingYear: number;
  latitude?: number;
  longitude?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Marks this tree as a "Referans Ağaç" — a representative sample tree
   * chosen by the farmer to stand in for the whole parcel's condition.
   * Large parcels may have hundreds of trees; analyzing every single one
   * is neither practical nor a wise use of AI quota (see PERFORMANS
   * principle). Instead, a small set of reference trees receives closer
   * photo-based monitoring, and the parcel's overall health is inferred
   * deterministically from just these trees (see
   * growth-scoring.util.ts's summarizeParcelHealthFromReferenceTrees —
   * Gemini is never re-invoked for this aggregation). Optional and
   * defaults to falsy for backward compatibility with existing trees.
   */
  isReferenceTree?: boolean;
}

/**
 * Reason categories for a manual tree/plant count adjustment. Kept as a
 * closed set (validated server-side) so historical change logs remain
 * consistent and reportable, while still allowing free-text detail via
 * the accompanying `notes` field.
 */
export type TreeCountChangeReason =
  | "Dikim (Yeni Ekim)"
  | "Kesim/Budama"
  | "Don/Hastalık Kaybı"
  | "Sayım Düzeltmesi"
  | "Diğer";

/**
 * 4b. TreeCountChangeLogs Table Schema
 * Records every manual adjustment made to a parcel's aggregate treeCount
 * (as opposed to individually tracked Tree records). Each entry is an
 * immutable historical fact: once created, it is never edited or deleted,
 * preserving an accurate audit trail of how and why a parcel's tree/plant
 * count changed over time. Past Harvest and ProfitReport records are never
 * recalculated when a new entry is added here.
 */
export interface TreeCountChangeLog {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  previousCount: number; // treeCount value immediately before this change
  newCount: number; // treeCount value immediately after this change
  delta: number; // newCount - previousCount (positive = increase, negative = decrease)
  reason: TreeCountChangeReason;
  notes?: string;
  changedBy: string; // Foreign Key to Users
  changeDate: string; // Effective date of the change, as reported by the user (ISO date)
  createdAt: string; // When this log entry was recorded in the system
}

/**
 * Classifies what kind of field activity a Saha Gözlemi (Observation)
 * record represents. "Genel Gözlem" is the default/backward-compatible
 * category for free-form observations that are not a specific operation.
 * The remaining values represent concrete field operations a farmer
 * performs on a parcel: spraying, irrigation, pruning, fertilizing, and
 * mowing/reaping. Intentionally NOT linked to inventory stock or the
 * financial ledger — this is a lightweight activity log only.
 */
export type ObservationActivityType =
  | "Genel Gözlem"
  | "İlaçlama"
  | "Sulama"
  | "Budama"
  | "Gübreleme"
  | "Biçme";

/**
 * 5. Observations Table Schema (Gözlem Modülü)
 */
export interface Observation {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  treeId?: string; // Optional Foreign Key to Trees
  observerId: string; // Foreign Key to Users
  observationDate: string; // Date
  activityType: ObservationActivityType; // What kind of field activity this entry represents
  notes: string;
  audioNotePath?: string; // Path to recorded audio note
  createdAt: string;
}

/**
 * Categorical growth stage assessed from a single field photo. Kept as a
 * closed set of realistically photo-assessable stages — deliberately
 * excludes overly precise measurements (e.g. an exact height in cm or an
 * exact leaf count) that a vision model cannot reliably determine from a
 * single 2D image, since presenting such fabricated precision as fact
 * would violate this project's "doğruluk yaratıcılıktan daha önemlidir"
 * principle.
 */
export type PhotoGrowthStage = "Fide" | "Gelişim" | "Çiçeklenme" | "Meyve/Ürün" | "Olgunlaşma" | "Belirsiz";

/**
 * One-time, AI-derived structured analysis of a single field photo.
 * Generated exactly once per distinct photo (see PhotoRepository's
 * content-hash lookup) and then persisted permanently — the underlying
 * image is never re-sent to Gemini for analysis again. This is
 * explicitly an "AI Analizi" category record (see TARIMSAL KARAR DESTEK
 * SİSTEMİ bilgi kategorileri): it reflects Gemini's assessment, not a
 * verified/ground-truth fact, and must always be treated as such by any
 * consumer that presents it to a user or feeds it into further logic.
 */
export interface PhotoAiAnalysis {
  growthStage: PhotoGrowthStage;
  /** Approximate visual health assessment, 0-100. Null if the model could not assess this confidently. */
  healthScore: number | null;
  /** Short description of a visible disease/pest indication, or null if none was detected. */
  diseaseIndication: string | null;
  /** Model's own confidence in this analysis, 0-1. */
  confidence: number;
  /** True when confidence fell at or below this application's low-confidence threshold (see growth-scoring.util.ts) — the analysis should be treated as inconclusive rather than acted upon. */
  isUncertain: boolean;
  /** ISO timestamp of when this analysis was generated. */
  analyzedAt: string;
}

/**
 * 6. Photos Table Schema (Exif tracking, multi-image support)
 */
export interface Photo {
  id: string;
  observationId: string; // Foreign Key to Observations
  originalUrl: string; // Saved path
  thumbnailUrl: string; // Autogenerated 150x150 path
  latitude?: number; // GPS read from EXIF
  longitude?: number; // GPS read from EXIF
  takenAt?: string; // Captured date read from EXIF
  fileSize: number;
  createdAt: string;
  /**
   * SHA-256 hash of the photo's decoded image bytes, computed at upload
   * time. Used to detect when the exact same image has been uploaded
   * more than once, so its one-time AI analysis can be reused instead of
   * calling Gemini again. Optional so existing photos created before
   * this field existed remain valid without any migration.
   */
  contentHash?: string;
  /**
   * One-time structured AI analysis of this photo (see PhotoAiAnalysis).
   * Absent until the first time this photo is actually needed for a
   * growth analysis — computed lazily, not on every upload, to avoid
   * spending AI quota on photos that are never used for growth tracking.
   */
  aiAnalysis?: PhotoAiAnalysis;
}

/**
 * 6b. Equipment Table Schema (Tarımsal Ekipman / Demirbaş Takibi)
 *
 * Distinct from InventoryItem (7): InventoryItem models consumable stock
 * (fertilizer, pesticide — has stockQuantity, unit, expiryDate). Equipment
 * models durable assets (motorized tools, machinery) that are used, may
 * break down, have maintenance history and manuals, but are never
 * "consumed" or restocked in units.
 */
export type EquipmentStatus = "Aktif" | "Bakımda" | "Arızalı" | "Hizmet Dışı";

export interface Equipment {
  id: string;
  name: string; // e.g. "Honda GX35 Çapa Motoru"
  category: string; // e.g. "Çapa Motoru", "Su Motoru", "Ot Biçme Makinesi", "Budama Makası"
  brand?: string;
  model?: string;
  parcelId?: string; // Optional FK: bos birakilirsa genel ciftlik demirbasidir (birden fazla parselde kullanilabilir)
  purchaseDate?: string;
  purchasePrice?: number; // TL
  status: EquipmentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 7. Inventory Table Schema (Depo stok takibi)
 */
export interface InventoryItem {
  id: string;
  categoryId: string; // Foreign Key to InventoryCategories
  name: string; // e.g. "Hektaş Bakır Sülfat"
  brand?: string;
  sku?: string;
  stockQuantity: number;
  unit: string; // e.g. "Litre", "Kg", "Adet"
  minStockAlert: number; // Minimum stock warning threshold
  unitPrice: number; // Cost per unit (TL)
  expiryDate?: string;
  invoicePhotoUrl?: string;
  labelPhotoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 8. InventoryCategories Table Schema
 */
export interface InventoryCategory {
  id: string;
  name: string; // e.g. "İlaç", "Gübre", "Biyolojik Ürün", "Alet"
  description?: string;
}

/**
 * 9. Fertilizers Table Schema (Nutrient tracking helper)
 */
export interface Fertilizer {
  id: string;
  inventoryItemId: string; // Foreign Key to InventoryItem
  npkRatio?: string; // e.g. "15-15-15"
  organicContentPercent?: number;
  microElements?: string; // e.g. "Bor, Çinko"
}

/**
 * 10. Chemicals Table Schema (Pesticides, fungicides)
 */
export interface Chemical {
  id: string;
  inventoryItemId: string; // Foreign Key to InventoryItem
  activeIngredient: string; // Etken madde
  targetPests: string[]; // e.g. ["Zeytin Sineği", "Halkalı Leke"]
  preHarvestIntervalDays: number; // Hasat öncesi bekleme süresi (PH)
}

/**
 * 11b. ProductApplications Table Schema — simple record-keeping of which
 * parcels/reference trees a fertilizer/chemical/biological product was
 * applied to, and when.
 *
 * Deliberately NOT the same as the older `Application` interface below
 * (see denetim/audit notes): that model assumes automatic stock
 * deduction (`totalAmountUsed`) and a single parcel per record. This one
 * is a plain history log per explicit design decision — no stock math,
 * multiple parcels/trees per single application (e.g. "aynı gübreyi 3
 * parsele birden uyguladım"). The older `Application`/`Irrigation`
 * interfaces are left untouched, in case a future, more structured
 * (stock-linked) workflow is decided on separately.
 */
export interface ProductApplication {
  id: string;
  inventoryItemId: string; // Foreign Key to InventoryItem — which product was used
  applicationDate: string;
  parcelIds: string[]; // one or more parcels this was applied to
  treeIds: string[]; // zero or more specific (reference) trees within those parcels
  amountNote?: string; // free-text quantity note (e.g. "2 litre") — not tied to stock deduction
  notes?: string;
  createdAt: string;
}

/**
 * 11. Applications Table Schema (İlaçlama/Gübreleme Uygulama Geçmişi)
 */
export interface Application {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  inventoryItemId: string; // Foreign Key to InventoryItem (Fertilizer or Chemical used)
  applicatorId: string; // Foreign Key to Users (Kim uyguladı)
  applicationDate: string;
  appliedDosage: number; // m2 or tree dosage
  dosageUnit: string; // e.g. "gr/Ağaç", "lt/Dekar"
  totalAmountUsed: number; // stock reduction
  weatherCondition?: string; // e.g. "Güneşli, Rüzgarsız"
  applicationNotes?: string;
  totalCost: number; // Calculated dynamically: totalAmountUsed * item.unitPrice
  createdAt: string;
}

/**
 * 12. Irrigation Table Schema (Sulama Geçmişi)
 */
export interface Irrigation {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  irrigationDate: string;
  durationMinutes: number; // Süre
  waterVolumeLiters: number; // Su miktarı
  method: string; // e.g. "Damlama", "Salma"
  waterCost: number; // Su maliyeti
  notes?: string;
  createdAt: string;
}

/**
 * 13. Harvest Table Schema (Hasat Kayıtları)
 */
export interface Harvest {
  id: string;
  parcelId: string; // Foreign Key to Parcels
  harvestDate: string;
  quantityKg: number; // kg miktar
  qualityGrade: string; // e.g. "Sızmalık", "Sofralık", "Dip Zeytini"
  personnelCount: number; // Çalışan sayısı
  laborCost: number; // İşçilik maliyeti
  transportCost: number; // Nakliye maliyeti
  otherCosts: number; // Diğer masraflar
  totalCost: number; // Toplam hasat maliyeti
  notes?: string;
  createdAt: string;
}

/**
 * 14. Costs Table Schema (Genel Maliyetler / Giderler)
 */
export interface Cost {
  id: string;
  parcelId?: string; // Optional FK (Genel çiftlik maliyeti ise boş kalabilir)
  category: string; // e.g. "İlaçlama", "Gübreleme", "Sulama", "Yakıt", "Budama", "İşçilik", "Amortisman"
  amount: number; // TL
  costDate: string;
  description?: string;
  referenceId?: string; // Linked ID to Irrigation, Application, Harvest etc.
  createdAt: string;
}

/**
 * 15. Sales Table Schema (Gelirler)
 */
export interface Sale {
  id: string;
  harvestId?: string; // Optional reference to Harvest run
  saleDate: string;
  buyerName?: string; // e.g. "Mersin Tariş Zeytin Kooperatifi" or "Organik Sağlık Markası"
  productType: string; // e.g. "Zeytinyağı (Sızma)", "Sofralık Yeşil Zeytin"
  quantityKg: number;
  unitPrice: number; // TL/kg
  totalRevenue: number; // TL (quantityKg * unitPrice)
  notes?: string;
  isOrganikSaglikBrand: boolean; // "Organik Sağlık" markası altındaki ürünler için
  createdAt: string;
}

/**
 * 17. WeatherHistory Table Schema
 */
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
 * 19. AIRecommendations Table Schema (Yapay Zeka Tavsiyeleri)
 */
export interface AIRecommendation {
  id: string;
  parcelId?: string;
  treeId?: string; // Set only when the report is scoped to a single reference tree (see Gelişim Analizi)
  recommendationType: "Hastalık" | "Gübreleme" | "Sulama" | "Genel" | "Gelişim Analizi";
  content: string;
  confidenceScore: number; // AI Güven Skoru
  usedDocumentsCount: number;
  usedObservationsCount: number;
  usedWeatherCount: number;
  usedInventoryCount: number;
  createdDate: string;
}

/**
 * 20. UploadedDocuments Table Schema (RAG Doküman Havuzu)
 */
export interface UploadedDocument {
  id: string;
  fileName: string;
  fileType: string; // "pdf" | "docx" | "txt" | "md"
  fileSize: number;
  uploadedBy: string; // User ID
  uploadDate: string;
  summary?: string;
  // Optional scoping: when set, this document belongs to a specific
  // entity (e.g. one piece of equipment's user manual) rather than the
  // general shared knowledge base. Undefined/omitted (the default for
  // every document uploaded before this field existed, and for general
  // farming documents uploaded today) means "part of the global RAG
  // pool", exactly as before this field was introduced.
  linkedEntityType?: "equipment";
  linkedEntityId?: string;
  /**
   * SHA-256 hash of the document's raw text content, used to detect
   * near-instant re-uploads of the exact same text (see denetim
   * özelliği: yükleme öncesi içerik tekrarı uyarısı). Optional so
   * documents uploaded before this field existed remain valid —
   * they simply never match against anything new.
   */
  contentHash?: string;
}

/**
 * 21. VectorChunks Table Schema (RAG Chunks & Embeddings)
 */
export interface VectorChunk {
  id: string;
  documentId: string; // Foreign Key to UploadedDocuments
  chunkIndex: number;
  content: string;
  embeddings: number[]; // JSON represented float array
}

/**
 * 22. Notifications Table Schema (Akıllı Bildirimler)
 */
export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "Frost" | "Rain" | "LowStock" | "Task" | "System";
  isRead: boolean;
  targetRole?: UserRole; // Broadcast to role
  createdAt: string;
  /**
   * Stable identifier for the specific condition this notification
   * represents (e.g. "lowstock-<itemId>" or "frost-<date>"), used to
   * avoid creating a duplicate unread notification for the same
   * still-ongoing condition on every periodic check. Optional for
   * backward compatibility with notifications created before this field
   * existed.
   */
  referenceKey?: string;
}

/**
 * 23. ActivityLogs Table Schema (Denetim & Güvenlik Takibi)
 */
export interface ActivityLog {
  id: string;
  userId: string; // Foreign Key to Users
  action: string; // e.g. "PARCEL_CREATE", "LOGIN_SUCCESS"
  details: string;
  ipAddress?: string;
  createdAt: string;
}

/**
 * 24. Settings Table Schema (Sistem Parametreleri)
 */
export interface SystemSetting {
  key: string; // e.g. "theme", "language", "backup_interval"
  value: string;
  updatedAt: string;
}

/**
 * Database Container Schema representing the full relational file database structure on disk.
 */
export interface DatabaseSchema {
  users: User[];
  roles: Role[];
  parcels: Parcel[];
  trees: Tree[];
  treeCountChangeLogs: TreeCountChangeLog[];
  observations: Observation[];
  photos: Photo[];
  inventory: InventoryItem[];
  equipment: Equipment[];
  inventoryCategories: InventoryCategory[];
  fertilizers: Fertilizer[];
  chemicals: Chemical[];
  productApplications: ProductApplication[];
  applications: Application[];
  irrigation: Irrigation[];
  harvest: Harvest[];
  costs: Cost[];
  sales: Sale[];
  weatherHistory: WeatherRecord[];
  aiRecommendations: AIRecommendation[];
  uploadedDocuments: UploadedDocument[];
  vectorChunks: VectorChunk[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
  settings: SystemSetting[];
}
