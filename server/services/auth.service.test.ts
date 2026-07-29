/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sprint 6B — AuthService Güvenlik Test Süiti.
 *
 * KAPSAM: login/rate-limit (P0), hasPermission/RBAC (P0),
 * validateSession (P1), changePassword (P1), registerUser (P2),
 * logout (P2).
 *
 * İZOLASYON STRATEJİSİ: `userRepository`, `roleRepository` ve
 * `activityLogRepository` bu dosyada `vi.mock()` ile TAMAMEN mock'lanır.
 * Bu, gerçek `server/database.ts` modülünün (ve dolayısıyla gerçek
 * `data/tarim_hafizasi.json` üretim dosyasının) bu test dosyası
 * yüzünden HİÇ import edilmemesini garanti eder — çünkü mock'lanan bir
 * modülün gerçek kaynak kodu Vitest tarafından hiç çalıştırılmaz.
 * `AuthService`'in kendisi hiç değiştirilmedi: bağımlılıkları hâlâ
 * modül-seviyesinde import ediyor (constructor injection yok), test
 * bunu native Vitest modül mock'lamasıyla karşılıyor — mimariye
 * herhangi bir müdahale gerekmedi.
 *
 * `bcrypt` kasıtlı olarak MOCK'LANMADI: gerçek hash/compare
 * davranışının doğru çalıştığını kanıtlamak testin asıl amacı
 * (örn. "yanlış şifre reddedilir" senaryosu, sahte bir bcrypt ile
 * anlamsızlaşırdı).
 *
 * TEST İZOLASYONU: `AuthService` içindeki `ACTIVE_SESSIONS` ve
 * `loginAttempts`, modül yüklendiğinde bir kez oluşturulan paylaşılan
 * state'lerdir (constructor injection olmadığı için `vi.resetModules()`
 * kullanmak yerine — ki bu her testte mock fabrikalarının yeniden
 * bağlanmasını gerektirir ve kırılgandır — her test senaryosu kendi
 * BENZERSİZ kullanıcı adını/IP'sini kullanarak rate-limit anahtarlarının
 * çakışmasını doğal olarak önler. `login()` her başarılı çağrıda
 * `crypto.randomUUID()` ile yeni bir token ürettiği için token
 * çakışması zaten yapısal olarak imkânsızdır.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { UserRole, User } from "../models";

// ---------------------------------------------------------------------
// fs.existsSync / writeFileSync / mkdirSync: gerçek data/sessions.json
// dosyasına hiçbir okuma/yazma yapılmasın diye "dosya hiç yok" gibi
// davranılır. ESM modül isim uzayı (namespace) donuk/read-only olduğu
// için `vi.spyOn(fs, ...)` burada çalışmaz (Vitest 4 / Node ESM
// kısıtlaması) — bunun yerine `vi.mock("fs", ...)` ile kısmi (partial)
// modül mock'u kullanılır: gerçek `fs`'in geri kalanı korunur, yalnızca
// bu 3 fonksiyon override edilir. AuthService modülü bu davranışı yalnızca
// import zamanında (`const ACTIVE_SESSIONS = loadSessions()`) bir kez
// okuduğu için mock, gerçek modül hiç import edilmeden önce (vi.mock
// hoisting sayesinde) devrede olur.
// ---------------------------------------------------------------------
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...(actual as any).default,
      existsSync: () => false,
      writeFileSync: () => undefined,
      mkdirSync: () => undefined,
    },
    existsSync: () => false,
    writeFileSync: () => undefined,
    mkdirSync: () => undefined,
  };
});

vi.mock("../repositories/user.repository", () => ({
  userRepository: {
    getByUsername: vi.fn(),
    getByEmail: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  roleRepository: {
    getPermissionsByRole: vi.fn(),
  },
}));

vi.mock("../repositories/activity.repository", () => ({
  activityLogRepository: {
    writeLog: vi.fn().mockResolvedValue({}),
  },
}));

// Mock'lar kurulduktan SONRA gerçek modülü içe aktar — Vitest,
// vi.mock() çağrılarını dosyanın en başına "hoist" ettiği için bu
// import satırı gerçekte mock'lanmış bağımlılıklarla çalışır.
import { authService } from "./auth.service";
import { userRepository, roleRepository } from "../repositories/user.repository";
import { activityLogRepository } from "../repositories/activity.repository";

const mockUserRepository = vi.mocked(userRepository);
const mockRoleRepository = vi.mocked(roleRepository);
const mockActivityLogRepository = vi.mocked(activityLogRepository);

/** Testler için gerçek bcrypt ile hash'lenmiş bir kullanıcı üretir. */
function buildTestUser(overrides: Partial<User> = {}): User {
  return {
    id: overrides.id ?? "user-test-1",
    username: overrides.username ?? "test.kullanici",
    passwordHash: overrides.passwordHash ?? bcrypt.hashSync("DogruSifre123!", 10),
    fullName: "Test Kullanıcı",
    role: overrides.role ?? UserRole.WORKER,
    email: overrides.email ?? "test.kullanici@example.com",
    phoneNumber: "+90 500 000 0000",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    isActive: overrides.isActive ?? true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =======================================================================
// LOGIN — P0
// =======================================================================
describe("AuthService.login", () => {
  it("doğru kullanıcı adı ve şifreyle başarılı giriş yapar, token döner", async () => {
    const user = buildTestUser({ username: "login-basarili", id: "u-1" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const result = await authService.login("login-basarili", "DogruSifre123!", "10.0.0.1");

    expect(result).not.toBeNull();
    expect(result?.token).toBeTruthy();
    expect(result?.user.id).toBe("u-1");
    expect(mockActivityLogRepository.writeLog).toHaveBeenCalledWith(
      "u-1",
      "LOGIN_SUCCESS",
      expect.any(String),
      "10.0.0.1"
    );
  });

  it("yanlış şifreyle giriş reddedilir, null döner", async () => {
    const user = buildTestUser({ username: "yanlis-sifre-testi", id: "u-2" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const result = await authService.login("yanlis-sifre-testi", "YanlisSifre!", "10.0.0.2");

    expect(result).toBeNull();
    expect(mockActivityLogRepository.writeLog).toHaveBeenCalledWith(
      "u-2",
      "LOGIN_FAILED",
      expect.any(String),
      "10.0.0.2"
    );
  });

  it("olmayan kullanıcı adıyla giriş reddedilir, null döner", async () => {
    mockUserRepository.getByUsername.mockResolvedValue(null);

    const result = await authService.login("hic-boyle-biri-yok", "HerhangiBirSifre", "10.0.0.3");

    expect(result).toBeNull();
    // Kullanıcı bulunamadığında activity log YAZILMAZ (yazılacak bir
    // userId olmadığı için) — kaynak kod davranışı bu şekilde.
    expect(mockActivityLogRepository.writeLog).not.toHaveBeenCalled();
  });

  it("pasif (isActive=false) kullanıcı doğru şifreyle bile giriş yapamaz", async () => {
    const user = buildTestUser({ username: "pasif-kullanici", id: "u-4", isActive: false });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const result = await authService.login("pasif-kullanici", "DogruSifre123!", "10.0.0.4");

    expect(result).toBeNull();
  });

  it("5 başarısız denemeden sonra 6. deneme, şifre doğru olsa bile rate-limit ile reddedilir", async () => {
    const username = "rate-limit-testi";
    const user = buildTestUser({ username, id: "u-5" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    // Aynı IP'den 5 kez yanlış şifre dene (MAX_FAILED_LOGIN_ATTEMPTS = 5)
    for (let i = 0; i < 5; i++) {
      const attempt = await authService.login(username, "YanlisSifre", "10.0.0.5");
      expect(attempt).toBeNull();
    }

    // 6. deneme, DOĞRU şifreyle bile artık rate-limit'e takılmalı
    const sixthAttempt = await authService.login(username, "DogruSifre123!", "10.0.0.5");
    expect(sixthAttempt).toBeNull();
  });

  it("rate-limit farklı bir IP/kullanıcı için ayrı ayrı izlenir (çapraz kilitlenme olmaz)", async () => {
    const userA = buildTestUser({ username: "carpraz-a", id: "u-6a" });
    const userB = buildTestUser({ username: "carpraz-b", id: "u-6b" });

    mockUserRepository.getByUsername.mockImplementation(async (u: string) =>
      u.toLowerCase() === "carpraz-a" ? userA : u.toLowerCase() === "carpraz-b" ? userB : null
    );

    for (let i = 0; i < 5; i++) {
      await authService.login("carpraz-a", "YanlisSifre", "10.0.0.6");
    }
    // A kilitlendi
    expect(await authService.login("carpraz-a", "DogruSifre123!", "10.0.0.6")).toBeNull();

    // B, farklı bir IP üzerinden hâlâ giriş yapabilmeli (etkilenmemeli)
    const resultB = await authService.login("carpraz-b", "DogruSifre123!", "10.0.0.7");
    expect(resultB).not.toBeNull();
  });

  it("aynı kullanıcı art arda iki kez giriş yapabilir, her seferinde farklı bir token üretilir", async () => {
    const user = buildTestUser({ username: "tekrar-giris", id: "u-7" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const first = await authService.login("tekrar-giris", "DogruSifre123!", "10.0.0.8");
    const second = await authService.login("tekrar-giris", "DogruSifre123!", "10.0.0.8");

    expect(first?.token).toBeTruthy();
    expect(second?.token).toBeTruthy();
    expect(first?.token).not.toBe(second?.token);
  });
});

// =======================================================================
// HASPERMISSION — P0 (saf fonksiyon, repository bağımlılığı yok)
// =======================================================================
describe("AuthService.hasPermission", () => {
  it("admin (wildcard '*') her izne erişebilir", () => {
    expect(authService.hasPermission(["*"], "parcels:delete")).toBe(true);
    expect(authService.hasPermission(["*"], "users:write")).toBe(true);
  });

  it("worker yalnızca kendi tanımlı iznine sahipse erişebilir", () => {
    const workerPermissions = ["parcels:read", "observations:write"];
    expect(authService.hasPermission(workerPermissions, "parcels:read")).toBe(true);
    expect(authService.hasPermission(workerPermissions, "observations:write")).toBe(true);
  });

  it("worker, sahip olmadığı bir izne erişemez (reddedilen yetki)", () => {
    const workerPermissions = ["parcels:read", "observations:write"];
    expect(authService.hasPermission(workerPermissions, "parcels:delete")).toBe(false);
    expect(authService.hasPermission(workerPermissions, "users:write")).toBe(false);
  });

  it("guest ('*:read' wildcard) yalnızca okuma izinlerine erişebilir", () => {
    const guestPermissions = ["*:read"];
    expect(authService.hasPermission(guestPermissions, "parcels:read")).toBe(true);
    expect(authService.hasPermission(guestPermissions, "equipment:read")).toBe(true);
    expect(authService.hasPermission(guestPermissions, "parcels:write")).toBe(false);
  });

  it("domain wildcard ('parcels:*') o domaindeki her eylemi karşılar", () => {
    const permissions = ["parcels:*"];
    expect(authService.hasPermission(permissions, "parcels:read")).toBe(true);
    expect(authService.hasPermission(permissions, "parcels:write")).toBe(true);
    expect(authService.hasPermission(permissions, "parcels:delete")).toBe(true);
    expect(authService.hasPermission(permissions, "equipment:read")).toBe(false);
  });

  it("boş izin listesi hiçbir yetkiyi karşılamaz", () => {
    expect(authService.hasPermission([], "parcels:read")).toBe(false);
  });
});

// =======================================================================
// SESSION — P1
// =======================================================================
describe("AuthService.validateSession", () => {
  it("geçerli (yeni oluşturulmuş) bir session doğrulanır, kullanıcı ve izinler döner", async () => {
    const user = buildTestUser({ username: "session-gecerli", id: "u-8", role: UserRole.WORKER });
    mockUserRepository.getByUsername.mockResolvedValue(user);
    mockUserRepository.getById.mockResolvedValue(user);
    mockRoleRepository.getPermissionsByRole.mockResolvedValue(["parcels:read"]);

    const loginResult = await authService.login("session-gecerli", "DogruSifre123!", "10.0.0.9");
    const validation = await authService.validateSession(loginResult!.token);

    expect(validation.isValid).toBe(true);
    expect(validation.user?.id).toBe("u-8");
    expect(validation.permissions).toEqual(["parcels:read"]);
  });

  it("olmayan (hiç üretilmemiş) bir token için session geçersiz sayılır", async () => {
    const validation = await authService.validateSession("hic-var-olmayan-token-xyz");
    expect(validation.isValid).toBe(false);
    expect(validation.user).toBeNull();
    expect(validation.permissions).toEqual([]);
  });

  it("süresi dolmuş bir session geçersiz sayılır", async () => {
    const user = buildTestUser({ username: "session-suresi-dolan", id: "u-9" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    vi.useFakeTimers();
    try {
      const loginResult = await authService.login("session-suresi-dolan", "DogruSifre123!", "10.0.0.10");
      // Oturum ömrü 12 saat (sessionTimeoutMs) — 12 saat + 1 dakika ileri sar
      vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 60 * 1000);

      const validation = await authService.validateSession(loginResult!.token);
      expect(validation.isValid).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logout sonrası aynı token artık geçerli sayılmaz", async () => {
    const user = buildTestUser({ username: "logout-sonrasi", id: "u-10" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const loginResult = await authService.login("logout-sonrasi", "DogruSifre123!", "10.0.0.11");
    await authService.logout(loginResult!.token, "10.0.0.11");

    const validation = await authService.validateSession(loginResult!.token);
    expect(validation.isValid).toBe(false);
  });

  it("kullanıcı sonradan pasif hale getirilmişse (isActive=false) geçerli session bile reddedilir", async () => {
    const user = buildTestUser({ username: "sonradan-pasif", id: "u-11", isActive: true });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const loginResult = await authService.login("sonradan-pasif", "DogruSifre123!", "10.0.0.12");

    // Kullanıcı artık pasif olarak işaretlendi (örn. bir admin tarafından)
    mockUserRepository.getById.mockResolvedValue({ ...user, isActive: false });

    const validation = await authService.validateSession(loginResult!.token);
    expect(validation.isValid).toBe(false);
  });
});

// =======================================================================
// PASSWORD — P1
// =======================================================================
describe("AuthService.changePassword", () => {
  it("doğru eski şifreyle şifre değişimi başarılı olur", async () => {
    const user = buildTestUser({ id: "u-12" });
    mockUserRepository.getById.mockResolvedValue(user);
    mockUserRepository.update.mockResolvedValue(user);

    const result = await authService.changePassword("u-12", "DogruSifre123!", "YeniSifre456!");

    expect(result).toBe(true);
    expect(mockUserRepository.update).toHaveBeenCalledWith(
      "u-12",
      expect.objectContaining({ passwordHash: expect.any(String) })
    );
  });

  it("yanlış eski şifreyle değişim reddedilir", async () => {
    const user = buildTestUser({ id: "u-13" });
    mockUserRepository.getById.mockResolvedValue(user);

    const result = await authService.changePassword("u-13", "TamamenYanlisSifre", "YeniSifre456!");

    expect(result).toBe(false);
    expect(mockUserRepository.update).not.toHaveBeenCalled();
  });

  it("yeni şifre gerçekten bcrypt ile hash'lenir ve eski hash'ten farklıdır", async () => {
    const user = buildTestUser({ id: "u-14" });
    mockUserRepository.getById.mockResolvedValue(user);
    mockUserRepository.update.mockResolvedValue(user);

    await authService.changePassword("u-14", "DogruSifre123!", "YeniSifre456!");

    const updateCallArgs = mockUserRepository.update.mock.calls[0][1] as { passwordHash: string };
    expect(updateCallArgs.passwordHash).not.toBe(user.passwordHash);
    // Yeni hash, yeni düz metin şifreyle gerçekten eşleşmeli (sahte/rastgele bir string değil)
    expect(bcrypt.compareSync("YeniSifre456!", updateCallArgs.passwordHash)).toBe(true);
  });

  it("var olmayan kullanıcı için şifre değişimi false döner", async () => {
    mockUserRepository.getById.mockResolvedValue(null);
    const result = await authService.changePassword("olmayan-id", "HerhangiBirSey", "YeniSifre456!");
    expect(result).toBe(false);
  });
});

// =======================================================================
// REGISTER — P2
// =======================================================================
describe("AuthService.registerUser", () => {
  it("çakışma yoksa yeni kullanıcı başarıyla kaydedilir", async () => {
    mockUserRepository.getByUsername.mockResolvedValue(null);
    mockUserRepository.getByEmail.mockResolvedValue(null);
    const created = buildTestUser({ id: "u-15", username: "yeni.kullanici" });
    mockUserRepository.create.mockResolvedValue(created);

    const result = await authService.registerUser(
      "creator-id",
      "yeni.kullanici",
      "SifreABC123!",
      "Yeni Kullanıcı",
      "yeni@example.com",
      UserRole.WORKER
    );

    expect(result).not.toBeNull();
    expect(result?.username).toBe("yeni.kullanici");
    expect(mockActivityLogRepository.writeLog).toHaveBeenCalled();
  });

  it("kullanıcı adı zaten kayıtlıysa kayıt reddedilir", async () => {
    mockUserRepository.getByUsername.mockResolvedValue(buildTestUser({ username: "mevcut.kullanici" }));

    const result = await authService.registerUser(
      "creator-id",
      "mevcut.kullanici",
      "SifreABC123!",
      "Tekrar Kayıt",
      "farkli@example.com",
      UserRole.WORKER
    );

    expect(result).toBeNull();
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });

  it("e-posta zaten kayıtlıysa kayıt reddedilir", async () => {
    mockUserRepository.getByUsername.mockResolvedValue(null);
    mockUserRepository.getByEmail.mockResolvedValue(buildTestUser({ email: "mevcut@example.com" }));

    const result = await authService.registerUser(
      "creator-id",
      "farkli.kullaniciadi",
      "SifreABC123!",
      "Tekrar E-posta",
      "mevcut@example.com",
      UserRole.WORKER
    );

    expect(result).toBeNull();
    expect(mockUserRepository.create).not.toHaveBeenCalled();
  });
});

// =======================================================================
// LOGOUT — P2
// =======================================================================
describe("AuthService.logout", () => {
  it("var olan bir session başarıyla sonlandırılır", async () => {
    const user = buildTestUser({ username: "logout-testi", id: "u-16" });
    mockUserRepository.getByUsername.mockResolvedValue(user);

    const loginResult = await authService.login("logout-testi", "DogruSifre123!", "10.0.0.13");
    const result = await authService.logout(loginResult!.token, "10.0.0.13");

    expect(result).toBe(true);
  });

  it("var olmayan bir token için logout false döner, hata fırlatmaz", async () => {
    const result = await authService.logout("hic-var-olmayan-token", "10.0.0.14");
    expect(result).toBe(false);
  });
});
