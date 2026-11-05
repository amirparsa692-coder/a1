# تکناموز (Technamooz AI) v2.0.0

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/technamooz/technamooz-ai)

پلتفرم دستیار هوش مصنوعی حرفه‌ای روی **Cloudflare Workers** — بدون نیاز به خرید سرور، با استفاده از Workers KV + D1 + Workers AI.

**سازنده‌ی کلاینت، پلتفرم و API:** امیر پارسا (Amir Parsa)

---

## امکانات کلیدی

| بخش | توضیحات |
|-----|----------|
| **پلتפורم** | اجرا ۱۰۰٪ روی Cloudflare Workers (لبه**، رایگان، بدون سرور) |
| **ذخیره‌سازی** | Workers KV (کش، نرخ‌بندی، سشن، کدهای کوتاه‌عمر) + D1 (کاربران، مکالمات، حافظه، Personal assistantها، لاگ‌ها، تنظیمات) |
| **هوش مصنوعی** | Workers AI از طریق binding داخلی + ۱۲ ارائه‌دهنده远隔 از طریق fetch |
| **ارائه‌دهندگان** | Workers AI، OpenRouter، OrcaRouter، OneRouter، Gemini، Groq، Cerebras، SambaNova، Hugging Face، GitHub Models، Mistral، NVIDIA NIM، Cohere |
| **عوامل متخصص (Personas)** | ۲۱-factor专家: متخصص همه‌کاره، مترجم، معلم، رفیق، متفکر، تکنولوژی، برنامه‌نویس، نویسنده، کسب‌وکار، سلامت، حقوقی، آشپز، سفر، مالی، تناسب اندام، قصه‌گو، تحلیلگر داده، مربی انگلیسی، سئو، مشاور تحصیلی، مربی برنامه‌نویسی |
| **چت وب** | مدرن، ریسپانسیو، RTL کامل، تم تار/روشن، PWA قابل نصب، استریم زنده، Markdown، هایلایت کد، آپلود تصویر، ورودی صوتی |
| **ربات تلگرام** | Webhook با secret_token، دستورات /start، /help، /models، /persona، /newchat، /memory، /settings، /provider، /support، /about |
| **پنل مدیریت** | مسیر مجزا، لاگین مستقل، Setup Wizard، مدیریت کلیدها، nhân素های شخصی، بکاپ/بازیابی، لاگ‌ها، آمار |
| **امنیت** | PBKdf2 با Web Crypto، سشن HttpOnly+Secure+SameSite=Strict، CSRF، نرخ‌بندی ورود، هدرهای امنیتی (CSP، X-Frame-Options، HSTS) |

---

## نصب سریع (یک‌دستوری)

```bash
# کلون مخزن
git clone https://github.com/technamooz/technamooz-ai.git
cd technamooz-ai

# نصب وابستگی‌ها
npm install

# راه‌انداز یک‌دستوری (تعاملی)
npm run setup

# دیپلوی بعدی
npm run deploy
```

اسکریپت `npm run setup` به ترتیب:
۱. بررسی نصب بودن `wrangler` و لاگین شدن
۲. ساخت خودکار KV namespace و D1 database و نوشتن idها در `wrangler.toml`
۳. اجرای migrationهای D1
۴. پرسیدن و تنظیم رمز عبور پنل ادمین، ENCRYPTION_KEY (تولید خودکار)، توکن ربات تلگرام و کلیدهای ارائه‌دهنده‌ها
۵. دیپلوی Worker
۶. ثبت وبهوک تلگرام
۷. چاپ آدرس چت، پنل ادمین و مراحل بعدی

---

## راه‌اندازی دستی (گام‌به‌گام)

### ۱. پیکربندی wrangler

فایل `wrangler.toml` را باز کنید و مقادیر زیر را تنظیم کنید:

```toml
name = "technamooz-ai"
main = "src/index.js"
compatibility_date = "2026-11-04"

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = true

[ai]
binding = "AI"

[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_NAMESPACE_ID"

[[d1_databases]]
binding = "DB"
database_name = "technamooz_ai"
database_id = "YOUR_D1_DATABASE_ID"

[vars]
APP_VERSION = "2.0.0"
APP_NAME = "Technamooz AI"
APP_AUTHOR = "امیر پارسا"
```

### ۲. ایجاد KV و D1

```bash
npx wrangler kv namespace create KV
npx wrangler d1 create technamooz_ai
```

idهای تولید شده را در `wrangler.toml` جایگزین کنید.

### ۳. اعمال migrationها

```bash
npx wrangler d1 migrations apply technamooz_ai --local
npx wrangler d1 migrations apply technamooz_ai --remote
```

### ۴. تنظیم Secrets

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ENCRYPTION_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN   # اختیاری
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET  # اختیاری
```

### ۵. دیپلوی

```bash
npm run deploy
```

---

## دریافت کلید ارائه‌دهنده‌ها

هر ارائه‌دهنده را می‌توانید بدون کارت بانكية ثبت‌نام کنید:

| ارائه‌دهنده | لینک ثبت‌نام | لینک کلید | Free Tier | نیاز به تلفن |
|------------|-------------|-----------|-----------|-------------|
| Cloudflare Workers AI | dash.cloudflare.com | dash.cloudflare.com/profile/api-tokens | بله | خیر |
| OpenRouter | openrouter.ai | openrouter.ai/keys | بله (مدل‌های :free) | خیر |
| OrcaRouter | orcarouter.ai | orcarouter.ai | بله | خیر |
| OneRouter | infron.ai | infron.ai/dashboard/apiKeys | بله | خیر |
| Google Gemini | aistudio.google.com | aistudio.google.com/app/apikey | بله | خیر |
| Groq | console.groq.com | console.groq.com/keys | بله | خیر |
| Cerebras | cerebras.ai | cloud.cerebras.ai | بله | خیر |
| SambaNova | sambanova.ai | cloud.sambanova.ai | بله | خیر |
| Hugging Face | huggingface.co | huggingface.co/settings/tokens | بله | خیر |
| GitHub Models | github.com/marketplace/models | github.com/settings/tokens | بله | خیر |
| Mistral | mistral.ai | console.mistral.ai | بله | خیر |
| NVIDIA NIM | build.nvidia.com | build.nvidia.com | بله (آزمایشی) | خیر |
| Cohere | cohere.com | dashboard.cohere.com/api-keys | بله (آزمایشی) | خیر |

---

## ربات تلگرام

### تنظیم Webhook

در پنل مدیریت (`/admin` → بخش تلگرام):
۱. توکن ربات را از @BotFather بگیرید و ذخیره کنید
۲. secret وبهوک را تولید کنید
۳. دکمهٔ «ثبت وبهوک» را بزنید

آدرس وبهوک:
```
https://YOUR_WORKER.workers.dev/telegram/webhook/YOUR_SECRET
```

### دستورات ربات

| دستور | توضیحات |
|-------|----------|
| `/start` | پیام خوش‌آمدگویی و معرفی |
| `/help` | راهنمای کامل دستورات |
| `/models` | انتخاب پلتفرم و مدل |
| `/platforms` | لیست پلتفرم‌های فعال |
| `/persona` | انتخاب عامل متخصص |
| `/agents` | لیست عوامل متخصص |
| `/newchat` | شروع گفتگوی جدید |
| `/memory` | مشاهدهٔ حافظهٔ بلندمدت |
| `/settings` | تنظیمات فعلی |
| `/provider` | وضعیت ارائه‌دهندگان |
| `/support` | پشتیبانی و بازخورد |
| `/about` | دربارهٔ تکناموز |

---

## پنل مدیریت

مسیر: `https://YOUR_WORKER.workers.dev/admin`

**ورود اول:** `admin` / `admin` (رمز را در اولین ورود تغییر دهید)

بخش‌ها:
- داشبورد (آمار کاربر، پیام، مصرف، خطا)
- ارائه‌دهندگان و کلیدها (تست اتصال، maske، حذف)
- مدل‌ها (فهرست پویا + کش + دکمهٔ refresh)
- مدیریت Cloudflare (Workers AI، bindingها، وضعیت KV/D1)
- کاربران (وب و تلگرام، جدا از هم)
- شخصیت‌ها و Personal assistantها (ساخت، ویرایش، فعال/غیرفعال)
- ربات تلگرام (webhook، پیام همگانی، خوش‌آمد)
- تنظیمات سیستم (نام، لوگو، محدودیت‌ها، حالت نگه‌داری، feature flagها)
- لاگ‌ها (مشاهده، پاک‌سازی)
- بکاپ و بازیابی JSON
- Setup Wizard (در اولین ورود)

---

## معماری فنی

```
src/
├── index.js          # ورکر اصلی وrouter
├── auth.js           # احراز هویت، سشن، CSRF، رمزنگاری
├── chat.js           # هوش گفتگو، حافظه، خلاصه‌سازی، استخراج حقایق
├── config.js         #metadata، ارائه‌دهندگان، محدودیت‌ها
├── db.js             # لایه D1 (کاربران، مکالمات، حافظه، Personal assistantها، لاگ‌ها)
├── providers.js      #adapterهای ارائه‌دهنده، Router هوشمند، ارائه‌دهنده شخصی
├── routes/
│   ├── admin.js      # پنل مدیریت (Setup Wizard، بکاپ، بازیابی)
│   └── user.js       # APIهای عمومی چت (/health، /api/config، /api/models، /chat)
├── store.js          # لایه KV (تنظیمات، کلیدها، نرخ‌بندی، سشن)
├── telegram.js       # ربات تلگرام (Webhook، دستورات، Inline Keyboard)
└── tgapi.js          # ارسال پیام تلگرام، Webhook، splitText
```

لایه storing:
- **KV:** کش مدل‌ها، نرخ‌بندی خفیف، سشن‌ها، کدهای اتصال تلگرام، تنظیمات، feature flagها
- **D1:** کاربران، مکالمات، حقایق، Personal assistantها، ارائه‌دهندگان شخصی، لاگ‌ها، آمار

---

## متغیرهای محیطی (.dev.vars.example)

```bash
# رمز عبور پنل ادمین (فقط برای توسعه، در تولید از wrangler secret استفاده شود)
ADMIN_PASSWORD=admin

# کلید رمزنگاری AES-GCM (تولید خودکار در setup)
ENCRYPTION_KEY=your-32-byte-hex-key

# توکن ربات تلگرام (اختیاری)
TELEGRAM_BOT_TOKEN=your-bot-token

# Secret وبهوک تلگرام (اختیاری)
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# کلیدهای ارائه‌دهنده (اختیاری)
OPENROUTER_API_KEY=sk-or-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...

# حساب Cloudflare (برای Workers AI از طریق REST)
CF_ACCOUNT_ID=your-account-id
CF_API_TOKEN=your-api-token
```

---

## Social و پشتیبانی

| شبکه | شناسه | لینک |
|-------|-------|------|
| تلگرام | @technamooz | https://t.me/technamooz |
| پشتیبانی | @technamooz_support | https://t.me/technamooz_support |
| اینستاگرام | @technamooz | https://instagram.com/technamooz |
| یوتیوب | @technamooz | https://youtube.com/@technamooz |
| گیت‌هاب | @technamooz | https://github.com/technamooz |
| توییتر (X) | @technamooz | https://x.com/technamooz |

پشتیبانی تلگرام / ارتباط با ادمین: **@technamooz_support**

---

## لایسنس

MIT — ساختهٔ امیر پارسا (Amir Parsa) برای تکناموز (Technamooz AI)

---

## نسخه‌ی Actuelle

**2.0.0** — `technamooz-ai-version2.0.0`

##经常 pyruvate سوالات (FAQ)

**س: آیا نیاز به کارت بانكية برای ارائه‌دهنده‌ها دارم؟**
ج: خیر. همه ارائه‌دهنده‌های پیش‌فرض بدون کارت بانكية ثبت‌نام می‌شوند. فقط OneRouter و OrcaRouter نیاز به بررسی است.

**س: آیا چت و تلگرام هم‌زمان کار می‌کنند؟**
ج: بله. هر دو با داده‌های جدا از هم (เว็บ و تلگرام) work می‌کنند.

**س: آیا می‌توانم ارائه‌دهنده شخصی اضافه کنم؟**
ج: بله. هر کاربر می‌تواند Base URL و کلید شخصی خود را اضافه کند (OpenAI-compatible، AES-GCM رمز شده).

**س: آیا پروژه PWA است؟**
ج: بله. می‌توانید آن را روی دستگاه خود نصب کنید و آفلاین استفاده کنید.

**س: چگونه به‌روزرسانی کنم؟**
ج: `git pull && npm run deploy`

---

ساخته شده با ❤️ توسط امیر پارسا برای تکناموز (Technamooz AI)
