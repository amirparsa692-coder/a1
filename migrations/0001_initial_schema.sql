-- 0001_initial_schema.sql
-- Technamooz AI v2.0.0 — D1 initial schema
-- Author: Amir Parsa (امیر پارسا)

-- Users (web + telegram, isolated by source)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('web','tg')),
  name TEXT,
  username TEXT,
  platform TEXT DEFAULT 'workersai',
  model TEXT,
  persona TEXT DEFAULT 'general',
  deep INTEGER DEFAULT 0,
  banned INTEGER DEFAULT 0,
  msgs INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  UNIQUE(source, id)
);

CREATE INDEX IF NOT EXISTS idx_users_source ON users(source);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen);

-- Conversations / chat rounds
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  q TEXT NOT NULL,
  a TEXT NOT NULL,
  persona TEXT DEFAULT 'general',
  platform TEXT DEFAULT 'workersai',
  model TEXT,
  deep INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_source, user_id) REFERENCES users(source, id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_source, user_id, created_at);

-- Long-term memory (summary + facts) per user
CREATE TABLE IF NOT EXISTS memory (
  user_source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  summary TEXT DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_source, user_id),
  FOREIGN KEY (user_source, user_id) REFERENCES users(source, id)
);

-- Extracted facts per user
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_source, user_id) REFERENCES users(source, id)
);

CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_source, user_id);

-- Assistant personas (built-in + custom)
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT,
  tagline TEXT,
  role TEXT,
  temperature REAL DEFAULT 0.7,
  system_prompt TEXT NOT NULL,
  expertise TEXT DEFAULT '[]',
  workflow TEXT DEFAULT '[]',
  checklist TEXT DEFAULT '[]',
  style TEXT,
  recommended TEXT DEFAULT '{}',
  is_custom INTEGER DEFAULT 0,
  is_enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Personal assistants per user
CREATE TABLE IF NOT EXISTS assistants (
  id TEXT PRIMARY KEY,
  user_source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar TEXT,
  instructions TEXT NOT NULL,
  model TEXT DEFAULT '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  temperature REAL DEFAULT 0.7,
  knowledge TEXT DEFAULT '[]',
  is_shared INTEGER DEFAULT 0,
  share_token TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_source, user_id) REFERENCES users(source, id)
);

CREATE INDEX IF NOT EXISTS idx_assistants_user ON assistants(user_source, user_id);

-- Provider credentials (per-platform global keys)
CREATE TABLE IF NOT EXISTS provider_credentials (
  platform TEXT PRIMARY KEY,
  key_enc TEXT,
  key_mask TEXT,
  base_url TEXT,
  updated_at INTEGER NOT NULL
);

-- Custom providers per user (AES-GCM encrypted keys)
CREATE TABLE IF NOT EXISTS custom_providers (
  id TEXT PRIMARY KEY,
  user_source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  key_enc TEXT NOT NULL,
  custom_headers TEXT DEFAULT '{}',
  default_model TEXT,
  is_enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_source, user_id) REFERENCES users(source, id)
);

CREATE INDEX IF NOT EXISTS idx_custom_providers_user ON custom_providers(user_source, user_id);

-- Cloudflare account (Workers AI REST fallback)
CREATE TABLE IF NOT EXISTS cloudflare_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_id TEXT,
  token_enc TEXT,
  updated_at INTEGER NOT NULL
);

-- Telegram bot config
CREATE TABLE IF NOT EXISTS telegram_bot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token_enc TEXT,
  username TEXT,
  secret TEXT,
  webhook_url TEXT,
  commands_set INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Telegram admins
CREATE TABLE IF NOT EXISTS telegram_admins (
  chat_id INTEGER PRIMARY KEY,
  added_at INTEGER NOT NULL
);

-- System settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Admin credentials
CREATE TABLE IF NOT EXISTS admin_creds (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  salt TEXT NOT NULL,
  iter INTEGER NOT NULL,
  hash TEXT NOT NULL,
  epoch INTEGER DEFAULT 0,
  must_change INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Admin sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  csrf TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Logs
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  msg TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);

-- Daily stats
CREATE TABLE IF NOT EXISTS stats (
  date TEXT PRIMARY KEY,
  web_msgs INTEGER DEFAULT 0,
  tg_msgs INTEGER DEFAULT 0,
  feedbacks INTEGER DEFAULT 0,
  broadcasts INTEGER DEFAULT 0
);

-- KV-backed short tokens (telegram connect codes, etc.) live in KV, not D1.

-- Seed built-in personas (idempotent via INSERT OR IGNORE)
INSERT OR IGNORE INTO personas (id, name, emoji, tagline, role, temperature, system_prompt, expertise, workflow, checklist, style, recommended, is_custom, is_enabled, created_at, updated_at) VALUES
('general','متخصص همه‌کاره','🧠','عاملی چندرشته‌ای با استاندارد مشاور برجسته','متخصص همه‌کارهٔ چندرشته‌ای',0.7,'[]','[]','[]','پاسخ کاربردی، گرم و مستقیم؛ ساختار فشرده با بولت و تیتر کوتاه.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('translator','مترجم حرفه‌ای','🌍','ترجمهٔ وفادار، طبیعی و آگاه','مترجم فوق‌حرفه‌ای چندزبانه',0.2,'[]','[]','[]','خروجی خالیس ترجمه با حفظ ساختار؛ Notes فقط دیده‌شدنی و کوتاه.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('teacher','معلم خصوصی','🎓','هر مبحث را مثل یک استاد واقعی، قدم‌به‌قدم یاد بده','معلم خصوصی فوق‌حرفه‌ای',0.65,'[]','[]','[]','ساختار تدریس هفت‌گانه با تشبیه، تشویق کوتاه واقعی و بدون اغراق.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('friend','رفیق صمیمی','🫶','یک رفیق واقعی برای گپ، همدلی و حرف دل','رفیق صمیمی و همدل',0.9,'[]','[]','[]','جمله‌های کوتاه سرپا، ایموجی کم اما هدفمند؛ تیتر و جدول در حالت گپ ممنوع.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('thinker','ابرمتفکر','🧬','عمیق‌ترین تحلیل‌ها، مقاله‌های بلند و حل مسائل پیچیده','ابرمتفکر و حل‌کنندهٔ مسائل پیچیده',0.6,'[]','[]','[]','پاسخ بلند، ساختارمند، بدون خلاصه‌سازی فوری؛ تیتر H2/H3 و شماره‌گذاری.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('tech','متخصص تکنولوژی','💻','کامپیوتر، شبکه، امنیت و هرچه سایبر','متخصص فناوری و سیستم',0.45,'[]','[]','[]','فنی، دقیق و اسپارتن؛ کد در بلوک، بولت‌های دستورالعملی و نکتهٔ فنی کوتاه.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('programmer','برنامه‌نویس ارشد','⌨️','کد production-grade با معماری درست، تست و مدیریت خطا','مهندس نرم‌افزار ارشد',0.35,'[]','[]','[]','ساختارمند: تحلیل مختصر → بلوک‌های کد → تست و اجرا؛ بدون حاشیه.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('writer','نویسنده حرفه‌ای','✍️','مقاله، کپی‌رایتینگ، کپشن و ایمیل','نویسنده و استراتژیست محتوا',0.85,'[]','[]','[]','ریتم متنوع، تصویرسازی عینی، پایان تأثیرگذار؛ لحن متناسب با برند/کانال.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('business','مشاور کسب‌وکار','📈','استراتژی، بازاریابی، فروش و مسیر رشد واقع‌بینانه','مشاور کسب‌وکار و بازاریابی',0.65,'[]','[]','[]','ساختارمند و اجراپذیر؛ مثال واقعی بازار، جدول مقایسه و شاخص روشن.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('health','مشاور سلامت','🩺','آموزش، پیشگیری و تصمیم آگاهانه','مشاور سلامت عمومی',0.4,'[]','[]','[]','دقیق، متوازن و انسانی؛ فارسی ساده، بدون ترساندن.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('lawyer','مشاور حقوقی','⚖️','تبیین حقوقی شفاف، تحلیل قرارداد و مسیر پیگیری','مشاور حقوقی عمومی',0.35,'[]','[]','[]','دقیق، سنجیده و بدون هیاهو؛ فارسی رسمی آرام؛ مطالب فنی با توضیح ساده.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('chef','سرآشپز حرفه‌ای','👨‍🍳','دستور دقیق، تکنیک آشپزی و طعم‌های راستین','سرآشپز حرفه‌ای',0.7,'[]','[]','[]','دستور شماره‌دار با توضیح کوتاه هر گام؛ لحن گرم آشپزخانه‌ای.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('travel','مشاور سفر','🧭','برنامهٔ سفر دقیق، بودجه و تجربه‌های محلی','مشاور سفر حرفه‌ای',0.65,'[]','[]','[]','برنامه ساخت‌یافته، بولت‌های مختصر و مسیر واقعی؛ بدون تعریف اضافی.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('finance','مشاور مالی','💰','بودجه، پس‌انداز، سرمایه‌گذاری و تصمیم مالی آگاهانه','مشاور مالی شخصی',0.4,'[]','[]','[]','مبنی بر عدد، با جدول؛ لحن آرام و راه‌گشا.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('fitness','مربی تناسب اندام','🏋️','برنامهٔ تمرین و تغذیهٔ واقع‌بینانه، ایمن و پایدار','مربی حرفه‌ای تناسب اندام',0.55,'[]','[]','[]','لحن انگیزشی ولی واقع‌بین؛ جدول هفتگی و توضیح فرم هر حرکت.','{}',0,1,strftime('%s','now'),strftime('%s','now')),
('storyteller','قصه‌گو و خلاقیت','🎭','داستان، ایدهٔ خلاق، سناریو و جهان‌سازی','قصه‌گو و طراح خلاق',0.95,'[]','[]','[]','روایت ملموس با زیرمتن؛ ریتم متنوع جمله‌ها، کوتاه و سنگین.','{}',0,1,strftime('%s','now'),strftime('%s','now'));

-- Default settings
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
('site_title','Technamooz AI | تکناموز',strftime('%s','now')),
('announcement','',strftime('%s','now')),
('default_platform','workersai',strftime('%s','now')),
('default_persona','general',strftime('%s','now')),
('max_tokens_normal','4096',strftime('%s','now')),
('max_tokens_deep','12288',strftime('%s','now')),
('rounds_cap','24',strftime('%s','now')),
('memory_enabled','1',strftime('%s','now')),
('facts_enabled','1',strftime('%s','now')),
('fallback_enabled','1',strftime('%s','now')),
('maintenance','0',strftime('%s','now')),
('extra_instructions','',strftime('%s','now')),
('feedback_prompt','پیام شما برای تیم تکناموز ثبت شد ❤️',strftime('%s','now')),
('admin_path','/admin',strftime('%s','now'));
