/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { authService } from "./server/services/auth.service";
import { settingService } from "./server/services/setting.service";
import { aiService } from "./server/services/ai.service";
import { aiUsageTrackerService } from "./server/services/ai-usage-tracker.service";
import { MAX_USER_QUERY_LENGTH } from "./server/prompts/prompt-safety.util";
import { userRepository } from "./server/repositories/user.repository";
import { parcelRepository, treeRepository, treeCountChangeLogRepository } from "./server/repositories/parcel.repository";
import { observationRepository, photoRepository } from "./server/repositories/observation.repository";
import { summarizeParcelHealthFromReferenceTrees, ReferenceTreeStatus } from "./server/services/growth-scoring.util";
import { 
  inventoryItemRepository, 
  inventoryCategoryRepository,
  fertilizerRepository,
  chemicalRepository 
} from "./server/repositories/inventory.repository";
import { activityLogRepository, weatherRepository, notificationRepository } from "./server/repositories/activity.repository";
import { 
  harvestRepository, 
  costRepository, 
  saleRepository, 
  profitReportRepository 
} from "./server/repositories/finance.repository";
import { uploadedDocumentRepository, aiRecommendationRepository } from "./server/repositories/ai.repository";
import { weatherService } from "./server/services/weather.service";
import { photoStorageService } from "./server/services/photo-storage.service";
import { backupService } from "./server/services/backup.service";
import { notificationTriggerService } from "./server/services/notification-trigger.service";
import { embeddingStorageService } from "./server/services/embedding-storage.service";
import { PROJECT_ROOT } from "./server/config";
import { 
  UserRole,
  User,
  Parcel,
  Tree,
  Observation,
  Photo,
  InventoryItem,
  Fertilizer,
  Chemical,
  Cost,
  Sale,
  Harvest,
  WeatherRecord
} from "./server/models";
import { logger } from "./server/logger";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const app = express();
const PORT = 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB per file
});

// Enable JSON parsing with large limits to support photo/document payloads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Serves individually stored field-observation photo files. Photo records
// reference files here via a root-relative URL (e.g. "/uploads/photos/<id>.jpg")
// instead of embedding the image data inside the JSON database.
app.use("/uploads/photos", express.static(photoStorageService.getPhotosDirectoryPath()));

// Minimal, unauthenticated connectivity check. Deliberately does no
// database or business-logic work — its only purpose is to let the
// frontend (see useOnlineStatus) verify genuine reachability of this
// server, since the browser's own navigator.onLine only reflects
// whether a network interface is active, not whether it can actually
// reach anything (a known false-positive source on weak/flaky mobile
// connections in the field).
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Types for Authenticated Request
interface AuthenticatedRequest extends Request {
  user?: any;
  permissions?: string[];
}

/**
 * Robust authentication middleware to validate active user sessions
 */
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || req.headers["x-session-token"];
    if (!authHeader) {
      return res.status(401).json({ error: "Giriş yapılması zorunludur. Lütfen sisteme giriş yapın." });
    }

    const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "").trim() : "";
    if (!token) {
      return res.status(401).json({ error: "Oturum anahtarı bulunamadı." });
    }

    const session = await authService.validateSession(token);
    if (!session.isValid || !session.user) {
      return res.status(401).json({ error: "Oturumunuzun süresi dolmuş veya geçersiz. Lütfen tekrar giriş yapın." });
    }

    req.user = session.user;
    req.permissions = session.permissions;
    next();
  } catch (error) {
    logger.error("SYSTEM", "Auth validation middleware failure", error);
    res.status(500).json({ error: "Kimlik doğrulama işlemi sırasında bir sistem hatası oluştu." });
  }
}

/**
 * Async wrapper to capture and delegate controller errors cleanly
 */
const asyncHandler = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((err) => {
      logger.error("SYSTEM", `Unhandled endpoint error at ${req.method} ${req.path}`, err);
      res.status(500).json({ error: err.message || "İşlem gerçekleştirilirken bir sunucu hatası oluştu." });
    });
  };
};

/**
 * Strips sensitive fields (bcrypt password hash) from a User entity before
 * it is serialized and sent to the client. This prevents credential material
 * from ever leaving the server boundary.
 * @param user Full User entity as stored in the database
 * @returns User object safe for client-side exposure
 */
function toSafeUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

// ==========================================
// 1. AUTHENTICATION API ENDPOINTS
// ==========================================

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Kullanıcı adı ve şifre zorunludur." });
  }

  const result = await authService.login(username, password);
  if (!result) {
    return res.status(401).json({ error: "Hatalı kullanıcı adı veya şifre." });
  }

  const permissionsResult = await authService.validateSession(result.token);

  logger.info("AUTH", `User successfully logged in: '${username}'`);
  res.json({
    token: result.token,
    user: toSafeUser(result.user),
    permissions: permissionsResult.permissions
  });
}));

app.post("/api/auth/logout", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization || req.headers["x-session-token"];
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "").trim() : "";
  
  if (token) {
    await authService.logout(token);
  }

  res.json({ success: true, message: "Oturum başarıyla kapatıldı." });
}));

app.get("/api/auth/me", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  res.json({
    user: toSafeUser(req.user),
    permissions: req.permissions
  });
}));

app.post("/api/auth/change-password", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Eski ve yeni şifre alanları zorunludur." });
  }

  const success = await authService.changePassword(req.user.id, oldPassword, newPassword);
  if (!success) {
    return res.status(400).json({ error: "Eski şifreniz hatalı veya yeni şifre kurallara uymuyor." });
  }

  logger.info("AUTH", `Password successfully changed for user ID: '${req.user.id}'`);
  res.json({ success: true, message: "Şifreniz başarıyla güncellendi." });
}));

app.post("/api/auth/register", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: "Yeni kullanıcı kaydetmek için Yönetici yetkiniz bulunmalıdır." });
  }

  const { username, password, fullName, role, email, phoneNumber } = req.body;
  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: "Tüm alanlar (kullanıcı adı, şifre, ad soyad, rol) zorunludur." });
  }

  // Delegates to the Auth Service layer, which performs bcrypt hashing,
  // duplicate username/email checks, and audit logging. Routes must never
  // write directly to the repository for security-sensitive entities.
  const newUser = await authService.registerUser(
    req.user.id,
    username,
    password,
    fullName,
    email || `${username}@agritech.com`,
    role as UserRole,
    phoneNumber
  );

  if (!newUser) {
    return res.status(400).json({ error: "Kullanıcı adı veya e-posta zaten sistemde kayıtlı, ya da kayıt işlemi sırasında bir hata oluştu." });
  }

  res.status(201).json({
    success: true,
    user: toSafeUser(newUser)
  });
}));

// ==========================================
// 2. PARCEL & TREE TRACKING ENDPOINTS
// ==========================================

app.get("/api/parcels", requireAuth, asyncHandler(async (req, res) => {
  const list = await parcelRepository.getAll();
  res.json(list);
}));

const VALID_CROP_TYPES: readonly string[] = ["Zeytin", "Sebze", "Meyve"];

app.post("/api/parcels", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { name, areaDekar, soilType, irrigationType, cropType, treeCount } = req.body;
  if (!name || !areaDekar || !soilType || !irrigationType) {
    return res.status(400).json({ error: "Parsel adı, büyüklük (dekar), toprak yapısı ve sulama yöntemi zorunludur." });
  }

  const resolvedCropType = cropType || "Zeytin";
  if (!VALID_CROP_TYPES.includes(resolvedCropType)) {
    return res.status(400).json({ error: `Geçersiz ürün türü. İzin verilen değerler: ${VALID_CROP_TYPES.join(", ")}.` });
  }

  let resolvedTreeCount = 0;
  if (treeCount !== undefined && treeCount !== null && treeCount !== "") {
    const parsedTreeCount = parseInt(treeCount, 10);
    if (isNaN(parsedTreeCount) || parsedTreeCount < 0) {
      return res.status(400).json({ error: "Ağaç/bitki sayısı sıfır veya pozitif bir tam sayı olmalıdır." });
    }
    resolvedTreeCount = parsedTreeCount;
  }

  const newParcel = await parcelRepository.create({
    name,
    cropType: resolvedCropType as Parcel["cropType"],
    areaDekar: parseFloat(areaDekar),
    treeCount: resolvedTreeCount,
    soilType,
    irrigationType,
    latitude: 36.9123, // Default center coordinate for Toroslar Değirmençay
    longitude: 34.4234,
    notes: "",
    qrCodeData: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "PARCEL_CREATE",
    `Yeni ${resolvedCropType.toLowerCase()} parseli eklendi: '${name}' (${areaDekar} Dekar, ${resolvedTreeCount} Ağaç/Bitki)`
  );

  res.status(201).json(newParcel);
}));

app.put("/api/parcels/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { name, areaDekar, soilType, irrigationType, notes } = req.body;
  const exists = await parcelRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Parsel bulunamadı." });
  }

  const updated = await parcelRepository.update(req.params.id, {
    name: name ?? exists.name,
    areaDekar: areaDekar ? parseFloat(areaDekar) : exists.areaDekar,
    soilType: soilType ?? exists.soilType,
    irrigationType: irrigationType ?? exists.irrigationType,
    notes: notes ?? exists.notes,
    updatedAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "PARCEL_UPDATE",
    `Parsel detayları güncellendi: '${exists.name}'`
  );

  res.json(updated);
}));

app.delete("/api/parcels/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const exists = await parcelRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Silinmek istenen parsel bulunamadı." });
  }

  await parcelRepository.delete(req.params.id);

  // Remove linked trees
  const linkedTrees = await treeRepository.getByParcelId(req.params.id);
  for (const tree of linkedTrees) {
    await treeRepository.delete(tree.id);
  }

  await activityLogRepository.writeLog(
    req.user.id,
    "PARCEL_DELETE",
    `Parsel ve bağlı tüm ağaçlar silindi: '${exists.name}'`
  );

  res.json({ success: true, message: "Parsel başarıyla silindi." });
}));

// Tree-by-tree Tracking
app.get("/api/parcels/:id/trees", requireAuth, asyncHandler(async (req, res) => {
  const trees = await treeRepository.getByParcelId(req.params.id);
  res.json(trees);
}));

app.post("/api/parcels/:id/trees", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { treeNumber, variety, plantingYear, notes } = req.body;
  if (!treeNumber) {
    return res.status(400).json({ error: "Ağaç numarası (örn. T-12) zorunludur." });
  }

  const newTree = await treeRepository.create({
    parcelId: req.params.id,
    treeNumber,
    variety: variety || "Bilinmeyen",
    plantingYear: plantingYear ? parseInt(plantingYear) : new Date().getFullYear(),
    notes: notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await parcelRepository.syncTreeCount(req.params.id);

  await activityLogRepository.writeLog(
    req.user.id,
    "TREE_CREATE",
    `Yeni ağaç kaydı eklendi: '${treeNumber}' (${variety || "Bilinmeyen"})`
  );

  res.status(201).json(newTree);
}));

app.put("/api/trees/:id", requireAuth, asyncHandler(async (req, res) => {
  const { variety, plantingYear, notes, isReferenceTree } = req.body;
  const exists = await treeRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Ağaç kaydı bulunamadı." });
  }

  const updated = await treeRepository.update(req.params.id, {
    variety: variety ?? exists.variety,
    plantingYear: plantingYear ? parseInt(plantingYear) : exists.plantingYear,
    notes: notes ?? exists.notes,
    isReferenceTree: isReferenceTree !== undefined ? !!isReferenceTree : exists.isReferenceTree,
    updatedAt: new Date().toISOString()
  });

  res.json(updated);
}));

app.delete("/api/trees/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const exists = await treeRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Ağaç kaydı bulunamadı." });
  }

  await treeRepository.delete(req.params.id);
  await parcelRepository.syncTreeCount(exists.parcelId);

  await activityLogRepository.writeLog(
    req.user.id,
    "TREE_DELETE",
    `Ağaç kaydı silindi: '${exists.treeNumber}'`
  );

  res.json({ success: true });
}));

// Manual Tree/Plant Count Adjustment History
// Tracks aggregate count changes (e.g. bulk plantings, storm/frost losses,
// manual recount corrections) independently of individually registered
// Tree records. Every entry is immutable once created, forming a permanent
// audit trail; past Harvest and ProfitReport records are never recalculated
// as a result of these adjustments.
const VALID_TREE_COUNT_CHANGE_REASONS: readonly string[] = [
  "Dikim (Yeni Ekim)",
  "Kesim/Budama",
  "Don/Hastalık Kaybı",
  "Sayım Düzeltmesi",
  "Diğer"
];

app.get("/api/parcels/:id/tree-count-changes", requireAuth, asyncHandler(async (req, res) => {
  const parcel = await parcelRepository.getById(req.params.id);
  if (!parcel) {
    return res.status(404).json({ error: "Parsel bulunamadı." });
  }

  const logs = await treeCountChangeLogRepository.getByParcelId(req.params.id);
  res.json(logs);
}));

app.post("/api/parcels/:id/tree-count-changes", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { newCount, reason, notes, changeDate } = req.body;

  const parcel = await parcelRepository.getById(req.params.id);
  if (!parcel) {
    return res.status(404).json({ error: "Parsel bulunamadı." });
  }

  if (newCount === undefined || newCount === null || newCount === "") {
    return res.status(400).json({ error: "Yeni ağaç/bitki sayısı zorunludur." });
  }
  const parsedNewCount = parseInt(newCount, 10);
  if (isNaN(parsedNewCount) || parsedNewCount < 0) {
    return res.status(400).json({ error: "Yeni sayı sıfır veya pozitif bir tam sayı olmalıdır." });
  }
  if (!reason || !VALID_TREE_COUNT_CHANGE_REASONS.includes(reason)) {
    return res.status(400).json({ error: `Geçersiz değişiklik nedeni. İzin verilen değerler: ${VALID_TREE_COUNT_CHANGE_REASONS.join(", ")}.` });
  }
  if (!changeDate) {
    return res.status(400).json({ error: "Değişiklik tarihi zorunludur." });
  }
  if (parsedNewCount === parcel.treeCount) {
    return res.status(400).json({ error: "Yeni sayı, parselin mevcut sayısıyla aynı. Bir değişiklik kaydı oluşturmak için farklı bir değer girin." });
  }

  const previousCount = parcel.treeCount;
  const delta = parsedNewCount - previousCount;
  const plantLabel = parcel.cropType === "Zeytin" ? "ağaç" : "bitki";

  const changeLog = await treeCountChangeLogRepository.create({
    parcelId: req.params.id,
    previousCount,
    newCount: parsedNewCount,
    delta,
    reason,
    notes: notes || "",
    changedBy: req.user.id,
    changeDate,
    createdAt: new Date().toISOString()
  });

  await parcelRepository.update(req.params.id, {
    treeCount: parsedNewCount,
    updatedAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "TREE_COUNT_CHANGE",
    `'${parcel.name}' parselinde ${plantLabel} sayısı ${previousCount} → ${parsedNewCount} olarak güncellendi (${delta > 0 ? "+" : ""}${delta}). Neden: ${reason}`
  );

  res.status(201).json(changeLog);
}));

// Deterministic, AI-free health summary for a parcel, computed from its
// "Referans Ağaç" (reference tree) records' latest structured analyses.
// This never calls Gemini — see summarizeParcelHealthFromReferenceTrees.
app.get("/api/parcels/:id/reference-tree-health", requireAuth, asyncHandler(async (req, res) => {
  const parcel = await parcelRepository.getById(req.params.id);
  if (!parcel) {
    return res.status(404).json({ error: "Parsel bulunamadı." });
  }

  const referenceTrees = await treeRepository.getReferenceTreesByParcelId(req.params.id);

  const treeStatuses: ReferenceTreeStatus[] = await Promise.all(
    referenceTrees.map(async (tree) => {
      const latestPhoto = await photoRepository.getLatestAnalyzedPhotoByTreeId(tree.id);
      return {
        treeId: tree.id,
        treeNumber: tree.treeNumber,
        latestAnalysis: latestPhoto?.aiAnalysis ?? null,
      };
    })
  );

  const summary = summarizeParcelHealthFromReferenceTrees(treeStatuses);
  res.json(summary);
}));

// Farm-wide "Referans Ağaç" photo summary for the Dashboard — how many
// reference trees exist across all parcels, and how many have never been
// photographed. Pure aggregation over existing repository data; no
// Gemini call involved.
app.get("/api/reference-trees/summary", requireAuth, asyncHandler(async (req, res) => {
  const referenceTrees = await treeRepository.getAllReferenceTrees();

  let treesWithoutPhoto = 0;
  let mostRecentPhoto: { photoUrl: string; treeNumber: string; parcelName: string; takenAt: string } | null = null;

  for (const tree of referenceTrees) {
    const latestPhoto = await photoRepository.getLatestPhotoByTreeId(tree.id);
    if (!latestPhoto) {
      treesWithoutPhoto++;
      continue;
    }

    const photoTimestamp = latestPhoto.takenAt || latestPhoto.createdAt;
    if (!mostRecentPhoto || new Date(photoTimestamp).getTime() > new Date(mostRecentPhoto.takenAt).getTime()) {
      const parcel = await parcelRepository.getById(tree.parcelId);
      mostRecentPhoto = {
        photoUrl: latestPhoto.originalUrl,
        treeNumber: tree.treeNumber,
        parcelName: parcel?.name || "Bilinmeyen Parsel",
        takenAt: photoTimestamp,
      };
    }
  }

  res.json({
    totalReferenceTrees: referenceTrees.length,
    treesWithoutPhoto,
    mostRecentPhoto,
  });
}));

// ==========================================
// 3. FIELD OBSERVATIONS & EXIF GPS SIMULATION
// ==========================================

const VALID_OBSERVATION_ACTIVITY_TYPES: readonly string[] = [
  "Genel Gözlem",
  "İlaçlama",
  "Sulama",
  "Budama",
  "Gübreleme",
  "Biçme"
];

/**
 * Validates that a given date value (either a plain "YYYY-MM-DD" string or
 * a full ISO 8601 timestamp) represents a real calendar date that is not
 * later than today. Used to allow retroactive (backdated) observation and
 * photo entries — e.g. logging an activity using a photo taken earlier —
 * while preventing logically meaningless future-dated records.
 * @param dateInput Raw value received from the request body
 * @returns true if the value is a valid, non-future date string
 */
function isValidNonFutureDate(dateInput: unknown): boolean {
  if (typeof dateInput !== "string" || !dateInput.trim()) return false;
  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) return false;

  const todayDateOnly = new Date().toISOString().split("T")[0];
  const inputDateOnly = dateInput.length >= 10 ? dateInput.substring(0, 10) : dateInput;
  return inputDateOnly <= todayDateOnly;
}

app.get("/api/observations", requireAuth, asyncHandler(async (req, res) => {
  const { activityType } = req.query;

  let list = await observationRepository.getAll();
  if (activityType && typeof activityType === "string") {
    if (!VALID_OBSERVATION_ACTIVITY_TYPES.includes(activityType)) {
      return res.status(400).json({ error: `Geçersiz faaliyet türü. İzin verilen değerler: ${VALID_OBSERVATION_ACTIVITY_TYPES.join(", ")}.` });
    }
    list = list.filter((obs) => obs.activityType === activityType);
  }

  list.sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime());
  res.json(list);
}));

app.post("/api/observations", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { parcelId, treeId, activityType, notes, audioNotePath, observationDate } = req.body;
  if (!parcelId || !notes) {
    return res.status(400).json({ error: "Parsel seçimi ve gözlem notları zorunludur." });
  }

  const resolvedActivityType = activityType || "Genel Gözlem";
  if (!VALID_OBSERVATION_ACTIVITY_TYPES.includes(resolvedActivityType)) {
    return res.status(400).json({ error: `Geçersiz faaliyet türü. İzin verilen değerler: ${VALID_OBSERVATION_ACTIVITY_TYPES.join(", ")}.` });
  }

  // Defaults to the current timestamp, but accepts a user-supplied
  // (possibly backdated) date so field activities can be logged
  // retroactively using photos or notes from an earlier day.
  let resolvedObservationDate = new Date().toISOString();
  if (observationDate !== undefined && observationDate !== null && observationDate !== "") {
    if (!isValidNonFutureDate(observationDate)) {
      return res.status(400).json({ error: "Gözlem tarihi geçersiz veya gelecekte bir tarih olamaz." });
    }
    resolvedObservationDate = observationDate;
  }

  const newObs = await observationRepository.create({
    parcelId,
    treeId: treeId || undefined,
    observerId: req.user.id,
    observationDate: resolvedObservationDate,
    activityType: resolvedActivityType,
    notes,
    audioNotePath: audioNotePath || undefined,
    createdAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "OBSERVATION_CREATE",
    `Yeni saha gözlemi kaydedildi (${resolvedActivityType}). ${treeId ? "Ağaç ID: " + treeId : "Genel parsel gözlemi."}`
  );

  res.status(201).json(newObs);
}));

/**
 * Image Upload & GPS EXIF Coordinate Simulation
 * Simulated for Mersin Toroslar/Değirmençay (Latitude: 36.912, Longitude: 34.423)
 * The uploaded photo is persisted as an individual file on disk (via
 * photoStorageService) rather than embedded as base64 text inside the
 * main JSON database, keeping database reads/writes fast regardless of
 * how many photos have been collected.
 */
app.post("/api/observations/upload-photo", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { observationId, base64Data, label, takenAt } = req.body;
  if (!observationId || !base64Data) {
    return res.status(400).json({ error: "Gözlem referansı ve görsel verisi zorunludur." });
  }

  // Simulated GPS metadata within Mersin region bounding box
  const simulatedLatitude = 36.91234 + (Math.random() - 0.5) * 0.0085;
  const simulatedLongitude = 34.42345 + (Math.random() - 0.5) * 0.0085;

  // Defaults to the current timestamp, but accepts a user-supplied
  // (possibly backdated) date to match a retroactively logged observation
  // when the photo was actually taken (e.g. selected from the gallery)
  // on an earlier day.
  let resolvedTakenAt = new Date().toISOString();
  if (takenAt !== undefined && takenAt !== null && takenAt !== "") {
    if (!isValidNonFutureDate(takenAt)) {
      return res.status(400).json({ error: "Fotoğraf tarihi geçersiz veya gelecekte bir tarih olamaz." });
    }
    resolvedTakenAt = takenAt;
  }

  let savedFile;
  try {
    savedFile = photoStorageService.saveNewPhoto(base64Data);
  } catch (error: any) {
    logger.error("SYSTEM", "Fotoğraf dosyaya kaydedilemedi.", error);
    return res.status(400).json({ error: error.message || "Fotoğraf işlenirken bir hata oluştu." });
  }

  const newPhoto = await photoRepository.create({
    id: savedFile.photoId,
    observationId,
    originalUrl: savedFile.relativeUrl,
    thumbnailUrl: savedFile.relativeUrl,
    latitude: parseFloat(simulatedLatitude.toFixed(6)),
    longitude: parseFloat(simulatedLongitude.toFixed(6)),
    takenAt: resolvedTakenAt,
    fileSize: savedFile.fileSizeBytes,
    contentHash: savedFile.contentHash,
    createdAt: new Date().toISOString()
  });

  // If this photo belongs to a "Referans Ağaç" (reference tree), analyze
  // it immediately rather than waiting for a later Fotoğraflı Gelişim
  // Analizi request — reference trees exist specifically for close,
  // up-to-date monitoring, so their health summary should reflect a new
  // photo right away. Photos on non-reference trees or general parcel
  // observations are unaffected and remain analyzed lazily, preserving
  // this application's existing "don't spend AI quota until needed"
  // behavior (see PERFORMANS: gereksiz API çağrısı yapma).
  try {
    const observation = await observationRepository.getById(observationId);
    if (observation?.treeId) {
      const tree = await treeRepository.getById(observation.treeId);
      if (tree?.isReferenceTree) {
        const parcel = await parcelRepository.getById(tree.parcelId);
        if (parcel) {
          newPhoto.aiAnalysis = await aiService.analyzePhotoOnce(newPhoto, parcel.cropType);
        }
      }
    }
  } catch (error) {
    // analyzePhotoOnce already fails safe internally and never throws,
    // but this route must never fail the upload itself even if that
    // contract is violated by a future change — the photo is already
    // saved successfully at this point regardless.
    logger.error("AI", "Referans ağaç fotoğrafı için anlık analiz denemesi başarısız oldu.", error);
  }

  logger.info("AI", `Image metadata extracted successfully. Simulated GPS registered: [${simulatedLatitude}, ${simulatedLongitude}]`);
  res.status(201).json(newPhoto);
}));

app.get("/api/observations/photos", requireAuth, asyncHandler(async (req, res) => {
  const list = await photoRepository.getAll();
  res.json(list);
}));

// ==========================================
// 4. INVENTORY & STOCK ALERT ENDPOINTS
// ==========================================

app.get("/api/inventory", requireAuth, asyncHandler(async (req, res) => {
  const list = await inventoryItemRepository.getAll();
  res.json(list);
}));

app.get("/api/inventory/categories", requireAuth, asyncHandler(async (req, res) => {
  const categories = await inventoryCategoryRepository.getAll();
  res.json(categories);
}));

app.post("/api/inventory", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { name, categoryId, stockQuantity, unit, minStockAlert, brand, sku, unitPrice, type, specificDetails } = req.body;
  if (!name || !categoryId || stockQuantity === undefined || !unit || minStockAlert === undefined) {
    return res.status(400).json({ error: "Ürün adı, kategori, stok miktarı, birim ve minimum stok uyarısı zorunludur." });
  }

  const newItem = await inventoryItemRepository.create({
    name,
    categoryId,
    brand: brand || "",
    sku: sku || "",
    stockQuantity: parseFloat(stockQuantity),
    unit,
    minStockAlert: parseFloat(minStockAlert),
    unitPrice: unitPrice ? parseFloat(unitPrice) : 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Handle fertilizer or chemical specific records
  if (type === "Fertilizer" && specificDetails) {
    await fertilizerRepository.create({
      inventoryItemId: newItem.id,
      npkRatio: specificDetails.npkRatio || "15-15-15",
      organicContentPercent: parseFloat(specificDetails.organicContentPercent || 0),
      microElements: specificDetails.microElements || ""
    });
  } else if (type === "Chemical" && specificDetails) {
    await chemicalRepository.create({
      inventoryItemId: newItem.id,
      activeIngredient: specificDetails.activeIngredient || "",
      targetPests: specificDetails.targetPests || [],
      preHarvestIntervalDays: parseInt(specificDetails.preHarvestIntervalDays || 0)
    });
  }

  await activityLogRepository.writeLog(
    req.user.id,
    "INVENTORY_CREATE",
    `Envantere yeni ürün eklendi: '${name}' (${stockQuantity} ${unit})`
  );

  res.status(201).json(newItem);
}));

app.post("/api/inventory/adjust", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id, delta, notes } = req.body;
  if (!id || delta === undefined) {
    return res.status(400).json({ error: "Ürün kimliği ve değişim miktarı zorunludur." });
  }

  const item = await inventoryItemRepository.getById(id);
  if (!item) {
    return res.status(404).json({ error: "Ürün bulunamadı." });
  }

  const success = await inventoryItemRepository.adjustStock(id, parseFloat(delta));
  if (!success) {
    return res.status(400).json({ error: "Stok seviyesi sıfırın altına düşemez. Değişim iptal edildi." });
  }

  const updatedItem = await inventoryItemRepository.getById(id);

  if (parseFloat(delta) < 0 && notes) {
    await activityLogRepository.writeLog(
      req.user.id,
      "INVENTORY_ADJUST",
      `Stok kullanıldı/azaltıldı: '${item.name}' (Değişim: ${delta} ${item.unit}). Not: ${notes}`
    );
  }

  res.json({ success: true, item: updatedItem });
}));

// ==========================================
// 5. AGRICULTURAL FINANCIALS & REVENUES
// ==========================================

// Costs API
app.get("/api/finance/costs", requireAuth, asyncHandler(async (req, res) => {
  const list = await costRepository.getAll();
  list.sort((a, b) => new Date(b.costDate).getTime() - new Date(a.costDate).getTime());
  res.json(list);
}));

app.post("/api/finance/costs", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { parcelId, amount, category, costDate, description } = req.body;
  if (!amount || !category || !costDate) {
    return res.status(400).json({ error: "Tutar, gider kategorisi ve gider tarihi zorunludur." });
  }

  const newCost = await costRepository.create({
    parcelId: parcelId || undefined,
    amount: parseFloat(amount),
    category,
    costDate,
    description: description || "",
    createdAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "COST_CREATE",
    `Yeni harcama kaydı girildi: ${amount} TL (${category})`
  );

  res.status(201).json(newCost);
}));

// Removes a single expense/cost record. Used when a wrong amount or
// incorrect information was entered by mistake.
app.delete("/api/finance/costs/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const exists = await costRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Silinmek istenen gider kaydı bulunamadı." });
  }

  await costRepository.delete(req.params.id);

  await activityLogRepository.writeLog(
    req.user.id,
    "COST_DELETE",
    `Gider kaydı silindi: ${exists.amount} TL (${exists.category})`
  );

  res.json({ success: true, message: "Gider kaydı başarıyla silindi." });
}));

// Sales API
app.get("/api/finance/sales", requireAuth, asyncHandler(async (req, res) => {
  const list = await saleRepository.getAll();
  list.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  res.json(list);
}));

app.post("/api/finance/sales", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { buyerName, productType, quantityKg, unitPrice, isOrganikSaglikBrand, saleDate } = req.body;
  if (!productType || !quantityKg || !unitPrice || !saleDate) {
    return res.status(400).json({ error: "Ürün türü, miktar (kg), birim fiyat ve satış tarihi zorunludur." });
  }

  const totalRevenue = parseFloat(quantityKg) * parseFloat(unitPrice);

  const newSale = await saleRepository.create({
    buyerName: buyerName || "Bilinmeyen Alıcı",
    productType,
    quantityKg: parseFloat(quantityKg),
    unitPrice: parseFloat(unitPrice),
    totalRevenue,
    isOrganikSaglikBrand: !!isOrganikSaglikBrand,
    saleDate,
    createdAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "SALE_CREATE",
    `Yeni zeytin/yağ satışı kaydedildi: ${totalRevenue} TL (${quantityKg} Kg, Marka: ${isOrganikSaglikBrand ? "Organik Sağlık" : "Standart"})`
  );

  res.status(201).json(newSale);
}));

// Removes a single sale/revenue record. Used when a wrong amount or
// incorrect information was entered by mistake.
app.delete("/api/finance/sales/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const exists = await saleRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Silinmek istenen satış kaydı bulunamadı." });
  }

  await saleRepository.delete(req.params.id);

  await activityLogRepository.writeLog(
    req.user.id,
    "SALE_DELETE",
    `Satış kaydı silindi: ${exists.totalRevenue} TL (${exists.productType})`
  );

  res.json({ success: true, message: "Satış kaydı başarıyla silindi." });
}));

// Harvest Logs API
app.get("/api/finance/harvests", requireAuth, asyncHandler(async (req, res) => {
  const list = await harvestRepository.getAll();
  list.sort((a, b) => new Date(b.harvestDate).getTime() - new Date(a.harvestDate).getTime());
  res.json(list);
}));

app.post("/api/finance/harvests", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { parcelId, quantityKg, qualityGrade, notes, harvestDate, personnelCount, laborCost, transportCost, otherCosts } = req.body;
  if (!parcelId || !quantityKg || !qualityGrade || !harvestDate) {
    return res.status(400).json({ error: "Parsel seçimi, miktar (kg), kalite sınıfı ve hasat tarihi zorunludur." });
  }

  const personnelCountNum = parseInt(personnelCount || 0);
  const laborCostNum = parseFloat(laborCost || 0);
  const transportCostNum = parseFloat(transportCost || 0);
  const otherCostsNum = parseFloat(otherCosts || 0);
  const totalCostNum = laborCostNum + transportCostNum + otherCostsNum;

  const newHarvest = await harvestRepository.create({
    parcelId,
    quantityKg: parseFloat(quantityKg),
    qualityGrade,
    harvestDate,
    notes: notes || "",
    personnelCount: personnelCountNum,
    laborCost: laborCostNum,
    transportCost: transportCostNum,
    otherCosts: otherCostsNum,
    totalCost: totalCostNum,
    createdAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "HARVEST_CREATE",
    `Yeni hasat kaydı girildi: ${quantityKg} Kg`
  );

  res.status(201).json(newHarvest);
}));

// Removes a single harvest record. Used when a wrong amount or incorrect
// information was entered by mistake.
app.delete("/api/finance/harvests/:id", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const exists = await harvestRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Silinmek istenen hasat kaydı bulunamadı." });
  }

  await harvestRepository.delete(req.params.id);

  await activityLogRepository.writeLog(
    req.user.id,
    "HARVEST_DELETE",
    `Hasat kaydı silindi: ${exists.quantityKg} Kg (${exists.qualityGrade})`
  );

  res.json({ success: true, message: "Hasat kaydı başarıyla silindi." });
}));

// Annual ROI and Profitability Analysis Reports
app.get("/api/finance/profit-reports", requireAuth, asyncHandler(async (req, res) => {
  const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
  const list = await profitReportRepository.getAll();
  const yearReports = list.filter((r) => r.year === year);
  res.json(yearReports);
}));

// ==========================================
// 6. SYSTEM SETTINGS & GENERAL UTILITIES
// ==========================================

app.get("/api/settings", requireAuth, asyncHandler(async (req, res) => {
  const dict = await settingService.getSettingsDict();
  res.json(dict);
}));

app.post("/api/settings", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: "Ayar anahtarı ve değeri zorunludur." });
  }

  const updatedValue = await settingService.setSetting(key, String(value));
  res.json({ success: updatedValue, key, value });
}));

// Weather Records API
app.get("/api/weather", requireAuth, asyncHandler(async (req, res) => {
  const history = await weatherRepository.getAll();
  history.sort((a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime());
  res.json(history);
}));

app.post("/api/weather/record", requireAuth, asyncHandler(async (req, res) => {
  const { recordDate, tempMax, tempMin, humidity, windSpeed, hasFrostRisk, precipitationMm, condition } = req.body;
  if (!recordDate || tempMax === undefined || tempMin === undefined) {
    return res.status(400).json({ error: "Tarih, en yüksek ve en düşük sıcaklıklar zorunludur." });
  }

  const newRecord = await weatherRepository.create({
    recordDate,
    tempMax: parseFloat(tempMax),
    tempMin: parseFloat(tempMin),
    humidity: humidity ? parseFloat(humidity) : 55,
    windSpeed: windSpeed ? parseFloat(windSpeed) : 12,
    precipitationMm: precipitationMm ? parseFloat(precipitationMm) : 0,
    condition: condition || "Açık",
    hasFrostRisk: !!hasFrostRisk,
    createdAt: new Date().toISOString()
  });

  res.status(201).json(newRecord);
}));

// Live, real-time weather forecast sourced from the Open-Meteo external API.
// Never returns fabricated data: if the external API is unreachable, this
// endpoint responds with 503 and a clear error rather than synthetic values.
// Pass ?refresh=true to bypass the service's short-lived in-memory cache.
app.get("/api/weather/live-forecast", requireAuth, asyncHandler(async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  try {
    const forecast = await weatherService.getLiveForecast(forceRefresh);
    res.json(forecast);
  } catch (error: any) {
    logger.error("WEATHER", "Canlı hava durumu API isteği başarısız oldu.", error);
    res.status(503).json({
      error: "Canlı hava durumu verisi şu anda alınamıyor. Lütfen internet bağlantınızı kontrol edip birkaç dakika sonra tekrar deneyin."
    });
  }
}));

// System activity log tracking logs
app.get("/api/activities", requireAuth, asyncHandler(async (req, res) => {
  const list = await activityLogRepository.getAll();
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(list.slice(0, 50)); // Return 50 most recent logs
}));

// Real-time farm alerts (critical stock, frost risk), generated by
// NotificationTriggerService's scheduled background checks.
app.get("/api/notifications", requireAuth, asyncHandler(async (req, res) => {
  const list = await notificationRepository.getUnreadNotifications();
  res.json(list);
}));

app.post("/api/notifications/mark-read", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  await notificationRepository.markAllAsRead();
  await activityLogRepository.writeLog(req.user.id, "NOTIFICATIONS_READ", "Tüm bildirimler okundu olarak işaretlendi.");
  res.status(204).send();
}));

// ==========================================
// 7. STAGE 4: AI & KNOWLEDGE BASE (RAG) ENDPOINTS
// ==========================================

// List Guide Documents
app.get("/api/ai/documents", requireAuth, asyncHandler(async (req, res) => {
  const docs = await uploadedDocumentRepository.getAll();
  res.json(docs);
}));

// Parse a PDF or DOCX file and extract its text content
app.post("/api/ai/documents/parse", requireAuth, upload.single("file"), asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Lütfen bir dosya yükleyin." });
  }

  const file = req.file;
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  let text = "";

  try {
    if (extension === "pdf") {
      const parser = new PDFParse({ data: file.buffer });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        await parser.destroy();
      }
    } else if (extension === "docx") {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (extension === "doc") {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value;
    } else if (extension === "txt" || extension === "md") {
      text = file.buffer.toString("utf8");
    } else {
      return res.status(400).json({ error: "Desteklenmeyen dosya formatı. Sadece .pdf, .docx, .txt ve .md desteklenmektedir." });
    }

    // Clean up carriage returns, excessive vertical spacing, and trim
    text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    if (!text) {
      return res.status(400).json({ error: "Dosyadan okunabilir metin içeriği çıkarılamadı. Dosyanın boş olmadığından veya taranmış bir resim (OCR gerektiren) olmadığından emin olun." });
    }

    res.json({
      text,
      fileName: file.originalname.replace(/\.[^/.]+$/, ""),
      originalName: file.originalname
    });
  } catch (error: any) {
    console.error("Dosya ayrıştırma hatası:", error);
    res.status(500).json({ error: `Dosya içeriği okunurken bir hata oluştu: ${error.message || error}` });
  }
}));

// Index a new text document into the vector RAG engine
app.post("/api/ai/documents/upload", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { fileName, fileType, textContent } = req.body;
  if (!fileName || !textContent) {
    return res.status(400).json({ error: "Doküman adı ve doküman içeriği (metin) zorunludur." });
  }

  const textBytes = Buffer.byteLength(textContent, "utf8");
  
  const doc = await aiService.processDocument(
    req.user.fullName,
    fileName,
    fileType || "text/plain",
    textBytes,
    textContent
  );

  if (!doc) {
    return res.status(500).json({ error: "Doküman işlenirken ve vektör dizini oluşturulurken bir hata oluştu." });
  }

  res.status(201).json(doc);
}));

// Remove a document and clear its vector spaces
app.delete("/api/ai/documents/:id", requireAuth, asyncHandler(async (req, res) => {
  const success = await aiService.removeDocument(req.params.id);
  if (!success) {
    return res.status(404).json({ error: "Doküman kaydı bulunamadı." });
  }
  res.json({ success: true, message: "Doküman ve bağlı tüm vektör indeksleri başarıyla silindi." });
}));

// Generate Contextual AI expert advice for a single parcel
// Generate Contextual AI expert advice for a single parcel. Accepts an
// optional userQuery field and up to 3 diagnosis photos (field name
// "photos") via multipart/form-data. When photos are attached, the
// recommendation is grounded in a multimodal (text + vision) analysis
// that prioritizes the RAG document pool before falling back to the
// model's general knowledge — see AIService.generateParcelRecommendation.
app.post("/api/ai/recommend/:parcelId", requireAuth, upload.array("photos", 3), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { userQuery } = req.body;
  const uploadedFiles = (req.files as Express.Multer.File[]) || [];

  if (userQuery !== undefined && typeof userQuery === "string" && userQuery.length > MAX_USER_QUERY_LENGTH) {
    return res.status(400).json({ error: `Soru metni en fazla ${MAX_USER_QUERY_LENGTH} karakter olabilir.` });
  }

  for (const file of uploadedFiles) {
    if (!file.mimetype.startsWith("image/")) {
      return res.status(400).json({ error: "Sadece görsel dosyaları (JPEG, PNG, WEBP vb.) teşhis fotoğrafı olarak yüklenebilir." });
    }
  }

  const photoFiles = uploadedFiles.map((file) => ({ buffer: file.buffer, mimeType: file.mimetype }));

  const result = await aiService.generateParcelRecommendation(
    req.params.parcelId,
    userQuery,
    photoFiles.length > 0 ? photoFiles : undefined,
    req.user.id
  );
  if (!result) {
    return res.status(500).json({ error: "Yapay zeka tavsiye raporu oluşturulamadı. Lütfen API anahtarınızı veya internet bağlantınızı kontrol edin." });
  }
  res.status(201).json(result);
}));

// Get historical recommendation for a single parcel
app.get("/api/ai/recommendations/:parcelId", requireAuth, asyncHandler(async (req, res) => {
  const list = await aiRecommendationRepository.getAll();
  const parcelHistory = list.filter((r) => r.parcelId === req.params.parcelId);
  parcelHistory.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
  res.json(parcelHistory);
}));

// Reports today's estimated Gemini API usage against known daily quota
// limits (see AiUsageTrackerService). This is a self-reported estimate,
// not a live, guaranteed-accurate figure from Google — the frontend
// must present it accordingly.
app.get("/api/ai/usage", requireAuth, asyncHandler(async (req, res) => {
  res.json(aiUsageTrackerService.getUsageSnapshot());
}));

// Ask general question to the RAG chat-bot assistant
app.post("/api/ai/chat", requireAuth, asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Soru alanı boş bırakılamaz." });
  }
  if (typeof query === "string" && query.length > MAX_USER_QUERY_LENGTH) {
    return res.status(400).json({ error: `Soru metni en fazla ${MAX_USER_QUERY_LENGTH} karakter olabilir.` });
  }

  const result = await aiService.queryChatAssistant(query);
  res.json({
    response: result.text,
    text: result.text,
    usedChunks: result.usedChunks
  });
}));


// Get photos for a parcel within a date range (live preview before running AI analysis)
app.get("/api/parcels/:parcelId/photos-in-range", requireAuth, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Başlangıç ve bitiş tarihi (startDate, endDate) zorunludur." });
  }

  const parcel = await parcelRepository.getById(req.params.parcelId);
  if (!parcel) {
    return res.status(404).json({ error: "Parsel bulunamadı." });
  }

  const rangeStart = new Date(startDate as string);
  const rangeEnd = new Date(endDate as string);
  if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
    return res.status(400).json({ error: "Geçersiz tarih formatı." });
  }
  rangeEnd.setHours(23, 59, 59, 999);

  const allPhotos = await photoRepository.getPhotosByParcelId(req.params.parcelId);
  const photosInRange = allPhotos
    .filter((p) => {
      const photoDate = new Date(p.takenAt || p.createdAt);
      return photoDate.getTime() >= rangeStart.getTime() && photoDate.getTime() <= rangeEnd.getTime();
    })
    .sort((a, b) => new Date(a.takenAt || a.createdAt).getTime() - new Date(b.takenAt || b.createdAt).getTime());

  res.json(photosInRange);
}));

// Generate an AI-powered visual growth/development analysis from parcel photos over a date range
app.post("/api/ai/growth-analysis/:parcelId", requireAuth, asyncHandler(async (req, res) => {
  const { startDate, endDate, userQuery } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: "Başlangıç ve bitiş tarihi zorunludur." });
  }

  const result = await aiService.generateGrowthAnalysis(req.params.parcelId, startDate, endDate, userQuery);
  if (!result) {
    return res.status(500).json({ error: "Gelişim analizi oluşturulamadı." });
  }

  res.status(201).json(result);
}));

// ==========================================
// Dedicated error handler for Multer (file upload) failures — e.g. more
// than the allowed number of files, or a file exceeding the configured
// size limit. Placed after all routes so it only intercepts errors that
// bubble up from the upload middleware; all other errors continue to be
// handled by each route's own asyncHandler wrapper.
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    logger.error("SYSTEM", `Dosya yükleme hatası: ${err.code}`, err);
    if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ error: "İzin verilenden fazla dosya yüklemeye çalıştınız." });
    }
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Yüklenen dosyalardan biri izin verilen boyut sınırını (8 MB) aşıyor." });
    }
    return res.status(400).json({ error: "Dosya yükleme sırasında bir hata oluştu." });
  }
  next(err);
});

// ==========================================
// 8. VITE AND DEVELOPMENT CLIENT BINDING
// ==========================================

async function startServer() {
  // One-time startup migration: moves any photos still embedded inline as
  // base64 inside the JSON database (from before file-based photo storage
  // existed) onto disk as individual files. Safe to run on every startup —
  // it is a no-op once all legacy records have been migrated.
  try {
    const migratedCount = await photoStorageService.migrateAllLegacyPhotos();
    if (migratedCount > 0) {
      logger.info("SYSTEM", `${migratedCount} eski fotoğraf kaydı dosya sistemine taşındı.`);
    }
  } catch (error) {
    logger.error("SYSTEM", "Eski fotoğrafları dosya sistemine taşıma işlemi sırasında bir hata oluştu.", error);
  }

  try {
    const migratedEmbeddings = await embeddingStorageService.migrateAllLegacyEmbeddings();
    if (migratedEmbeddings > 0) {
      logger.info("SYSTEM", `${migratedEmbeddings} eski embedding kaydı dosya sistemine taşındı.`);
    }
  } catch (error) {
    logger.error("SYSTEM", "Eski embedding'leri dosya sistemine taşıma işlemi sırasında bir hata oluştu.", error);
  }

  // Starts the recurring automated backup schedule (immediate first backup,
  // then repeating per BACKUP_INTERVAL_HOURS), with optional Google Drive
  // Desktop folder mirroring if GOOGLE_DRIVE_BACKUP_PATH is configured.
  backupService.startAutomaticBackupSchedule();
  notificationTriggerService.startMonitoring();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(PROJECT_ROOT, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server started and successfully listening on http://localhost:${PORT}`);
    logger.info("SYSTEM", `Server initiated. High-performance Express listener bounded to port ${PORT}`);
  });
}

startServer();
