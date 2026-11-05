# Changelog — تکناموز (Technamooz AI)

## [2.0.0] — technamooz-ai-version2.0.0 (۲۰۲۶-۱۱-۰۴)

### اضافه‌شده
- **۱۳ ارائه‌دهنده هوش مصنوعی:** Cloudflare Workers AI، OpenRouter، OrcaRouter، OneRouter، Google AI Studio (Gemini)، Groq، Cerebras، SambaNova، Hugging Face Inference، GitHub Models، Mistral AI، NVIDIA NIM، Cohere
- **لایه D1:** دیتابیس ساختـured برای کاربران، مکالمات، حقایق، Personal assistantها، ارائه‌دهندگان شخصی، لاگ‌ها و آمار (فایل migration شماره‌گذاری‌شده در `migrations/`)
- **اسکریپت راه‌انداز یک‌دستوری:** `scripts/setup.mjs` — ساخت KV+D1، migration، секрет‌ها، دیپلوی، ثبت وبهوک تلگرام
- **Offer provider شخصی (Custom Provider):** Base URL + کلید + هدرهای سفارشی، رمزنگاری AES-GCM (Web Crypto)، محدودیت SSRF، تست اتصال
- **Smart Router / Auto Mode:** انتخاب خودکار بهترین مدل بر اساس نوع سؤال (کد، ترجمه، استدلال، گفتگوی ساده)
- **Self-refine:** بازنویسی پیش‌نویس برای کیفیت بالاتر (حالت «کیفیت بالا»)
- **Multi-Model Compare:** ارسال سوال به ۲ تا ۳ مدل و نمایش کنار هم
- **Setup Wizard:** پنل مدیریت در اولین ورود — تغییر رمز، افزودن کلید، تست اتصال، ثبت وبهوک
- **Health Check جامع:** `/api/health` و `/admin/api/health` — وضعیت KV، D1، AI، ارائه‌دهندگان
- **PWA:** manifest.json، service-worker، نصب قابل نصب روی دستگاه
- **ورودی صوتی:** Web Speech API برای چت وب
- **آپلود تصویر:** برای مدل‌های vision در چت وب
- **۲۱ عامل متخصص (Persona):** اضافه‌شده تحلیلگر داده، مربی انگلیسی، سئو، مشاور تحصیلی، مربی برنامه‌نویسی
- **دستورات تلگرام جدید:** /platforms، /agents، /newchat، /provider
- **نسخه ۲٫۰٫۰** در چت، پنل مدیریت، package.json و wrangler

### اصلاح‌شده
- **wrangler.toml:** اضافه شدن D1 binding، AI binding، run_worker_first=true، متغیرهای به‌روز
- **store.js:** استفاده صحیح از `env.KV` برای عملیات KV (نه `env.DB` که D1 است)
- **SSE Parser:** اصلاح bug در `partialPrefixLen` که باعث از دست رفتن segmented think tagها می‌شد
- **system prompts:** rewritten با لایه‌هایعامل (BASE_POLICY، AGENT_ENGINE، answerContract) برای پاسخ‌های سطح उत्पाद
- **نمایش نسخه:** v1.0.0 → v2.0.0 در چت، فوتر، پنل مدیریت

### حذف‌شده
- هیچto none

### bekannte مشکلات / نیاز به اقدام دستی
- D1 database باید از طریق `wrangler d1 create` ساخته شود (یا از طریق `npm run setup`)
- کلیدهای ارائه‌دهنده باید در پنل ادمین یا از طریق `wrangler secret put` ذخیره شوند
- وبهوک تلگرام باید از پنل ادمین ثبت شود (یا دستی از طریق curl)
- Logo فایل در `assets/logo/` هنوز وجود ندارد؛ جایگاه در UI آماده است

## [1.0.0] — نسخه‌ی اولیه (قبل از 2.0.0)

- ۴ ارائه‌دهنده (Workers AI، OpenRouter، OrcaRouter، OneRouter)
- ۱۶ عامل متخصص
- چت وب و ربات تلگرام پایه
- پنل مدیریت پایه
- workers KV برای همه داده‌ها (بدون D1)
