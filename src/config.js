// ============================================================
//  Technamooz AI — technamooz-ai-version2.0.0
//  Author: Amir Parsa (امیر پارسا)
//  src/config.js — application metadata, providers, defaults, limits
// ============================================================

export const APP = {
  name: 'Technamooz AI',
  faName: 'تکناموز',
  package: 'technamooz-ai-version2.0.0',
  version: '2.0.0',
  author: 'امیر پارسا',
  authorEn: 'Amir Parsa',
  tagline: 'دستیار هوش مصنوعی حرفه‌ای تکناموز',
  description: 'پلتفرم چت هوش مصنوعی، ربات تلگرام و پنل مدیریت روی Cloudflare Workers',
  defaultAdminUser: 'admin',
  defaultAdminPass: 'admin',
  supportTelegram: 'https://t.me/technamooz_support',
  supportHandle: '@technamooz_support',
  website: 'https://technamooz.ai',
  social: [
    { nameFa: 'تلگرام', handle: '@technamooz', url: 'https://t.me/technamooz', icon: '✈️' },
    { nameFa: 'اینستاگرام', handle: '@technamooz', url: 'https://instagram.com/technamooz', icon: '📸' },
    { nameFa: 'یوتیوب', handle: '@technamooz', url: 'https://youtube.com/@technamooz', icon: '▶️' },
    { nameFa: 'گیت‌هاب', handle: '@technamooz', url: 'https://github.com/technamooz', icon: '🐙' },
    { nameFa: 'توییتر (X)', handle: '@technamooz', url: 'https://x.com/technamooz', icon: '🐦' }
  ]
};

export const KV_KEYS = {
  settings: 'settings:global',
  creds: 'creds:admin',
  tgBot: 'tg:bot',
  tgAdmins: 'tg:admins',
  logs: 'logs:recent',
  modelCache: (platform) => 'cache:models:v2:' + platform,
  providerKey: (platform) => 'keys:provider:' + platform,
  cfAccount: 'keys:cloudflare',
  rateLimit: (bucket) => 'rl:' + String(bucket).slice(0, 120),
  session: (token) => 'sess:' + token,
  connectCode: (code) => 'tg:connect:' + code,
  keyCooldown: (platform) => 'cooldown:key:' + platform,
  health: 'health:status',
  featureFlag: (flag) => 'flag:' + flag
};

export const PLATFORMS = {
  workersai: {
    id: 'workersai',
    label: 'Cloudflare Workers AI',
    faLabel: 'کلادفلر (Workers AI)',
    icon: '☁️',
    color: '#f48120',
    desc: 'رایگان و سریع روی لبهٔ کلادفلر — بدون نیاز به کلید بیرونی',
    free: true,
    requiresKey: false,
    baseUrl: null,
    docs: 'https://developers.cloudflare.com/workers-ai/',
    keysUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    supportsReasoning: true,
    supportsVision: false
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    faLabel: 'OpenRouter',
    icon: '🌐',
    color: '#7c5cff',
    desc: 'صدها مدل از همهٔ شرکت‌ها؛ ده‌ها مدل رایگان با یک کلید',
    free: true,
    requiresKey: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    keyPrefix: 'sk-or-',
    docs: 'https://openrouter.ai/docs/quickstart',
    keysUrl: 'https://openrouter.ai/keys',
    defaultModel: 'openrouter/free',
    supportsReasoning: true,
    supportsVision: true
  },
  orcarouter: {
    id: 'orcarouter',
    label: 'OrcaRouter',
    faLabel: 'OrcaRouter',
    icon: '🐋',
    color: '#22d3ee',
    desc: 'روتر چندمدلی با مدل‌های رایگان و ۲۰۰+ مدل دیگر',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.orcarouter.ai/v1',
    keyPrefix: 'sk-orca-',
    docs: 'https://docs.orcarouter.ai/introduction',
    keysUrl: 'https://www.orcarouter.ai',
    defaultModel: 'orcarouter/free',
    supportsReasoning: true,
    supportsVision: false
  },
  onerouter: {
    id: 'onerouter',
    label: 'OneRouter',
    faLabel: 'OneRouter',
    icon: '🧭',
    color: '#34d399',
    desc: 'درگاه سازگار با OpenAI برای چند سرویس‌دهنده (قابل تنظیم)',
    free: true,
    requiresKey: true,
    baseUrl: 'https://llm.onerouter.pro/v1',
    keyPrefix: '',
    allowBaseUrl: true,
    docs: 'https://infron.ai/docs',
    keysUrl: 'https://infron.ai/dashboard/apiKeys',
    defaultModel: 'deepseek/deepseek-v4.1-flash:free',
    supportsReasoning: false,
    supportsVision: true
  },
  gemini: {
    id: 'gemini',
    label: 'Google AI Studio (Gemini)',
    faLabel: 'گوگل AI استودیو (Gemini)',
    icon: '💎',
    color: '#4285f4',
    desc: 'مدل‌های Gemini از گوگل — ثبت‌نام فقط با اکانت گوگل، بدون کارت',
    free: true,
    requiresKey: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyPrefix: '',
    docs: 'https://ai.google.dev/',
    keysUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-1.5-flash',
    supportsReasoning: false,
    supportsVision: true,
    apiStyle: 'gemini'
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    faLabel: 'Groq',
    icon: '⚡',
    color: '#f86363',
    desc: 'استنتاج بسیار سریع (LPU) — مدل‌های رایگان بدون کارت',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.groq.com/openai/v1',
    keyPrefix: 'gsk_',
    docs: 'https://console.groq.com/docs',
    keysUrl: 'https://console.groq.com/keys',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsReasoning: false,
    supportsVision: false
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    faLabel: 'Cerebras',
    icon: '🧠',
    color: '#003478',
    desc: 'استنتاج با سرعت بالا روی bouleverser — رایگان برای توسعه‌دهندگان',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.cerebras.ai/v1',
    keyPrefix: '',
    docs: 'https://docs.cerebras.ai/',
    keysUrl: 'https://cloud.cerebras.ai/',
    defaultModel: 'llama-3.3-70b',
    supportsReasoning: false,
    supportsVision: false
  },
  sambanova: {
    id: 'sambanova',
    label: 'SambaNova',
    faLabel: 'SambaNova',
    icon: '🟣',
    color: '#6c2ea0',
    desc: 'استنتاج سریع با چپ‌_streaming — مدل‌های رایگان',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.sambanova.ai/v1',
    keyPrefix: '',
    docs: 'https://docs.sambanova.ai/',
    keysUrl: 'https://cloud.sambanova.ai/',
    defaultModel: 'Meta-Llama-3.3-70B-Instruct',
    supportsReasoning: false,
    supportsVision: false
  },
  huggingface: {
    id: 'huggingface',
    label: 'Hugging Face Inference',
    faLabel: 'هگینگ فیس استنتاج',
    icon: '🤗',
    color: '#ffd21e',
    desc: 'هزاران مدل분Spike بر روی HF — کلید رایگان HuggingFace',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api-inference.huggingface.co',
    keyPrefix: 'hf_',
    docs: 'https://huggingface.co/docs/inference-api',
    keysUrl: 'https://huggingface.co/settings/tokens',
    defaultModel: 'meta-llama/Meta-Llama-3.3-70B-Instruct',
    supportsReasoning: false,
    supportsVision: false,
    apiStyle: 'huggingface'
  },
  github: {
    id: 'github',
    label: 'GitHub Models',
    faLabel: 'گیت‌هاب مدل‌ها',
    icon: '🐙',
    color: '#24292f',
    desc: 'مدل‌های رایگان برای کاربران گیت‌هاب — بدون کارت',
    free: true,
    requiresKey: true,
    baseUrl: 'https://models.inference.ai.azure.com',
    keyPrefix: 'ghp_',
    docs: 'https://github.com/marketplace/models',
    keysUrl: 'https://github.com/settings/tokens',
    defaultModel: 'openai/gpt-4o-mini',
    supportsReasoning: false,
    supportsVision: false
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    faLabel: 'میstral',
    icon: '🌪',
    color: '#f4331e',
    desc: 'مدل‌های francés هوشمند — سطح رایگان موجود',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.mistral.ai/v1',
    keyPrefix: '',
    docs: 'https://docs.mistral.ai/',
    keysUrl: 'https://console.mistral.ai/',
    defaultModel: 'open-mistral-7b',
    supportsReasoning: false,
    supportsVision: false
  },
  nvidia: {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    faLabel: 'NVIDIA NIM',
    icon: '🟢',
    color: '#76b900',
    desc: 'استنتاج نوری‌ozem روی GPUهای NVIDIA — نسخهٔ آزمایشی رایگان',
    free: true,
    requiresKey: true,
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    keyPrefix: 'nvapi-',
    docs: 'https://docs.nvidia.com/nim/',
    keysUrl: 'https://build.nvidia.com/',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    supportsReasoning: false,
    supportsVision: false
  },
  cohere: {
    id: 'cohere',
    label: 'Cohere',
    faLabel: 'Cohere',
    icon: '🔗',
    color: '#bf42f4',
    desc: 'مدل‌های(command/rerank) — نسخهٔ آزمایشی رایگان',
    free: true,
    requiresKey: true,
    baseUrl: 'https://api.cohere.ai/v1',
    keyPrefix: '',
    docs: 'https://docs.cohere.com/',
    keysUrl: 'https://dashboard.cohere.com/api-keys',
    defaultModel: 'command-r',
    supportsReasoning: false,
    supportsVision: false,
    apiStyle: 'cohere'
  }
};

export const PLATFORM_ORDER = [
  'workersai', 'openrouter', 'orcarouter', 'onerouter',
  'gemini', 'groq', 'cerebras', 'sambanova',
  'huggingface', 'github', 'mistral', 'nvidia', 'cohere'
];

export const DEFAULT_SETTINGS = {
  siteTitle: 'Technamooz AI | تکناموز',
  announcement: '',
  defaultPlatform: 'workersai',
  defaultModel: {
    workersai: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    openrouter: 'openrouter/free',
    orcarouter: 'orcarouter/free',
    onerouter: 'deepseek/deepseek-v4.1-flash:free',
    gemini: 'gemini-1.5-flash',
    groq: 'llama-3.3-70b-versatile',
    cerebras: 'llama-3.3-70b',
    sambanova: 'Meta-Llama-3.3-70B-Instruct',
    huggingface: 'meta-llama/Meta-Llama-3.3-70B-Instruct',
    github: 'openai/gpt-4o-mini',
    mistral: 'open-mistral-7b',
    nvidia: 'meta/llama-3.3-70b-instruct',
    cohere: 'command-r'
  },
  defaultPersona: 'general',
  maxTokensNormal: 4096,
  maxTokensDeep: 12288,
  roundsCap: 24,
  memoryEnabled: true,
  factsEnabled: true,
  fallbackEnabled: true,
  maintenance: false,
  extraInstructions: '',
  feedbackPrompt: 'پیام شما برای تیم تکناموز ثبت شد ❤️',
  smartRouterEnabled: true,
  multiModelCompare: false,
  selfRefineEnabled: false
};

export const LIMITS = {
  messageMaxChars: 24000,
  chatRateLimit: 35,
  chatRateWindowSec: 600,
  loginTries: 6,
  loginWindowSec: 900,
  sessionTtlSec: 43200,
  deepTokensLimit: 32768,
  factsCap: 16,
  contextCharsNormal: 36000,
  contextCharsDeep: 90000,
  maxModelsReturn: 650,
  adminPageSize: 20,
  broadcastBatch: 10,
  passwordMin: 12,
  passwordMax: 72,
  pbkdf2Iterations: 2500,
  pbkdf2MaxIterations: 100000,
  maxCustomProvidersPerUser: 5,
  assistantKnowledgeMaxChars: 8000,
  multiModelMaxModels: 3,
  selfRefineMaxSteps: 3
};

export function platformList() {
  return PLATFORM_ORDER.map((id) => {
    const p = PLATFORMS[id];
    return {
      id: p.id,
      label: p.label,
      faLabel: p.faLabel,
      icon: p.icon,
      color: p.color,
      desc: p.desc,
      free: p.free,
      requiresKey: p.requiresKey,
      docs: p.docs,
      keysUrl: p.keysUrl,
      defaultModel: p.defaultModel,
      allowBaseUrl: !!p.allowBaseUrl,
      supportsReasoning: !!p.supportsReasoning,
      supportsVision: !!p.supportsVision,
      apiStyle: p.apiStyle || 'openai'
    };
  });
}

export function isPlatformReady(platform) {
  return !!PLATFORMS[platform];
}

export function getDefaultModel(platform) {
  const p = PLATFORMS[platform];
  return p ? p.defaultModel : null;
}
