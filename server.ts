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
import { userRepository } from "./server/repositories/user.repository";
import { parcelRepository, treeRepository } from "./server/repositories/parcel.repository";
import { observationRepository, photoRepository } from "./server/repositories/observation.repository";
import { 
  inventoryItemRepository, 
  inventoryCategoryRepository,
  fertilizerRepository,
  chemicalRepository 
} from "./server/repositories/inventory.repository";
import { activityLogRepository, weatherRepository } from "./server/repositories/activity.repository";
import { 
  harvestRepository, 
  costRepository, 
  saleRepository, 
  profitReportRepository 
} from "./server/repositories/finance.repository";
import { uploadedDocumentRepository, aiRecommendationRepository } from "./server/repositories/ai.repository";
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
// @ts-ignore
import pdfParse from "pdf-parse";
import mammoth from "mammoth";

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

// Enable JSON parsing with large limits to support photo/document payloads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

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
    user: result.user,
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
    user: req.user,
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

  const { username, password, fullName, role, email } = req.body;
  if (!username || !password || !fullName || !role) {
    return res.status(400).json({ error: "Tüm alanlar (kullanıcı adı, şifre, ad soyad, rol) zorunludur." });
  }

  const existing = await userRepository.getByUsername(username);
  if (existing) {
    return res.status(400).json({ error: "Bu kullanıcı adı zaten sistemde kayıtlıdır." });
  }

  const newUser = await userRepository.create({
    username,
    passwordHash: password, // For simplicity we store/process through userRepository directly or custom helper
    fullName,
    role: role as UserRole,
    email: email || `${username}@agritech.com`,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "USER_REGISTER",
    `Yeni kullanıcı kaydedildi: '${username}' (${role})`
  );

  res.status(211).json({ 
    success: true, 
    user: { id: newUser.id, username: newUser.username, fullName: newUser.fullName, role: newUser.role } 
  });
}));

// ==========================================
// 2. PARCEL & TREE TRACKING ENDPOINTS
// ==========================================

app.get("/api/parcels", requireAuth, asyncHandler(async (req, res) => {
  const list = await parcelRepository.getAll();
  res.json(list);
}));

app.post("/api/parcels", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { name, areaDekar, soilType, irrigationType } = req.body;
  if (!name || !areaDekar || !soilType || !irrigationType) {
    return res.status(400).json({ error: "Parsel adı, büyüklük (dekar), toprak yapısı ve sulama yöntemi zorunludur." });
  }

  const newParcel = await parcelRepository.create({
    name,
    areaDekar: parseFloat(areaDekar),
    treeCount: 0,
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
    `Yeni arazi parseli eklendi: '${name}' (${areaDekar} Dekar)`
  );

  res.status(211).json(newParcel);
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

  const parcelId = req.params.id;
  const parcel = await parcelRepository.getById(parcelId);
  if (!parcel) {
    return res.status(404).json({ error: "Ağacın ekleneceği parsel bulunamadı." });
  }

  const duplicate = await treeRepository.getByTreeNumber(parcelId, treeNumber);
  if (duplicate) {
    return res.status(400).json({ error: `Bu parselde '${treeNumber}' numaralı ağaç zaten kayıtlıdır.` });
  }

  const newTree = await treeRepository.create({
    parcelId,
    treeNumber,
    variety: variety || "Ayvalık",
    plantingYear: plantingYear ? parseInt(plantingYear) : 2015,
    notes: notes || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  await parcelRepository.syncTreeCount(parcelId);

  await activityLogRepository.writeLog(
    req.user.id,
    "TREE_CREATE",
    `Parsele (${parcel.name}) yeni ağaç kaydedildi: '${treeNumber}'`
  );

  res.status(211).json(newTree);
}));

app.put("/api/trees/:id", requireAuth, asyncHandler(async (req, res) => {
  const { variety, plantingYear, notes } = req.body;
  const exists = await treeRepository.getById(req.params.id);
  if (!exists) {
    return res.status(404).json({ error: "Ağaç kaydı bulunamadı." });
  }

  const updated = await treeRepository.update(req.params.id, {
    variety: variety ?? exists.variety,
    plantingYear: plantingYear ? parseInt(plantingYear) : exists.plantingYear,
    notes: notes ?? exists.notes,
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

// ==========================================
// 3. FIELD OBSERVATIONS & EXIF GPS SIMULATION
// ==========================================

app.get("/api/observations", requireAuth, asyncHandler(async (req, res) => {
  const list = await observationRepository.getAll();
  list.sort((a, b) => new Date(b.observationDate).getTime() - new Date(a.observationDate).getTime());
  res.json(list);
}));

app.post("/api/observations", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { parcelId, treeId, notes, audioNotePath } = req.body;
  if (!parcelId || !notes) {
    return res.status(400).json({ error: "Parsel seçimi ve gözlem notları zorunludur." });
  }

  const newObs = await observationRepository.create({
    parcelId,
    treeId: treeId || undefined,
    observerId: req.user.id,
    observationDate: new Date().toISOString(),
    notes,
    audioNotePath: audioNotePath || undefined,
    createdAt: new Date().toISOString()
  });

  await activityLogRepository.writeLog(
    req.user.id,
    "OBSERVATION_CREATE",
    `Yeni saha gözlemi kaydedildi. ${treeId ? "Ağaç ID: " + treeId : "Genel parsel gözlemi."}`
  );

  res.status(211).json(newObs);
}));

/**
 * Image Upload & GPS EXIF Coordinate Simulation
 * Simulated for Mersin Toroslar/Değirmençay (Latitude: 36.912, Longitude: 34.423)
 */
app.post("/api/observations/upload-photo", requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { observationId, base64Data, label } = req.body;
  if (!observationId || !base64Data) {
    return res.status(400).json({ error: "Gözlem referansı ve görsel verisi zorunludur." });
  }

  // Simulated GPS metadata within Mersin region bounding box
  const simulatedLatitude = 36.91234 + (Math.random() - 0.5) * 0.0085;
  const simulatedLongitude = 34.42345 + (Math.random() - 0.5) * 0.0085;

  const newPhoto = await photoRepository.create({
    observationId,
    originalUrl: base64Data, // Stored as base64 asset directly in mock database
    thumbnailUrl: base64Data,
    latitude: parseFloat(simulatedLatitude.toFixed(6)),
    longitude: parseFloat(simulatedLongitude.toFixed(6)),
    takenAt: new Date().toISOString(),
    fileSize: Buffer.byteLength(base64Data, "utf8"),
    createdAt: new Date().toISOString()
  });

  logger.info("AI", `Image metadata extracted successfully. Simulated GPS registered: [${simulatedLatitude}, ${simulatedLongitude}]`);
  res.status(211).json(newPhoto);
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

  res.status(211).json(newItem);
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

  res.status(211).json(newCost);
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

  res.status(211).json(newSale);
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

  res.status(211).json(newHarvest);
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

  res.status(211).json(newRecord);
}));

// System activity log tracking logs
app.get("/api/activities", requireAuth, asyncHandler(async (req, res) => {
  const list = await activityLogRepository.getAll();
  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(list.slice(0, 50)); // Return 50 most recent logs
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
      const data = await pdfParse(file.buffer);
      text = data.text;
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

  res.status(211).json(doc);
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
app.post("/api/ai/recommend/:parcelId", requireAuth, asyncHandler(async (req, res) => {
  const { userQuery } = req.body;
  const result = await aiService.generateParcelRecommendation(req.params.parcelId, userQuery);
  if (!result) {
    return res.status(500).json({ error: "Yapay zeka tavsiye raporu oluşturulamadı. Lütfen API anahtarınızı veya internet bağlantınızı kontrol edin." });
  }
  res.status(211).json(result);
}));

// Get historical recommendation for a single parcel
app.get("/api/ai/recommendations/:parcelId", requireAuth, asyncHandler(async (req, res) => {
  const list = await aiRecommendationRepository.getAll();
  const parcelHistory = list.filter((r) => r.parcelId === req.params.parcelId);
  parcelHistory.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
  res.json(parcelHistory);
}));

// Ask general question to the RAG chat-bot assistant
app.post("/api/ai/chat", requireAuth, asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Soru alanı boş bırakılamaz." });
  }

  const result = await aiService.queryChatAssistant(query);
  res.json({
    response: result.text,
    text: result.text,
    usedChunks: result.usedChunks
  });
}));


// ==========================================
// VITE AND DEVELOPMENT CLIENT BINDING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
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
