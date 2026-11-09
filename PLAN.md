# Gitupcms Forms: karşılaştırma ve yol haritası

Bu belgede Static Forms, Formtorch ve Formserve'ün incelemesi ve yapacağımız açık kaynak form eklentisinin kapsamı var.
İnceleme, `../../staticforms`, `../../formtorch` ve `../../formserve` klasörlerindeki ekran görüntülerine ve özellik
belgelerine dayanıyor (9 Kasım 2026).

**Hedef:** Kendi sunucunda çalışan, açık kaynak (MIT) bir form backend'i. Siteye backend kodu gerekmez: düz bir HTML
`<form action=".../f/<key>" method="POST">` yeter. Aynı kod WuppyCMS'e eklenti olarak girer, WuppyCMS sadece tasarımı
değiştirir (Gitupcms Comments ile aynı düzen, bkz. `../cms/scripts/sync-plugins.mjs`).

---

## 1. Kısa sonuç

Üçü de **kapalı kaynak SaaS**; hiçbiri self-host edilemiyor. Bizim farkımız bu olacak.

| | En iyi yaptığı | Bizim alacağımız |
|---|---|---|
| **Formserve** | İlk deneyim ve teslim takibi: hesapsız test endpoint'i (60 saniyede çalışan form), her gönderimin hangi hedefe iletildiğini gösteren **delivery log**, "AI prompt generator", müşteriye sadece lead gösteren **business inbox** | Kurulum sonrası "ilk gönderimi canlı gör" ekranı, teslim logu, kopyala-yapıştır prompt |
| **Formtorch** | Spam: **TorchWarden** her gönderime skor + tetiklenen sinyaller verir; spam silinmez, **karantinaya** alınır; bildirim e-postasında imzalı, onay sayfalı **"Mark as spam"** linki; spam ve test gönderimleri kotaya sayılmaz; webhook imza doğrulaması | Katmanlı spam skoru + sinyal listesi, karantina, e-postadan imzalı "spam işaretle" |
| **Static Forms** | Güç kullanıcısı özellikleri: **Form Rules** (alan değerine göre "when/then" yönlendirme, dry-run), MCP/agent erişimi, AI Reply, görsel form builder + embed, AB veri bölgesi | Basit "when/then" yönlendirme (sonra), MCP (sonra) |

Tasarım dili olarak en temizi Formserve (beyaz, mono font'lu endpoint kutusu, "200 OK" rozetleri). Formtorch'un
dashboard'u (koyu, tablo + Spam rozeti) inbox için iyi bir referans.

---

## 2. Özellik karşılaştırması

| Özellik | Static Forms | Formtorch | Formserve | Biz (v0.1) |
|---|---|---|---|---|
| Tek satır `action` endpoint | ✓ (`apiKey` gizli alanı) | ✓ | ✓ (`/f/<key>`) | ✓ `/f/<key>` |
| Hesapsız test endpoint'i | – | – | ✓ (24 saat, 10 gönderim) | – (self-host'ta gerek yok; kurulumda "test gönderimi" butonu) |
| Honeypot | ✓ | ✓ | ✓ | ✓ |
| Rate limit (IP) | ? | ✓ | ✓ | ✓ |
| Spam skoru + sinyaller | otomatik filtre | ✓ TorchWarden | ağırlıklı skor, düşük/orta/yüksek | ✓ |
| Karantina (silmeden) | kural ile | ✓ | ? | ✓ |
| Keyword / e-posta / IP blocklist | – | – | ✓ | ✓ (basit liste) |
| CAPTCHA | reCAPTCHA, Turnstile, hCaptcha, Altcha | Turnstile | – | Turnstile (sonra) |
| İzinli domainler | ✓ | ✓ | ✓ | ✓ |
| `_redirect` / başarı sayfası | ✓ | ✓ | ✓ | ✓ |
| AJAX (JSON yanıt) | ✓ | ✓ | ✓ formserve.js | ✓ `Accept: application/json` |
| E-posta bildirimi, çoklu alıcı | ✓ (5 CC) | ✓ | ✓ | ✓ |
| Auto-responder | ✓ | Pro | ✓ | sonra |
| Inbox: arama, filtre, detay | ✓ | ✓ | ✓ | ✓ |
| Teslim logu / yeniden gönder | – | ✓ | ✓ | ✓ (e-posta + webhook) |
| CSV export | ✓ | ✓ | ✓ | ✓ |
| Webhook (imzalı) | ✓ | ✓ imzalı | ✓ | ✓ HMAC |
| Slack / Discord / Sheets / Notion… | ✓ çok | ✓ | ✓ çok | webhook ile; hazır Slack/Discord sonra |
| Dosya yükleme | ✓ 4,5 MB | Starter+ | ✓ | sonra |
| Form Rules (when/then) | ✓ dry-run | – | "route by form" | sonra |
| REST API | ✓ OpenAPI | read-only | ✓ `X-API-Key` | sonra |
| Ekip / roller | ✓ | – | ✓ ajans | ✓ (Gitupcms Team hazır) |
| Business/müşteri inbox | lead mgmt | – | ✓ | sonra |
| AI prompt generator | – | – | ✓ | ✓ (kurulum ekranında kopyala) |
| MCP / AI Reply | ✓ | – | – | yok (şimdilik) |
| Görsel form builder | ✓ | – | – | yok: form sitede kalır |
| Self-host / açık kaynak | – | – | – | **✓** |

---

## 3. v0.1 kapsamı (ilk sürüm)

Gitupcms Comments'in iskeleti aynen kullanılır: admin girişi (e-posta+şifre, GitHub), Team/davetler, SMTP,
şifreli ayarlar (`lib/integrations.ts`), SQLite, Docker, `TRUST_PROXY`, npm ile `npx` başlatma.

1. **Formlar:** Admin panelinde form oluştur → `key` üretilir → endpoint `POST /f/<key>`.
2. **Gönderim kabulü:** `application/x-www-form-urlencoded`, `multipart/form-data` (dosyasız) ve JSON.
   - Özel alanlar: `_redirect`, `_subject`, `_replyto` (yoksa `email` alanı), `_gotcha` (honeypot).
   - HTML formu → `303` ile `_redirect`'e ya da kendi "Teşekkürler" sayfamıza. `Accept: application/json` → JSON.
   - CORS: izinli domainlere açık; `Origin`/`Referer` izinli listede değilse `403`.
   - Sınırlar: gövde boyutu, alan sayısı, alan uzunluğu (güven sınırı, kesilmez).
3. **Spam:** Skor = honeypot + IP rate limit + çok hızlı gönderim + link sayısı + blocklist (kelime/e-posta/IP).
   Her gönderimde tetiklenen sinyaller saklanır. Eşiği geçen **Spam** olarak saklanır: bildirim/webhook gitmez.
4. **Inbox:** Tablo (arama, Spam/Gelen filtresi), gönderim detayı (alanlar, sinyaller, teslim durumu),
   "Spam değil" / "Spam" / sil, CSV export.
5. **Teslim:** E-posta (çoklu alıcı, `reply-to` gönderen), webhook (HMAC imzası, tek yeniden deneme).
   Her teslim log'a yazılır; panelden "yeniden gönder".
6. **E-postadan spam işaretleme:** Bildirimde imzalı link → onay sayfası → tek tık (Formtorch gibi; link 7 gün).
7. **Kurulum ekranı:** HTML snippet'i, Astro/React örneği, AI aracı için hazır prompt, "test gönderimi yap"
   butonu ve gönderimin canlı düştüğünü gösteren kutu (Formserve gibi).

## 4. Sonraki sürümler

- Turnstile, auto-responder, dosya yükleme (yerel disk; S3 opsiyonel), saklama süresi (otomatik silme).
- Hazır Slack/Discord bildirimi (webhook üstüne küçük formatlayıcı).
- Basit kurallar: "alan = değer → şu alıcıya gönder", kaydetmeden önce örnek gönderimle deneme.
- REST API (`X-API-Key`): formlar ve gönderimler; gerekirse MCP.

## 5. Yapmayacaklarımız

- Görsel form builder ve embed script: form sitede kalır, ürün backend'dir (HeyForm/OpnForm başka iş).
- AI Reply, lead pipeline, faturalandırma/planlar, AB/ABD veri bölgesi seçimi (self-host'ta veri zaten sende).

## 6. WuppyCMS ile ilişki

- Paket: `@gitupcms/forms` (npm), repo: `gitupcms/gitupcms-forms`.
- Kod `src/plugins/forms/` altında; WuppyCMS `sync-plugins.mjs` içindeki `PLUGINS` listesine bir satır ekler.
- WuppyCMS'te form endpoint'i kullanıcının sitesine bağlanır; admin paneli Plugins → Forms altında.
- Ortak parçalar (SMTP, e-posta, şifreleme, Team) Comments'ten kopyalanır; ikisi aynı sunucuda çalışacaksa
  (aşağıdaki soru) tek uygulama olur.

## 7. Açık sorular

1. **Ayrı uygulama mı, aynı sunucu mu?** `gitupcms-forms` ayrı repo/sunucu mu olsun, yoksa tek Gitupcms sunucusu
   hem yorumları hem formları mı barındırsın? (Öneri: ayrı paket, ama ortak admin iskeleti; kullanıcı tek şey
   kurmak isterse ileride birleşik bir "gitupcms" paketi.)
2. Ad: "Gitupcms Forms" uygun mu?
3. Dosya yükleme v0.1'e girsin mi? (İletişim formlarının çoğu dosyasız; girerse disk/kota/virüs işi büyür.)
