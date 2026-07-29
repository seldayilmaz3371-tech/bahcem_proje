# Test Altyapısı (Vitest) — Yerleştirme Talimatı

## Klasör Tablosu

| # | Hedef Yol | İşlem |
|---|---|---|
| 1 | `package.json` | Üzerine yaz (`"test": "vitest run"` scripti + `vitest` devDependency eklendi) |
| 2 | `package-lock.json` | Üzerine yaz |
| 3-16 | `server/services/ai/*.test.ts` (14 dosya) | Üzerine yaz (yalnızca Vitest sarmalayıcısı eklendi, iç test mantığı **hiç değişmedi**) |

## Kurulum

```bash
npm install
npx tsc --noEmit
npm run build
npm test
```

`npm install`, `package.json`'daki yeni `vitest` bağımlılığını kuracak. Bundan sonra **herkes** `npm test` ile aynı sonucu alacak — bu ortamda **14/14 dosya, 14/14 test PASS**.

## Not

Test dosyalarının **iç mantığına** (assertion'lar, senaryolar, mock repository'ler) hiç dokunulmadı — yalnızca dosyanın en başına `import { describe, it } from "vitest"` ve en sonuna bir `describe/it` sarmalayıcısı eklendi, `process.exit(1)` çağrısı `throw new Error()`'a çevrildi (Vitest sürecini erken sonlandırmasın diye).
