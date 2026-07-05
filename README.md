# Mersin AgriTech — Zeytin Hafızası

Mersin Toroslar / Değirmençay bölgesindeki zeytinlikler için geliştirilmiş, yapay zeka destekli tarımsal karar destek sistemi. Parsel/ağaç yönetimi, saha gözlemleri, mali defter, stok takibi ve Google Gemini tabanlı fotoğraf teşhisi + RAG doküman havuzu içerir.

## Mimari Özeti

- **Backend:** Node.js + Express + TypeScript (`server.ts`, `server/`)
- **Frontend:** React + Vite + TypeScript (`src/`)
- **Veritabanı:** Yerel JSON dosyası (`data/tarim_hafizasi.json`) — harici bir veritabanı sunucusu gerekmez
- **Yapay Zeka:** Google Gemini API (metin üretimi + görsel analiz + embedding)
- **Dosya Depolama:** Fotoğraflar ve embedding'ler, ana veritabanı dosyasının şişmesini önlemek için ayrı dosyalarda (`data/photos/`, `data/embeddings/`) saklanır

## Kurulum

**Ön Koşul:** Node.js (18 veya üzeri önerilir)

1. Bağımlılıkları kurun:
   ```
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyalayın ve kendi değerlerinizle doldurun:
   ```
   cp .env.example .env
   ```
   En azından **`GEMINI_API_KEY`** alanını doldurmanız gerekir (yapay zeka özellikleri için). Diğer tüm alanlar için `.env.example` içindeki açıklamalara ve varsayılan değerlere bakın.
3. Sunucuyu başlatın:
   ```
   npm run dev
   ```
4. Tarayıcıda `http://localhost:3000` adresini açın.

**Varsayılan giriş bilgileri** (ilk kurulumda otomatik oluşturulur): kullanıcı adı `admin`, şifre `.env` dosyanızdaki `ADMIN_DEFAULT_PASSWORD` değeri (boş bırakılırsa `.env.example`'daki yorum satırına bakın). **İlk girişten sonra şifrenizi değiştirmeniz şiddetle önerilir.**

## Önemli Ortam Değişkenleri

Tüm değişkenlerin tam listesi ve açıklaması için `.env.example` dosyasına bakın. En kritik olanlar:

| Değişken | Açıklama |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API anahtarı — yapay zeka özellikleri için zorunlu |
| `SESSION_SECRET` | Üretimde mutlaka benzersiz bir değerle değiştirilmeli |
| `ADMIN_DEFAULT_PASSWORD` | Yalnızca **ilk** veritabanı oluşturulurken etkilidir |
| `GOOGLE_DRIVE_BACKUP_PATH` | (İsteğe bağlı) Yerel Google Drive senkronizasyon klasörü — otomatik bulut yedeklemesi için |

## Otomatik Arka Plan Görevleri

Sunucu çalışırken şu görevler otomatik olarak yürütülür:
- **Yedekleme:** `BACKUP_INTERVAL_HOURS` değişkenine göre (varsayılan 24 saat) veritabanı ve fotoğraflar yedeklenir (`backups/` klasörü, opsiyonel Google Drive senkronizasyonu).
- **Bildirim Kontrolü:** Kritik stok seviyeleri ve don riski her 6 saatte bir kontrol edilip gerçek bildirimler oluşturulur.

## Bilinen Kısıtlamalar

- Uygulama, aktif internet bağlantısı gerektirir; çevrimdışı çalışma desteklenmez.
- Gemini API'nin ücretsiz katmanında günlük istek kotası vardır (bkz. `server/services/ai-usage-tracker.service.ts` ve arayüzdeki kullanım göstergesi).
- Rol bazlı yetkilendirme (Admin/Çalışan/Misafir rolleri arasında farklı erişim izinleri) veri modelinde tanımlı ancak API katmanında henüz uygulanmamıştır — tüm giriş yapmış kullanıcılar şu an aynı erişime sahiptir.

## Lisans

Apache-2.0
