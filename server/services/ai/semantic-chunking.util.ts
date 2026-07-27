/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Semantic Chunking — Sprint 2B.
 *
 * Karakter-bazlı `chunkText()`'in (rag-retrieval.service.ts) yerini
 * ALMIYOR — o dosyaya hiç dokunulmadı, hâlâ orada duruyor (bkz. Sprint
 * 2 mimari raporu: "gereksiz refactor yapma", geriye dönük referans
 * olarak korunuyor). Bu dosya, `document.service.ts`'in artık
 * kullandığı YENİ, bağımsız bir algoritma sunuyor.
 *
 * FORMAT BAĞIMSIZLIĞI NASIL SAĞLANIYOR: Bu modül, PDF/DOCX/Markdown/
 * HTML'e özgü HİÇBİR sözdizimi kuralı (örn. Markdown'ın "#" işareti,
 * HTML'in "<h1>" etiketi) bilmiyor ve bilmesine gerek yok — çünkü
 * projedeki format-spesifik ayrıştırma (PDFParse, mammoth) zaten AYRI,
 * kendi route'unda (bkz. server.ts, /api/ai/documents/parse) yapılıyor
 * ve bu modüle yalnızca DÜZ METİN ulaşıyor. Bu modül yalnızca, HERHANGİ
 * bir düz metinde (kaynağı ne olursa olsun) aynı şekilde geçerli olan
 * iki EVRENSEL yapısal sinyale dayanıyor:
 *
 *   1. Boş satır(lar)la ayrılmış bloklar = paragraf sınırı
 *   2. Kısa, tek satırlık, cümle-sonu noktalaması OLMAYAN bir blok =
 *      muhtemel başlık (görsel/yapısal bir sezgi — belirli bir
 *      formatın sözdizimine bağlı değil)
 *
 * Bu, "PDF'e/Markdown'a özel regex" değildir — hangi formattan gelmiş
 * olursa olsun, düzgün çıkarılmış her düz metinde aynı şekilde
 * çalışır. Yarın yeni bir belge türü (örn. e-posta, altyazı dosyası)
 * eklendiğinde, tek gereken o formatın kendi metnini düz metne
 * çevirmesi — bu modülün KENDİSİ hiç değişmeden çalışmaya devam eder
 * (bkz. Sprint 2B madde 5).
 */

export interface SemanticChunk {
  content: string;
  /** En yakın tespit edilen başlık — bulunamazsa undefined (uydurulmaz). */
  heading?: string;
}

/** Bir bloğun "muhtemel başlık" sayılması için üst karakter sınırı. */
const HEADING_MAX_LENGTH = 80;

/**
 * Bir metin bloğunun görsel/yapısal olarak bir başlığa benzeyip
 * benzemediğini değerlendirir. Format-bağımsız, yalnızca evrensel
 * gözlemlere dayanıyor: başlıklar genelde kısadır, tek satırdır ve
 * cümle gibi bir noktalamayla bitmez (bir paragraf cümlesi neredeyse
 * her zaman ". ! ? ," ile biter veya en azından çok satırlıdır).
 */
function looksLikeHeading(block: string): boolean {
  const trimmed = block.trim();
  if (trimmed.length === 0 || trimmed.length > HEADING_MAX_LENGTH) return false;
  if (trimmed.includes("\n")) return false; // başlıklar tek satırdır
  const lastChar = trimmed.charAt(trimmed.length - 1);
  if ([".", ",", ";", ":", "!", "?"].includes(lastChar)) return false;
  // Bir başlık en az bir harf içermelidir — bu, herhangi bir formata
  // özel bir kural değil, genel bir sağduyu kontrolü: yalnızca rakam/
  // tire/boşluktan oluşan kısa satırlar ("-- 1 / 3 --" gibi bir sayfa
  // numarası altyazısı — gerçek testte PDFParse çıktısında karşılaşıldı)
  // asla anlamlı bir bölüm başlığı olamaz.
  // Bir başlık, ağırlıklı olarak harflerden oluşmalıdır — bu, herhangi
  // bir formata özel bir kural değil, genel bir sağduyu kontrolü.
  // Yalnızca "en az bir harf" yeterli değil: "-- 1 of 1 --" gibi bir
  // sayfa numarası altyazısı da teknik olarak bir harf içerir ("of"),
  // ama esas olarak rakam/tire/boşluktan oluşur (gerçek testte
  // PDFParse çıktısında karşılaşıldı). Harflerin toplam uzunluğun
  // yarısından azını oluşturduğu satırlar başlık sayılmaz.
  const letterCount = (trimmed.match(/\p{L}/gu) || []).length;
  if (letterCount < trimmed.length / 2) return false;
  return true;
}

/**
 * PDF gibi kaynaklardan gelen metinlerde, her satır sonu bir paragraf
 * sonu DEĞİLDİR — çoğu zaman yalnızca sayfa genişliğine göre otomatik
 * kelime kaydırmasının (word-wrap) sonucudur (gerçek PDF testinde
 * karşılaşıldı: bir cümle iki satıra yayılmış, ikisi de gerçekte AYNI
 * cümlenin parçası). Bunu format-bağımsız şekilde ayırt etmenin
 * evrensel yolu: bir önceki satır cümle-sonu noktalamasıyla (. ! ? :)
 * BİTMİYORSA, sonraki satır muhtemelen onun DEVAMIDIR, yeni bir
 * paragraf/blok değil — birleştirilmelidir. Bu, "bir paragraf mümkün
 * olduğunca bölünmemeli" prensibini, satır-bazlı bir yedek mekanizmada
 * da korumak için gerekli.
 */
function mergeWrappedLines(lines: string[]): string[] {
  const merged: string[] = [];
  for (const line of lines) {
    const prevIndex = merged.length - 1;
    const prev = prevIndex >= 0 ? merged[prevIndex] : undefined;
    const prevEndsSentence = prev !== undefined && /[.!?:]$/.test(prev.trim());
    if (prev !== undefined && !prevEndsSentence && !looksLikeHeading(prev) && !looksLikeHeading(line)) {
      // Önceki satır bir cümleyi tamamlamamış ve ikisi de başlık gibi
      // görünmüyor — bu, muhtemelen kelime kaydırmasıdır, birleştir.
      merged[prevIndex] = `${prev} ${line}`;
    } else {
      merged.push(line);
    }
  }
  return merged;
}

/**
 * Metni, önce boş satır(lar)ına göre bloklara ayırmayı dener (klasik,
 * iyi biçimlendirilmiş düz metin durumu). Bu yalnızca TEK bir blok
 * üretiyorsa — yani kaynak metin gerçek paragraf ayraçları
 * içermiyorsa (gerçek testte bazı PDF ayrıştırıcı çıktılarında
 * görüldüğü gibi, paragraflar arası çift değil TEK satır sonu
 * kullanılıyor) — tek satır sonlarına göre bölmeye düşer; ama önce
 * kelime-kaydırması kaynaklı yapay satır sonlarını birleştirir (bkz.
 * mergeWrappedLines). Bu, "PDF'e özel" bir kural değil: herhangi bir
 * kaynaktan gelen, paragraf ayraçlarını farklı şekilde temsil eden düz
 * metin için aynı şekilde geçerli, tamamen format-bağımsız bir yedek
 * mekanizma.
 */
function splitIntoBlocks(text: string): string[] {
  const byBlankLine = text
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  if (byBlankLine.length === 0) return [];

  // Yalnızca "en az 2 parça bulundu mu" kontrolü YETERSİZ — gerçek
  // testte, metnin SONUNDA (örn. bir sayfa altyazısından önce) tek bir
  // gerçek boş satır bulunması, tüm ana içeriği (hâlâ kelime-kaydırmalı
  // tek satırlarla dolu, tek dev bir blok olarak) yanlışlıkla "iyi
  // bölünmüş" gibi göstermişti. Bunun yerine HER blok AYRI AYRI
  // değerlendiriliyor: bir blok hâlâ "başlık boyutunun oldukça
  // üzerinde" VE içinde satır sonu varsa, muhtemelen kelime kaydırmalı
  // birden fazla satırdan oluşuyordur — bu tek blok için satır-bazlı
  // birleştirme (mergeWrappedLines) ayrıca uygulanır.
  const result: string[] = [];
  for (const block of byBlankLine) {
    if (block.length > HEADING_MAX_LENGTH && block.includes("\n")) {
      const rawLines = block
        .split(/\n/)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
      result.push(...mergeWrappedLines(rawLines));
    } else {
      result.push(block);
    }
  }
  return result;
}

/**
 * Tek bir paragrafın kendisi hedef boyutu aştığında (madde 4: "Çok
 * uzun paragraflar gerektiğinde bölünebilir") devreye giren son çare —
 * cümle sınırlarında (". "/"! "/"? " sonrası) böler, kelimenin veya
 * cümlenin ortasından KESMEZ.
 */
function splitLongParagraph(text: string, targetSize: number): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length > 0 && current.length + sentence.length + 1 > targetSize) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

/**
 * Metni, belge yapısını (başlık/paragraf sınırları) koruyan chunk'lara
 * ayırır.
 *
 * Uygulanan prensipler (bkz. Sprint 2B madde 4):
 * - Bir başlık, her zaman kendi chunk'ının İÇİNDE, takip eden ilk
 *   içerikle BİRLİKTE kalır — asla yalnız başına, içeriğinden kopuk
 *   bırakılmaz.
 * - Normal bir paragraf, hedef boyutu aşmadığı sürece BÖLÜNMEZ — yalnı
 *   zca hedef boyutu doldurunca YENİ bir chunk başlar (mevcut paragrafı
 *   kesmek yerine, bir SONRAKİ paragrafı yeni chunk'a taşır).
 * - Yalnızca TEK BAŞINA hedef boyutu aşan bir paragraf, cümle
 *   sınırında bölünür (fallback, ana strateji değil).
 * - `minChunkSize`'ın altındaki gereksiz küçük chunk'lar, bir sonraki
 *   içerikle birleştirilir.
 * - Aynı başlık altındaki içerik, boyut sınırına kadar TEK chunk'ta
 *   tutulmaya çalışılır (madde 4: "aynı konu mümkün olduğunca tek
 *   chunk içinde kalmalı").
 */
export function semanticChunkText(text: string, targetSize = 800, minChunkSize = 200): SemanticChunk[] {
  const blocks = splitIntoBlocks(text);
  if (blocks.length === 0) return [];

  const chunks: SemanticChunk[] = [];
  let currentParts: string[] = [];
  let currentSize = 0;
  let currentHeading: string | undefined;

  const flush = () => {
    if (currentParts.length === 0) return;
    chunks.push({ content: currentParts.join("\n\n"), heading: currentHeading });
    currentParts = [];
    currentSize = 0;
  };

  for (const block of blocks) {
    if (looksLikeHeading(block)) {
      // Sprint 2B kök neden analizi (gerçek "Study 1-7" testi):
      // önceki sürüm, biriken içerik `minChunkSize`'ın altında kaldığı
      // sürece yeni bir başlığı flush ETMİYORDU — bu, ardışık KISA
      // bölümlerin (örn. "Study 3: Kısa bir not.") kendi resmi
      // `heading` etiketini HİÇBİR ZAMAN alamamasına yol açıyordu
      // (önceki başlığın chunk'ına sessizce gömülüyordu). Gerçek
      // testte 7 başlıktan 3'ü (Study 3, 4, 6) bu yüzden kayboldu.
      //
      // Bu artık KASITLI OLARAK değişti: her başlık, biriken içeriğin
      // boyutuna BAKMAKSIZIN her zaman kendi chunk'ını başlatır.
      // "Gereksiz küçük chunk oluşmaması" ilkesi ile "her başlık kendi
      // resmi etiketini almalı" ilkesi burada gerçek bir çelişki
      // oluşturuyordu (heading tekil bir alan, birden fazla başlığı
      // aynı anda temsil edemez) — RAG'ın doğru çalışması için
      // ARAMA/RETRIEVAL doğruluğu, chunk boyutu tutarlılığından daha
      // kritik: küçük bir chunk yalnızca hafif bir verimsizlik
      // yaratır, ama kayıp bir başlık kullanıcının doğrudan sorduğu
      // bir bölümü SİSTEMİN BULAMAMASINA yol açar (kanıtlanan gerçek
      // sorun).
      if (currentParts.length > 0) {
        flush();
      }
      currentHeading = block;
      currentParts.push(block);
      currentSize += block.length;
      continue;
    }

    if (block.length > targetSize) {
      // Tek başına hedef boyutu aşan bir paragraf — son çare olarak
      // cümle sınırında bölünür.
      const subParts = splitLongParagraph(block, targetSize);
      for (const part of subParts) {
        if (currentSize > 0 && currentSize + part.length > targetSize && currentSize >= minChunkSize) {
          flush();
          // Aynı başlık altında devam ediyoruz — başlığı yeni chunk'a
          // da taşıyoruz ki "aynı konu tek chunk'ta kalsın" ilkesi
          // (kısmen) korunsun ve chunk'lar bağlamsız kalmasın.
          if (currentHeading) {
            currentParts.push(currentHeading);
            currentSize += currentHeading.length;
          }
        }
        currentParts.push(part);
        currentSize += part.length;
      }
      continue;
    }

    if (currentSize > 0 && currentSize + block.length > targetSize && currentSize >= minChunkSize) {
      flush();
      if (currentHeading) {
        currentParts.push(currentHeading);
        currentSize += currentHeading.length;
      }
    }
    currentParts.push(block);
    currentSize += block.length;
  }

  flush();
  return mergeEmptyLabelChunks(chunks);
}

/**
 * Post-processing adımı — "içeriksiz mini-chunk" düzeltmesi.
 *
 * KAPSAM: Bu fonksiyon `semanticChunkText()`'in ANA döngüsünden (yukarıda,
 * "her başlık boyutuna bakılmaksızın kendi chunk'ını başlatır" kararı)
 * SONRA, tamamlanmış chunk listesi üzerinde çalışır — ana döngünün
 * kendisine HİÇBİR satır eklenmedi/değiştirilmedi. Bu, Study 1-7
 * senaryosunun dayandığı "her başlık kendi resmi etiketini alır" kararını
 * bozmaz (bkz. kanıt: Study 1-7'nin hiçbir chunk'ında content === heading
 * durumu oluşmuyor, çünkü her başlığın hemen ardından gerçek bir paragraf
 * geliyor — bu fonksiyon o durumlarda hiçbir şeyi değiştirmez).
 *
 * NE YAPAR: Bir chunk'ın içeriği kendi başlığından ibaretse (yani
 * `content.trim() === heading.trim()` — hiçbir paragraf eklenmeden hemen
 * bir sonraki başlık geldiyse, gerçek testte "Bağ Mildiyö / Yalancı
 * Mildiyö / Mildiyö (Domates) / Mutifa WG / Efdal" gibi ardışık ürün/
 * hastalık adı listelerinde kanıtlandı), bu chunk kendi başına
 * YAYINLANMAZ — bir sonraki (gerçek içerikli) chunk'ın başına eklenir.
 * Böylece "Mutifa WG" gibi bir etiket, artık tek başına, bağlamsız bir
 * chunk olarak izole kalmaz; en azından kendi liste grubuyla veya
 * ardından gelen ilk gerçek içerikle birlikte bir chunk'ta bulunur.
 */
function mergeEmptyLabelChunks(chunks: SemanticChunk[]): SemanticChunk[] {
  const result: SemanticChunk[] = [];
  let carryOver: string | null = null;

  for (const current of chunks) {
    const isEmptyLabel = current.heading !== undefined && current.content.trim() === current.heading.trim();

    if (isEmptyLabel) {
      carryOver = carryOver ? `${carryOver}\n\n${current.content}` : current.content;
      continue;
    }

    if (carryOver) {
      result.push({ ...current, content: `${carryOver}\n\n${current.content}` });
      carryOver = null;
    } else {
      result.push(current);
    }
  }

  // Belgenin en sonu içeriksiz chunk'larla bitiyorsa (birleştirilecek bir
  // "sonraki" chunk yoksa), son gerçek chunk'a eklenir — hiçbir metin
  // sessizce kaybolmaz.
  if (carryOver) {
    if (result.length > 0) {
      result[result.length - 1] = {
        ...result[result.length - 1],
        content: `${result[result.length - 1].content}\n\n${carryOver}`,
      };
    } else {
      // Aşırı uç durum: belgenin TAMAMI yalnızca ardışık başlıklardan
      // oluşuyor — bunu tek bir chunk olarak koru.
      result.push({ content: carryOver });
    }
  }

  return result;
}
