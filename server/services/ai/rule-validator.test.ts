/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Çalıştırma: npx tsx server/services/ai/rule-validator.test.ts */

import { ruleValidatorService } from "./rule-validator.service";
import { DosageRule } from "../../models";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
  ok ? passed++ : failed++;
};

const base: DosageRule = {
  id: "1", chemicalId: "c1", plantName: "Domates", dosageAmount: 100, dosageUnit: "ml",
  intervalDays: 7, version: 1, isActive: true, sourceType: "Resmi Etiket", createdAt: "",
};

async function main() {
  console.log("=== Geçerli kural ===");
  const r1 = ruleValidatorService.validateDosageRule({ ...base, minimumDose: 50, maximumDose: 150 });
  check("Geçerli kural isValid=true", r1.isValid);
  check("Geçerli kural hiç hata içermiyor", r1.errors.length === 0);

  console.log("\n=== min > max (hatalı) ===");
  const r2 = ruleValidatorService.validateDosageRule({ ...base, minimumDose: 200, maximumDose: 100 });
  check("min>max tespit ediliyor", !r2.isValid);
  check("Hata mesajı doğru alanı işaret ediyor", r2.errors.some((e) => e.includes("minimumDose")));

  console.log("\n=== dosageAmount, min-max aralığı dışında (altında) ===");
  const r3 = ruleValidatorService.validateDosageRule({ ...base, dosageAmount: 10, minimumDose: 50, maximumDose: 150 });
  check("Aralığın altında tespit ediliyor", !r3.isValid);

  console.log("\n=== dosageAmount, min-max aralığı dışında (üstünde) ===");
  const r4 = ruleValidatorService.validateDosageRule({ ...base, dosageAmount: 500, minimumDose: 50, maximumDose: 150 });
  check("Aralığın üstünde tespit ediliyor", !r4.isValid);

  console.log("\n=== Geçersiz versiyon numarası ===");
  const r5 = ruleValidatorService.validateDosageRule({ ...base, version: 0 });
  check("Geçersiz versiyon tespit ediliyor", !r5.isValid);

  console.log("\n=== Pasif kural, supersededBy eksik ===");
  const r6 = ruleValidatorService.validateDosageRule({ ...base, isActive: false, supersededBy: undefined });
  check("Eksik supersededBy tespit ediliyor", !r6.isValid);

  console.log("\n=== Pasif kural, supersededBy dolu (geçerli) ===");
  const r7 = ruleValidatorService.validateDosageRule({ ...base, isActive: false, supersededBy: "new-id" });
  check("Dolu supersededBy ile geçerli", r7.isValid);

  console.log("\n=== min/max hiç verilmemiş (opsiyonel, geriye dönük uyumlu) ===");
  const r8 = ruleValidatorService.validateDosageRule(base);
  check("min/max olmadan da geçerli", r8.isValid);

  console.log(`\nTOPLAM: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main();
