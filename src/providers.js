// ============================================================
//  Technamooz AI — technamooz-ai-version2.0.0
//  Author: Amir Parsa (امیر پارسا)
//  src/providers.js — provider adapters (OpenAI-compatible + Workers AI + others)
//
//  Providers:
//   • workersai   → Cloudflare Workers AI ([ai] binding or REST)
//   • openrouter  → https://openrouter.ai/api/v1
//   • orcarouter  → https://api.orcarouter.ai/v1
//   • onerouter   → configurable OpenAI-compatible gateway
//   • gemini      → Google AI Studio (Gemini REST)
//   • groq        → Groq (OpenAI-compatible)
//   • cerebras    → Cerebras (OpenAI-compatible)
//   • sambanova   → SambaNova (OpenAI-compatible)
//   • huggingface → Hugging Face Inference API
//   • github      → GitHub Models (OpenAI-compatible)
//   • mistral     → Mistral AI (OpenAI-compatible)
//   • nvidia      → NVIDIA NIM (OpenAI-compatible)
//   • cohere      → Cohere (generate API)
//   • custom      → user-defined OpenAI-compatible (AES-GCM encrypted key)
//
//  All remote providers are called with streaming enabled and normalized
//  into one tiny internal protocol: one JSON frame per line:
//      {"type":"delta","v":"..."}
//      {"type":"reasoning","v":"..."}
//      {"type":"error","msg":"..."}
// ============================================================

import { APP, LIMITS, PLATFORMS, PLATFORM_ORDER } from './config.js';
import { CF_CURATED_MODELS, ONEROUTER_CURATED_MODELS } from './personas.js';
import { getSettings } from './db.js';
import { maskKey, log, rateLimit,
  getCfAccount, getProviderKey,
  getProviderCredentials, setProviderKey, setCfAccount, deleteProviderCreds
} from './store.js';
import { hasD1, dbExec, dbOne, dbAll } from './db.js';

const CHAT_TIMEOUT_MS = 120000;
const MODELS_TIMEOUT_MS = 25000;
const MODEL_CACHE_TTL_MS = 6 * 3600 * 1000;
const THINK_OPEN = '\x3Cthink\x3E';
const THINK_CLOSE = '\x3C/think\x3E';
const AES_ALG = 'AES-GCM';

function partialPrefixLen(text, tag) {
  const maxK = Math.min(tag.length - 1, text.length);
  for (let k = maxK; k >= 1; k--) {
    if (text.endsWith(tag.slice(0, k))) return k;
  }
  return 0;
}

/* ============================ errors ============================ */

export class ProviderError extends Error {
  constructor(message, { provider = null, status = 0, detail = '' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.detail = detail;
  }
}

export function describeProviderError(error) {
  const e = error || {};
  const platform = e.provider ? (PLATFORMS[e.provider] ? PLATFORMS[e.provider].faLabel : e.provider) : 'سرویس‌دهنده';
  const status = Number(e.status) || 0;
  const detail = String(e.detail || e.message || '').slice(0, 260);
  let hint = '';

  if (status === 401) hint = 'کلید API نامعتبر است. در پنل ادمین کلید را بررسی یا تعویض کنید.';
  else if (status === 402) hint = 'اعتبار حساب کافی نیست. یک مدل رایگان انتخاب کنید یا اعتبار حساب را افزایش دهید.';
  else if (status === 403) hint = 'دسترسی به این مدل/حساب مجاز نیست. مدل یا مجوز کلید را بررسی کنید.';
  else if (status === 404) hint = 'مدل یا مسیر API پیدا نشد. یک مدل دیگر از لیست انتخاب کنید.';
  else if (status === 429) hint = 'سقف درخواست‌ها پر شده است. کمی بعد دوباره امتحان کنید یا مدل رایگان دیگری انتخاب کنید.';
  else if (status >= 500) hint = 'سرویس‌دهنده موقتاً در دسترس نیست. چند لحظه بعد دوباره تلاش کنید یا مدل دیگری انتخاب کنید.';
  else if (/fetch|network|timeout|abort|connect/i.test(detail)) hint = 'اتصال به سرویس‌دهنده برقرار نشد. اتصال اینترنت Worker و تنظیمات کلید را بررسی کنید.';

  return '⚠️ خطا از ' + platform + (status ? ' (' + status + ')' : '') + ': ' +
    (detail || 'پاسخی دریافت نشد.') + (hint ? '\n\n💡 ' + hint : '');
}

/* ============================ encryption (AES-GCM) ============================ */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function subtleKeyFromPassword(password) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode('technamooz-ai-v2'), iterations: 100000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export async function encryptValue(plaintext, secret) {
  const key = await subtleKeyFromPassword(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptValue(ciphertextB64, secret) {
  const key = await subtleKeyFromPassword(secret);
  const combined = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return decoder.decode(pt);
}

function encryptionSecret(env) {
  return env.ENCRYPTION_KEY || 'technamooz-default-change-me';
}

/* ============================ readiness ============================ */

export async function providerStatus(env, { includeMask = false } = {}) {
  const cf = await getCfAccount(env);
  const out = {};

  for (const id of PLATFORM_ORDER) {
    const p = PLATFORMS[id];
    if (id === 'workersai') {
      const mode = env.AI ? 'binding' : (cf && cf.accountId && cf.token ? 'rest' : 'none');
      out[id] = {
        ready: mode !== 'none',
        label: p.faLabel,
        icon: p.icon,
        free: true,
        mode,
        modelsPublic: true,
        docs: p.docs,
        baseUrl: null,
        keyMask: includeMask && cf && cf.token ? maskKey(cf.token) : null,
        supportsReasoning: !!p.supportsReasoning,
        supportsVision: !!p.supportsVision
      };
      continue;
    }
    let key = null;
    try { key = await getProviderKey(env, id); } catch { key = null; }
    const baseUrl = p.baseUrl || null;
    out[id] = {
      ready: !!key,
      label: p.faLabel,
      icon: p.icon,
      free: p.free,
      mode: key ? 'key' : 'none',
      modelsPublic: id !== 'onerouter' && id !== 'custom',
      docs: p.docs,
      keysUrl: p.keysUrl,
      baseUrl,
      keyMask: includeMask && key ? maskKey(key) : null,
      supportsReasoning: !!p.supportsReasoning,
      supportsVision: !!p.supportsVision,
      apiStyle: p.apiStyle || 'openai'
    };
  }
  return out;
}

export async function isPlatformReady(env, platform) {
  if (platform === 'workersai') {
    if (env.AI) return true;
    const cf = await getCfAccount(env);
    return !!(cf && cf.accountId && cf.token);
  }
  try {
    const creds = await getProviderCredentials(env, platform);
    return !!creds.key;
  } catch {
    const creds = await getProviderCredentials(env, platform);
    return !!creds.key;
  }
}

/* ============================ models ============================ */

async function cacheGet(env, platform) {
  try {
    return await kvModelCacheGet(env, platform);
  } catch {
    return null;
  }
}

async function cachePut(env, platform, data) {
  try {
    await kvModelCachePut(env, platform, data, MODEL_CACHE_TTL_MS);
  } catch { /* ignore */ }
}

export async function listModels(env, platform, { refresh = false } = {}) {
  if (!PLATFORMS[platform]) throw new ProviderError('پلتفرم ناشناخته است');
  if (!refresh) {
    const cached = await cacheGet(env, platform);
    if (cached) return cached;
  }

  let models;
  const p = PLATFORMS[platform];

  if (platform === 'workersai') models = await listWorkersAiModels(env, refresh);
  else if (platform === 'openrouter') models = await listOpenRouterModels();
  else if (platform === 'orcarouter') models = await listOrcaRouterModels(env);
  else if (platform === 'onerouter') models = await listOneRouterModels(env);
  else if (platform === 'gemini') models = await listGeminiModels(env);
  else if (platform === 'groq') models = await listOpenAICompatible(env, 'groq');
  else if (platform === 'cerebras') models = await listOpenAICompatible(env, 'cerebras');
  else if (platform === 'sambanova') models = await listOpenAICompatible(env, 'sambanova');
  else if (platform === 'huggingface') models = await listHuggingFaceModels(env);
  else if (platform === 'github') models = await listOpenAICompatible(env, 'github');
  else if (platform === 'mistral') models = await listOpenAICompatible(env, 'mistral');
  else if (platform === 'nvidia') models = await listOpenAICompatible(env, 'nvidia');
  else if (platform === 'cohere') models = await listCohereModels(env);
  else models = [];

  models = sortModels(dedupeModels(models || [])).slice(0, LIMITS.maxModelsReturn);
  if (!models.length) {
    if (platform === 'gemini') models = GEMINI_CURATED_MODELS.map((m) => ({ ...m, platform: 'gemini' }));
    else if (platform === 'groq') models = GROQ_CURATED_MODELS.map((m) => ({ ...m, platform: 'groq' }));
    else if (platform === 'cerebras') models = CEREBRAS_CURATED_MODELS.map((m) => ({ ...m, platform: 'cerebras' }));
    else if (platform === 'sambanova') models = SAMBANOVA_CURATED_MODELS.map((m) => ({ ...m, platform: 'sambanova' }));
    else if (platform === 'huggingface') models = HUGGINGFACE_CURATED_MODELS.map((m) => ({ ...m, platform: 'huggingface' }));
    else if (platform === 'github') models = GITHUB_CURATED_MODELS.map((m) => ({ ...m, platform: 'github' }));
    else if (platform === 'mistral') models = MISTRAL_CURATED_MODELS.map((m) => ({ ...m, platform: 'mistral' }));
    else if (platform === 'nvidia') models = NVIDIA_CURATED_MODELS.map((m) => ({ ...m, platform: 'nvidia' }));
    else if (platform === 'cohere') models = COHERE_CURATED_MODELS.map((m) => ({ ...m, platform: 'cohere' }));
    else throw new ProviderError('لیست مدل‌ها خالی بود', { provider: platform });
  }
  await cachePut(env, platform, models);
  return models;
}

function dedupeModels(models) {
  const seen = new Set();
  return models.filter((m) => {
    if (!m || !m.id || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

function sortModels(models) {
  return [...models].sort((a, b) => {
    if (!!a.free !== !!b.free) return a.free ? -1 : 1;
    if (!!a.recommended !== !!b.recommended) return a.recommended ? -1 : 1;
    return String(a.name || a.id).localeCompare(String(b.name || a.id), 'en');
  });
}

function modelFromRow(row, { platform, free, ctx, max, reasoning, vision, desc, name }) {
  return {
    id: String(row.id),
    name: String(name || row.name || row.id).slice(0, 110),
    desc: String(desc == null ? row.description || '' : desc).replace(/\s+/g, ' ').slice(0, 220),
    ctx: Number(ctx || 0),
    max: Number(max || 0),
    free: !!free,
    reasoning: !!reasoning,
    vision: !!vision,
    platform
  };
}

/* --- OpenRouter --- */
async function listOpenRouterModels() {
  const res = await fetchJson('https://openrouter.ai/api/v1/models?output_modalities=text&limit=1000', {
    headers: { Accept: 'application/json', 'HTTP-Referer': APP.website, 'X-OpenRouter-Title': APP.name }
  }, MODELS_TIMEOUT_MS);
  const rows = (res && res.data) || [];
  const models = [];
  for (const m of rows) {
    if (!m || !m.id) continue;
    const pricing = m.pricing || {};
    const prompt = Number(pricing.prompt);
    const completion = Number(pricing.completion);
    const free = /:free$/i.test(m.id) || (Number.isFinite(prompt) && prompt === 0 && Number.isFinite(completion) && completion === 0);
    const input = (m.architecture && m.architecture.input_modalities) || [];
    const params = m.supported_parameters || [];
    models.push(modelFromRow(m, {
      platform: 'openrouter', free,
      ctx: m.context_length || (m.top_provider && m.top_provider.context_length) || 0,
      max: (m.top_provider && m.top_provider.max_completion_tokens) || (m.per_request_limits && m.per_request_limits.completion_tokens) || 0,
      reasoning: !!m.reasoning || params.includes('reasoning') || params.includes('reasoning_effort') || params.includes('include_reasoning'),
      vision: input.includes('image')
    }));
  }
  if (!models.length) throw new ProviderError('پاسخ مدل‌های OpenRouter خالی بود', { provider: 'openrouter' });
  return models;
}

/* --- OrcaRouter --- */
async function listOrcaRouterModels(env) {
  const creds = await getProviderCredentials(env, 'orcarouter');
  const headers = { Accept: 'application/json' };
  if (creds.key) headers.Authorization = 'Bearer ' + creds.key;
  const res = await fetchJson((creds.baseUrl || PLATFORMS.orcarouter.baseUrl) + '/models', { headers }, MODELS_TIMEOUT_MS);
  const rows = (res && res.data) || [];
  const models = [];
  for (const m of rows) {
    if (!m || !m.id) continue;
    const pricing = m.pricing || {};
    const prompt = Number(pricing.prompt);
    const completion = Number(pricing.completion);
    const request = Number(pricing.request);
    const free = /-free$/i.test(m.id) ||
      (Number.isFinite(request) && request === 0) ||
      (Number.isFinite(prompt) && prompt === 0 && Number.isFinite(completion) && completion === 0);
    const params = m.supported_parameters || [];
    const endpoints = m.supported_endpoint_types || [];
    models.push(modelFromRow(m, {
      platform: 'orcarouter', free,
      ctx: m.context_length || 0,
      max: m.max_completion_tokens || 0,
      reasoning: params.includes('reasoning') || params.includes('reasoning_effort') || /reasoning|think/i.test(m.id),
      vision: (m.architecture && m.architecture.input_modalities || []).includes('image') || endpoints.includes('image')
    }));
  }
  if (!models.length) throw new ProviderError('پاسخ مدل‌های OrcaRouter خالی بود', { provider: 'orcarouter' });
  return models;
}

/* --- OneRouter --- */
async function listOneRouterModels(env) {
  const creds = await getProviderCredentials(env, 'onerouter');
  if (!creds.key) {
    return ONEROUTER_CURATED_MODELS.map((m) => ({ ...m, platform: 'onerouter' }));
  }
  const base = creds.baseUrl || PLATFORMS.onerouter.baseUrl;
  try {
    const res = await fetchJson(base + '/models', { headers: { Accept: 'application/json', Authorization: 'Bearer ' + creds.key } }, MODELS_TIMEOUT_MS);
    const rows = (res && res.data) || [];
    const models = [];
    for (const m of rows) {
      if (!m || !m.id) continue;
      const pricing = m.pricing || {};
      const free = /:free$/i.test(m.id) ||
        (Number(pricing.prompt) === 0 && Number(pricing.completion) === 0);
      models.push(modelFromRow(m, {
        platform: 'onerouter', free,
        ctx: m.context_length || 0,
        max: m.max_completion_tokens || 0,
        reasoning: /reasoning|think/i.test(m.id),
        vision: /vision|image/i.test(m.id)
      }));
    }
    if (models.length) return models;
  } catch (e) {
    await log(env, 'provider', 'OneRouter model list: ' + String((e && e.message) || e).slice(0, 180));
  }
  return ONEROUTER_CURATED_MODELS.map((m) => ({ ...m, platform: 'onerouter' }));
}

/* --- Gemini --- */
async function listGeminiModels(env) {
  const creds = await getProviderCredentials(env, 'gemini');
  if (!creds.key) return GEMINI_CURATED_MODELS.map((m) => ({ ...m, platform: 'gemini' }));
  try {
    const res = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?key=' + creds.key, {}, MODELS_TIMEOUT_MS);
    const rows = (res && res.models) || [];
    const models = [];
    for (const m of rows) {
      if (!m || !m.name) continue;
      const id = m.name.replace(/^models\//, '');
      const free = /flash/i.test(id) || /gemini-1\.5-flash/i.test(id);
      const supportsVision = /vision|gemini-1\.5|gemini-2/i.test(id);
      models.push({
        id,
        name: m.displayName || id,
        desc: m.description || '',
        ctx: m.inputTokenLimit || 0,
        max: m.outputTokenLimit || 0,
        free,
        reasoning: false,
        vision: supportsVision,
        platform: 'gemini'
      });
    }
    if (models.length) return models;
  } catch (e) {
    await log(env, 'provider', 'Gemini model list: ' + String((e && e.message) || e).slice(0, 180));
  }
  return GEMINI_CURATED_MODELS.map((m) => ({ ...m, platform: 'gemini' }));
}

/* --- OpenAI-compatible generic --- */
async function listOpenAICompatible(env, platform) {
  const creds = await getProviderCredentials(env, platform);
  if (!creds.key) {
    return curatedFor(platform).map((m) => ({ ...m, platform }));
  }
  const base = (creds.baseUrl || PLATFORMS[platform].baseUrl || '').replace(/\/+$/, '');
  try {
    const res = await fetchJson(base + '/models', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + creds.key }
    }, MODELS_TIMEOUT_MS);
    const rows = (res && res.data) || [];
    const models = [];
    for (const m of rows) {
      if (!m || !m.id) continue;
      models.push(modelFromRow(m, {
        platform, free: /:free$|-free/i.test(m.id) || /free/i.test(m.id),
        ctx: m.context_length || 0,
        max: m.max_completion_tokens || 0,
        reasoning: /reasoning|think|o1|r1/i.test(m.id),
        vision: /vision|image|vl/i.test(m.id)
      }));
    }
    if (models.length) return models;
  } catch (e) {
    await log(env, 'provider', platform + ' model list: ' + String((e && e.message) || e).slice(0, 180));
  }
  return curatedFor(platform).map((m) => ({ ...m, platform }));
}

/* --- Hugging Face --- */
async function listHuggingFaceModels(env) {
  const creds = await getProviderCredentials(env, 'huggingface');
  if (!creds.key) return HUGGINGFACE_CURATED_MODELS.map((m) => ({ ...m, platform: 'huggingface' }));
  try {
    const res = await fetchJson('https://api-inference.huggingface.co/models?limit=100', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + creds.key }
    }, MODELS_TIMEOUT_MS);
    const rows = Array.isArray(res) ? res : [];
    const models = [];
    for (const m of rows) {
      if (!m || !m.modelId) continue;
      models.push({
        id: m.modelId,
        name: m.modelId.split('/').pop(),
        desc: m.pipeline_tag || '',
        ctx: 0, max: 0, free: true, reasoning: false, vision: false, platform: 'huggingface'
      });
    }
    if (models.length) return models;
  } catch (e) {
    await log(env, 'provider', 'HuggingFace model list: ' + String((e && e.message) || e).slice(0, 180));
  }
  return HUGGINGFACE_CURATED_MODELS.map((m) => ({ ...m, platform: 'huggingface' }));
}

/* --- Cohere --- */
async function listCohereModels(env) {
  const creds = await getProviderCredentials(env, 'cohere');
  if (!creds.key) return COHERE_CURATED_MODELS.map((m) => ({ ...m, platform: 'cohere' }));
  try {
    const res = await fetchJson('https://api.cohere.ai/v1/models', {
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + creds.key }
    }, MODELS_TIMEOUT_MS);
    const rows = (res && res.models) || [];
    const models = [];
    for (const m of rows) {
      if (!m || !m.name) continue;
      models.push({
        id: m.name, name: m.name, desc: '', ctx: 0, max: 0,
        free: false, reasoning: false, vision: false, platform: 'cohere'
      });
    }
    if (models.length) return models;
  } catch (e) {
    await log(env, 'provider', 'Cohere model list: ' + String((e && e.message) || e).slice(0, 180));
  }
  return COHERE_CURATED_MODELS.map((m) => ({ ...m, platform: 'cohere' }));
}

function curatedFor(platform) {
  const map = {
    groq: GROQ_CURATED_MODELS, cerebras: CEREBRAS_CURATED_MODELS,
    sambanova: SAMBANOVA_CURATED_MODELS, github: GITHUB_CURATED_MODELS,
    mistral: MISTRAL_CURATED_MODELS, nvidia: NVIDIA_CURATED_MODELS
  };
  return map[platform] || [];
}

/* --- Workers AI --- */
async function listWorkersAiModels(env, refresh) {
  if (!refresh) {
    const cached = await cacheGet(env, 'workersai');
    if (cached) return cached;
  }
  const cf = await getCfAccount(env);
  if (cf && cf.accountId && cf.token) {
    try {
      const live = await fetchCfModelList(cf.accountId, cf.token);
      if (live.length) return live;
    } catch (e) {
      await log(env, 'provider', 'Cloudflare model list: ' + String((e && e.message) || e).slice(0, 180));
    }
  }
  return CF_CURATED_MODELS.map((m) => ({ ...m, platform: 'workersai' }));
}

async function fetchCfModelList(accountId, token) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(accountId) +
      '/ai/models/search?per_page=100&page=' + page;
    const json = await fetchJson(url, { headers: { Authorization: 'Bearer ' + token } }, MODELS_TIMEOUT_MS);
    if (!json || !json.success) {
      const msg = json && json.errors && json.errors[0] && json.errors[0].message;
      throw new ProviderError(msg || 'Cloudflare auth failed', { provider: 'workersai', status: 401, detail: msg || '' });
    }
    const arr = json.result || [];
    for (const m of arr) {
      const task = (m.task && (m.task.name || m.task)) || '';
      if (String(task).toLowerCase() !== 'text generation') continue;
      if (!m.name) continue;
      out.push(modelFromRow({ id: m.name, name: m.model_description || m.name, description: m.description }, {
        platform: 'workersai', free: true,
        ctx: m.context_length || 0, max: m.max_output_tokens || 0
      }));
    }
    if (arr.length < 100) break;
  }
  return out;
}

/* ============================ model cap ============================ */

export async function resolveMaxTokens(env, platform, model, requested) {
  let cap = 0;
  const cached = await cacheGet(env, platform);
  const found = cached && cached.find((m) => m.id === model);
  if (found && found.max) cap = Number(found.max);
  if (!cap && platform === 'workersai') {
    const curated = CF_CURATED_MODELS.find((m) => m.id === model);
    if (curated && curated.max) cap = curated.max;
  }
  if (!cap) cap = LIMITS.deepTokensLimit;
  const wanted = Number(requested) || 4096;
  return Math.max(256, Math.min(wanted, cap));
}

function clampTemperature(value, fallback = 0.7) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(2, n));
}

/* ============================ chat ============================ */

export async function streamCompletion(env, opts) {
  const platform = opts.platform;
  if (!PLATFORMS[platform]) throw new ProviderError('پلتفرم ناشناخته است');

  const maxTokens = await resolveMaxTokens(env, platform, opts.model, opts.maxTokens);
  const base = { ...opts, maxTokens, temperature: clampTemperature(opts.temperature) };

  if (platform === 'workersai') {
    const stream = await workersAiStream(env, base);
    return parseProviderSse(stream);
  }
  if (platform === 'gemini') {
    const stream = await geminiStream(env, base);
    return parseProviderSse(stream);
  }
  if (platform === 'cohere') {
    const stream = await cohereStream(env, base);
    return parseProviderSse(stream);
  }
  const stream = await openAiStream(env, platform, base);
  return parseProviderSse(stream);
}

export async function startCompletion(env, opts) {
  const settings = await getSettings(env);
  try {
    return { stream: await streamCompletion(env, opts), used: opts, fallback: false };
  } catch (firstError) {
    if (opts.allowFallback === false || settings.fallbackEnabled === false) throw firstError;
    const fallback = await pickFallback(env, opts.platform, settings);
    if (!fallback) throw firstError;
    try {
      const used = { ...opts, ...fallback };
      const stream = await streamCompletion(env, used);
      await log(env, 'provider', 'fallback ' + opts.platform + '/' + opts.model + ' → ' + fallback.platform + '/' + fallback.model);
      return { stream, used, fallback: true, firstError };
    } catch (secondError) {
      const e = new ProviderError(
        'هر دو سرویس‌دهنده پاسخ ندادند.',
        {
          provider: opts.platform,
          status: secondError.status || firstError.status || 0,
          detail: 'انتخاب اول: ' + String(firstError.message || firstError).slice(0, 120) +
            ' | جایگزین: ' + String(secondError.message || secondError).slice(0, 120)
        }
      );
      throw e;
    }
  }
}

export async function pickFallback(env, excludePlatform, settings) {
  const order = ['workersai', 'groq', 'orcarouter', 'openrouter', 'onerouter', 'gemini', 'cerebras', 'sambanova', 'github', 'mistral', 'nvidia', 'cohere'];
  for (const platform of order) {
    if (platform === excludePlatform) continue;
    if (!(await isPlatformReady(env, platform))) continue;
    const model = (settings && settings.defaultModel && settings.defaultModel[platform]) ||
      PLATFORMS[platform].defaultModel;
    if (model) return { platform, model };
  }
  return null;
}

/* ------------------------- OpenAI-compatible ------------------------- */

async function openAiStream(env, platform, opts) {
  const p = PLATFORMS[platform];
  const creds = await getProviderCredentials(env, platform);
  if (!creds.key) {
    throw new ProviderError('کلید ' + p.faLabel + ' تنظیم نشده است.', {
      provider: platform, status: 401,
      detail: 'در پنل ادمین بخش کلیدها، کلید ' + p.faLabel + ' را ذخیره کنید. راهنما: ' + p.keysUrl
    });
  }
  const base = (creds.baseUrl || p.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new ProviderError('آدرس سرویس‌دهنده تنظیم نشده است.', { provider: platform });
  const body = buildOpenAiBody(platform, opts);
  const url = base + '/chat/completions';

  const attempt = async (payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: openAiHeaders(platform, creds.key),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const info = extractErrorInfo(text);
      throw new ProviderError(info.message || ('HTTP ' + res.status), {
        provider: platform, status: res.status, detail: info.message
      });
    }
    if (!res.body) throw new ProviderError('پاسخ سرویس‌دهنده بدنه‌ای ندارد.', { provider: platform, status: res.status });
    return res.body;
  };

  try {
    return await attempt(body);
  } catch (e) {
    if (e instanceof ProviderError && (e.status === 400 || e.status === 422) &&
        /max_completion_tokens|reasoning|unknown|unsupported|invalid.*parameter/i.test(String(e.detail || ''))) {
      const compatible = { ...body, max_tokens: body.max_tokens || body.max_completion_tokens };
      delete compatible.max_completion_tokens;
      delete compatible.reasoning;
      delete compatible.reasoning_effort;
      try { return await attempt(compatible); } catch (retryError) { throw retryError; }
    }
    throw e;
  }
}

function buildOpenAiBody(platform, opts) {
  const messages = normalizeMessages(opts.messages);
  const body = { model: opts.model, messages, temperature: clampTemperature(opts.temperature), stream: true };
  if (platform === 'openrouter') {
    body.max_completion_tokens = opts.maxTokens;
    if (opts.deep && !/:free$|^openrouter\/free$/i.test(opts.model)) {
      body.reasoning = { effort: 'high' };
    }
  } else {
    body.max_tokens = opts.maxTokens;
  }
  return body;
}

function openAiHeaders(platform, key) {
  const headers = { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (platform === 'openrouter') {
    headers['HTTP-Referer'] = APP.website;
    headers['X-OpenRouter-Title'] = APP.name;
    headers['X-Title'] = APP.name;
  }
  return headers;
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && m.role && m.content != null && String(m.content).trim() !== '')
    .map((m) => ({ role: m.role, content: String(m.content) }))
    .slice(0, 80);
}

/* ------------------------- Cloudflare Workers AI ------------------------- */

async function workersAiStream(env, opts) {
  const model = String(opts.model || '').trim();
  if (!model) throw new ProviderError('مدل Workers AI انتخاب نشده است.', { provider: 'workersai' });
  if (!/^[A-Za-z0-9@._:/-]+$/.test(model)) {
    throw new ProviderError('شناسهٔ مدل Workers AI معتبر نیست.', { provider: 'workersai', status: 400 });
  }
  if (env.AI) {
    try {
      const result = await env.AI.run(model, {
        messages: normalizeMessages(opts.messages),
        temperature: clampTemperature(opts.temperature),
        max_tokens: opts.maxTokens,
        stream: true
      });
      return normalizeCfResult(result);
    } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 260);
      throw new ProviderError(msg, { provider: 'workersai', status: 502, detail: msg });
    }
  }
  const cf = await getCfAccount(env);
  if (!cf || !cf.accountId || !cf.token) {
    throw new ProviderError('Workers AI در دسترس نیست.', {
      provider: 'workersai', status: 401,
      detail: 'binding [ai] فعال نیست و Account ID/API Token هم تنظیم نشده است.'
    });
  }
  const safeModel = model.split('/').map(encodeURIComponent).join('/');
  const url = 'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(cf.accountId) + '/ai/run/' + safeModel;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cf.token, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages: normalizeMessages(opts.messages), temperature: clampTemperature(opts.temperature), max_tokens: opts.maxTokens, stream: true }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const info = extractErrorInfo(text);
    throw new ProviderError(info.message || ('HTTP ' + res.status), { provider: 'workersai', status: res.status, detail: info.message });
  }
  if (!res.body) throw new ProviderError('پاسخ Workers AI بدنه ندارد.', { provider: 'workersai' });
  return res.body;
}

function normalizeCfResult(result) {
  if (result && typeof result.getReader === 'function') return result;
  if (result && typeof result[Symbol.asyncIterator] === 'function') {
    return new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        try {
          for await (const item of result) {
            controller.enqueue(enc.encode(typeof item === 'string' ? item : JSON.stringify(item) + '\n'));
          }
        } catch (e) {
          controller.enqueue(enc.encode(JSON.stringify({ error: String(e && e.message || e) }) + '\n'));
        }
        controller.close();
      }
    });
  }
  if (result && typeof result.response === 'string') return singleChunkStream(result.response);
  if (result && typeof result.result === 'string') return singleChunkStream(result.result);
  if (result && result.choices && result.choices[0]) {
    const content = result.choices[0].message && result.choices[0].message.content;
    if (typeof content === 'string') return singleChunkStream(content);
  }
  if (typeof result === 'string') return singleChunkStream(result);
  throw new ProviderError('پاسخ غیرمنتظره از Workers AI.', { provider: 'workersai', detail: JSON.stringify(result).slice(0, 160) });
}

function singleChunkStream(text) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      if (text) controller.enqueue(enc.encode(JSON.stringify({ type: 'delta', v: text }) + '\n'));
      controller.close();
    }
  });
}

/* ------------------------- Gemini ------------------------- */

async function geminiStream(env, opts) {
  const creds = await getProviderCredentials(env, 'gemini');
  if (!creds.key) {
    throw new ProviderError('کلید گوگل Gemini تنظیم نشده است.', { provider: 'gemini', status: 401 });
  }
  const model = opts.model.replace(/^gemini\//, '');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':streamGenerateContent?key=' + creds.key;
  const contents = opts.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content) }]
  }));
  const body = { contents, generationConfig: { temperature: clampTemperature(opts.temperature), maxOutputTokens: opts.maxTokens } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const info = extractErrorInfo(text);
    throw new ProviderError(info.message || ('HTTP ' + res.status), { provider: 'gemini', status: res.status, detail: info.message });
  }
  if (!res.body) throw new ProviderError('پاسخ Gemini بدنه ندارد.', { provider: 'gemini', status: res.status });
  return res.body;
}

/* ------------------------- Cohere ------------------------- */

async function cohereStream(env, opts) {
  const creds = await getProviderCredentials(env, 'cohere');
  if (!creds.key) {
    throw new ProviderError('کلید Cohere تنظیم نشده است.', { provider: 'cohere', status: 401 });
  }
  const url = 'https://api.cohere.ai/v1/chat';
  const body = {
    message: opts.messages.filter((m) => m.role === 'user').pop()?.content || '',
    model: opts.model,
    temperature: clampTemperature(opts.temperature),
    max_tokens: opts.maxTokens,
    chat_history: opts.messages.filter((m) => m.role !== 'user').slice(0, 10).map((m) => ({
      role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
      message: String(m.content)
    }))
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + creds.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const info = extractErrorInfo(text);
    throw new ProviderError(info.message || ('HTTP ' + res.status), { provider: 'cohere', status: res.status, detail: info.message });
  }
  if (!res.body) throw new ProviderError('پاسخ Cohere بدنه ندارد.', { provider: 'cohere', status: res.status });
  return res.body;
}

/* ============================ SSE parser ============================ */

export function parseProviderSse(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let dataLines = [];
  let tagBuf = '';
  let thinkOpen = false;
  let reasoningAcc = '';
  let emittedAny = false;
  let fatal = false;
  let emittedInPull = false;

  function emit(controller, frame) {
    controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
    emittedInPull = true;
  }

  function flushTag(controller) {
    if (!tagBuf) return;
    const isDelta = !thinkOpen;
    if (isDelta) emittedAny = true;
    try { emit(controller, { type: thinkOpen ? 'reasoning' : 'delta', v: tagBuf }); } catch { /* swallow */ }
    if (thinkOpen) reasoningAcc += tagBuf;
    tagBuf = '';
  }

  function classify(raw, controller) {
    let text = tagBuf + String(raw || '');
    tagBuf = '';
    while (text.length) {
      if (thinkOpen) {
        const close = text.indexOf(THINK_CLOSE);
        if (close >= 0) {
          if (close > 0) {
            emit(controller, { type: 'reasoning', v: text.slice(0, close) });
            reasoningAcc += text.slice(0, close);
          }
          thinkOpen = false;
          text = text.slice(close + THINK_CLOSE.length).replace(/^\s+/, '');
          continue;
        }
        const hold = partialPrefixLen(text, THINK_CLOSE);
        if (hold > 0) {
          const v = text.slice(0, text.length - hold);
          if (v) { emit(controller, { type: 'reasoning', v }); reasoningAcc += v; }
          tagBuf = text.slice(text.length - hold);
        } else if (text) {
          emit(controller, { type: 'reasoning', v: text }); reasoningAcc += text;
        }
        text = '';
      } else {
        const open = text.indexOf(THINK_OPEN);
        if (open >= 0) {
          if (open > 0) { emittedAny = true; try { emit(controller, { type: 'delta', v: text.slice(0, open) }); } catch { /* swallow */ } }
          thinkOpen = true;
          text = text.slice(open + THINK_OPEN.length);
          continue;
        }
        const hold = partialPrefixLen(text, THINK_OPEN);
        if (hold > 0) {
          const v = text.slice(0, text.length - hold);
          if (v) { emittedAny = true; try { emit(controller, { type: 'delta', v }); } catch { /* swallow */ } }
          tagBuf = text.slice(text.length - hold);
        } else if (text) {
          emittedAny = true;
          try { emit(controller, { type: 'delta', v: text }); } catch { /* swallow */ }
        }
        text = '';
      }
    }
  }

  function textFromContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      }).join('');
    }
    return '';
  }

  function processJson(json, controller) {
    if (!json || typeof json !== 'object') return;
    if (json.error) {
      const msg = typeof json.error === 'string' ? json.error : (json.error.message || JSON.stringify(json.error));
      emit(controller, { type: 'error', msg: String(msg).slice(0, 300) });
      fatal = true;
      return;
    }
    if (json.type === 'error') {
      emit(controller, { type: 'error', msg: String(json.message || json.error || 'stream error').slice(0, 300) });
      fatal = true;
      return;
    }
    if (Array.isArray(json.choices) && json.choices.length) {
      const choice = json.choices[0] || {};
      const delta = choice.delta || choice.message || {};
      const content = textFromContent(delta.content != null ? delta.content : choice.text);
      const reasoning = textFromContent(
        delta.reasoning != null ? delta.reasoning :
          (delta.reasoning_content != null ? delta.reasoning_content :
            (delta.reasoning_details != null ? delta.reasoning_details : ''))
      );
      if (reasoning) {
        const cleaned = String(reasoning).replace(/\x3C\/?think\x3E/g, '');
        if (cleaned) { emit(controller, { type: 'reasoning', v: cleaned }); reasoningAcc += cleaned; }
      }
      if (content) classify(content, controller);
      return;
    }
    const cfResponse = typeof json.response === 'string' ? json.response : '';
    const cfReasoning = typeof json.reasoning === 'string' ? json.reasoning : '';
    if (cfReasoning) {
      const cleaned = cfReasoning.replace(/\x3C\/?think\x3E/g, '');
      if (cleaned) { emit(controller, { type: 'reasoning', v: cleaned }); reasoningAcc += cleaned; }
    }
    if (cfResponse) classify(cfResponse, controller);
    if (!cfResponse && json.result && typeof json.result.response === 'string') classify(json.result.response, controller);
    // Gemini streaming
    if (json.candidates && json.candidates.length) {
      const content = json.candidates[0].content || {};
      const parts = content.parts || [];
      for (const part of parts) {
        if (part.text) classify(part.text, controller);
      }
    }
  }

  function processDataLine(line, controller) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed === '[DONE]') return;
    try { processJson(JSON.parse(trimmed), controller); } catch { /* ignore keep-alive noise */ }
  }

  function handleLine(line, controller) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
      return;
    }
    if (line === '') {
      if (dataLines.length) { processDataLine(dataLines.join('\n'), controller); dataLines = []; }
      return;
    }
    if (line.startsWith(':') || line.startsWith('event:') || line.startsWith('id:') || line.startsWith('retry:')) return;
    if (/^\s*[{[]/.test(line)) processDataLine(line, controller);
  }

  return new ReadableStream({
    async pull(controller) {
      if (fatal) { try { controller.close(); } catch { } return; }
      emittedInPull = false;
      for (;;) {
        let result;
        try { result = await reader.read(); } catch (e) {
          emit(controller, { type: 'error', msg: String((e && e.message) || e).slice(0, 240) });
          try { controller.close(); } catch { }
          return;
        }
        const { done, value } = result;
        if (done) {
          buffer += decoder.decode();
          if (buffer) { handleLine(buffer.replace(/\r$/, ''), controller); buffer = ''; }
          if (dataLines.length) { processDataLine(dataLines.join('\n'), controller); dataLines = []; }
          flushTag(controller);
          if (!emittedAny) {
            if (reasoningAcc.trim()) {
              emit(controller, { type: 'delta', v: reasoningAcc.trim().slice(0, 8000) });
            } else if (!fatal) {
              emit(controller, { type: 'error', msg: 'مدل پاسخی برنگرداند. مدل دیگری انتخاب کنید یا دوباره تلاش کنید.' });
            }
          }
          try { controller.close(); } catch { }
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).replace(/\r$/, '');
          buffer = buffer.slice(idx + 1);
          handleLine(line, controller);
          if (fatal) break;
        }
        if (fatal) { try { controller.close(); } catch { } return; }
        if (emittedInPull) return;
      }
    },
    async cancel() { try { await reader.cancel(); } catch { } }
  });
}

export async function completeText(env, opts) {
  const stream = await streamCompletion(env, opts);
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let error = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const frame = JSON.parse(line);
        if (frame.type === 'delta' && frame.v) text += frame.v;
        if (frame.type === 'error') error = frame.msg;
      } catch { /* ignore */ }
    }
  }
  if (buffer.trim()) {
    try {
      const frame = JSON.parse(buffer.trim());
      if (frame.type === 'delta' && frame.v) text += frame.v;
      if (frame.type === 'error') error = frame.msg;
    } catch { /* ignore */ }
  }
  if (error && !text) throw new ProviderError(error, { provider: opts.platform });
  return text;
}

export async function utilityComplete(env, { messages, maxTokens = 700, temperature = 0.2 } = {}) {
  const settings = await getSettings(env);
  const candidates = [];
  if (env.AI) candidates.push({ platform: 'workersai', model: '@cf/meta/llama-3.1-8b-instruct-fast' });
  else {
    const cf = await getCfAccount(env);
    if (cf && cf.accountId && cf.token) candidates.push({ platform: 'workersai', model: '@cf/meta/llama-3.1-8b-instruct-fast' });
  }
  const orca = await getProviderCredentials(env, 'orcarouter');
  if (orca.key) candidates.push({ platform: 'orcarouter', model: 'orcarouter/free' });
  const openrouter = await getProviderCredentials(env, 'openrouter');
  if (openrouter.key) candidates.push({ platform: 'openrouter', model: 'openrouter/free' });
  const groq = await getProviderCredentials(env, 'groq');
  if (groq.key) candidates.push({ platform: 'groq', model: 'llama-3.3-70b-versatile' });
  const gemini = await getProviderCredentials(env, 'gemini');
  if (gemini.key) candidates.push({ platform: 'gemini', model: 'gemini-1.5-flash' });

  for (const candidate of candidates) {
    try {
      const text = await completeText(env, { ...candidate, messages, temperature, maxTokens, deep: false, allowFallback: false });
      if (text && text.trim()) return text.trim();
    } catch (e) {
      await log(env, 'warn', 'utility model ' + candidate.platform + ': ' + String((e && e.message) || e).slice(0, 120));
    }
  }
  return '';
}

/* ============================ admin tests ============================ */

export async function testProvider(env, platform, keyOverride, baseUrlOverride) {
  if (platform === 'workersai') return testCloudflare(env);
  if (!PLATFORMS[platform]) return { valid: false, message: 'پلتفرم ناشناخته است.' };

  const creds = await getProviderCredentials(env, platform);
  const key = String(keyOverride || creds.key || '').trim();
  const base = String(baseUrlOverride || creds.baseUrl || PLATFORMS[platform].baseUrl || '').replace(/\/+$/, '');
  if (!key) return { valid: false, message: 'کلید تنظیم نشده است.' };

  try {
    if (platform === 'openrouter') {
      const json = await fetchJson('https://openrouter.ai/api/v1/key', { headers: { Authorization: 'Bearer ' + key } }, 15000);
      if (json && json.data) {
        return { valid: true, message: 'کلید OpenRouter معتبر است ✓', info: { usage: json.data.usage, limit: json.data.limit, isFreeTier: json.data.is_free_tier } };
      }
      return { valid: false, message: 'پاسخ نامعقول از OpenRouter.' };
    }
    if (platform === 'orcarouter' || platform === 'groq' || platform === 'cerebras' || platform === 'sambanova' ||
        platform === 'github' || platform === 'mistral' || platform === 'nvidia') {
      const json = await fetchJson(base + '/models', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }, 20000);
      const count = (json && json.data && json.data.length) || 0;
      return { valid: true, message: 'کلید ' + PLATFORMS[platform].faLabel + ' معتبر است ✓ — ' + count + ' مدل در دسترس', count };
    }
    if (platform === 'onerouter') {
      const json = await fetchJson(base + '/models', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }, 20000);
      const count = (json && json.data && json.data.length) || 0;
      return { valid: true, message: 'کلید OneRouter معتبر است ✓ — ' + count + ' مدل در دسترس', count };
    }
    if (platform === 'gemini') {
      const json = await fetchJson('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, {}, 15000);
      if (json && json.models) return { valid: true, message: 'کلید Gemini معتبر است ✓ — ' + json.models.length + ' مدل', count: json.models.length };
      return { valid: false, message: 'پاسخ نامعقول از Gemini.' };
    }
    if (platform === 'cohere') {
      const json = await fetchJson('https://api.cohere.ai/v1/models', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }, 15000);
      if (json && json.models) return { valid: true, message: 'کلید Cohere معتبر است ✓ — ' + json.models.length + ' مدل', count: json.models.length };
      return { valid: false, message: 'پاسخ نامعقول از Cohere.' };
    }
    if (platform === 'huggingface') {
      const json = await fetchJson('https://api-inference.huggingface.co/models?limit=1', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } }, 15000);
      return { valid: true, message: 'کلید Hugging Face معتبر است ✓' };
    }
  } catch (e) {
    return { valid: false, message: 'اتصال/اعتبارسنجی ناموفق: ' + String((e && e.message) || e).slice(0, 220) };
  }
  return { valid: false, message: 'پلتفرم پشتیبانی نمی‌شود.' };
}

async function testCloudflare(env) {
  const cf = await getCfAccount(env);
  if (!cf || !cf.accountId || !cf.token) {
    return {
      valid: !!env.AI,
      message: env.AI
        ? 'Workers AI با binding داخلی فعال است ✓ (برای لیست زندهٔ مدل‌ها می‌توانید Account ID و API Token هم اضافه کنید.)'
        : 'نه binding [ai] فعال است و نه Account ID/Token تنظیم شده؛ Workers AI کار نخواهد کرد.'
    };
  }
  try {
    const json = await fetchJson(
      'https://api.cloudflare.com/client/v4/accounts/' + encodeURIComponent(cf.accountId) + '/ai/models/search?per_page=1',
      { headers: { Authorization: 'Bearer ' + cf.token } }, 15000
    );
    if (json && json.success) return { valid: true, message: 'اتصال Cloudflare موفق است ✓ — لیست زندهٔ مدل‌ها فعال شد.' };
    const msg = json && json.errors && json.errors[0] && json.errors[0].message;
    return { valid: false, message: 'Cloudflare نپذیرفت: ' + (msg || 'خطای ناشناخته') };
  } catch (e) {
    return { valid: false, message: 'اتصال Cloudflare ممکن نشد: ' + String((e && e.message) || e).slice(0, 180) };
  }
}

/* ============================ custom provider (per-user, AES-GCM) ============================ */

export async function listCustomProviders(env, userSource, userId) {
  if (!hasD1(env)) return [];
  try {
    const rows = await dbAll(env, 'SELECT * FROM custom_providers WHERE user_source=? AND user_id=? AND is_enabled=1 ORDER BY updated_at DESC', [userSource, userId]);
    return rows.map((r) => ({
      id: r.id, name: r.name, baseUrl: r.base_url, keyMask: r.key_enc ? maskKey('enc:' + r.key_enc.slice(-4)) : null,
      customHeaders: r.custom_headers ? JSON.parse(r.custom_headers || '{}') : {},
      defaultModel: r.default_model, isEnabled: !!r.is_enabled
    }));
  } catch { return []; }
}

export async function saveCustomProvider(env, userSource, userId, provider) {
  if (!hasD1(env)) return false;
  const now = Date.now();
  const id = provider.id || 'custom_' + now;
  let keyEnc = provider.key_enc;
  if (provider.key && !provider.key_enc) {
    keyEnc = await encryptValue(provider.key, encryptionSecret(env));
  }
  await dbExec(env,
    'INSERT INTO custom_providers (id,user_source,user_id,name,base_url,key_enc,custom_headers,default_model,is_enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,base_url=excluded.base_url,key_enc=excluded.key_enc,custom_headers=excluded.custom_headers,default_model=excluded.default_model,is_enabled=excluded.is_enabled,updated_at=excluded.updated_at',
    [id, userSource, userId, provider.name, provider.baseUrl, keyEnc, JSON.stringify(provider.customHeaders || {}), provider.defaultModel || '', provider.isEnabled !== false ? 1 : 0, provider.createdAt || now, now]);
  return id;
}

export async function deleteCustomProvider(env, id) {
  if (!hasD1(env)) return false;
  await dbExec(env, 'DELETE FROM custom_providers WHERE id=?', [id]);
  return true;
}

export async function getCustomProviderKey(env, id, userSource, userId) {
  if (!hasD1(env)) return null;
  const row = await dbOne(env, 'SELECT key_enc FROM custom_providers WHERE id=? AND user_source=? AND user_id=?', [id, userSource, userId]);
  if (!row || !row.key_enc) return null;
  try { return await decryptValue(row.key_enc, encryptionSecret(env)); } catch { return null; }
}

export async function getCustomProviderBaseUrl(env, id, userSource, userId) {
  if (!hasD1(env)) return null;
  const row = await dbOne(env, 'SELECT base_url, custom_headers, default_model FROM custom_providers WHERE id=? AND user_source=? AND user_id=?', [id, userSource, userId]);
  if (!row) return null;
  return { baseUrl: row.base_url, customHeaders: row.custom_headers ? JSON.parse(row.custom_headers || '{}') : {}, defaultModel: row.default_model };
}

export async function validateCustomBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return { ok: false, error: 'آدرس خالی است.' };
  let url;
  try { url = new URL(raw); } catch { return { ok: false, error: 'آدرس معتبر نیست.' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'آدرس باید HTTPS باشد.' };
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return { ok: false, error: 'آدرس localhost مجاز نیست.' };
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return { ok: false, error: 'آدرس IP مستقیم مجاز نیست.' };
  if (/^(10|172\.(1[6-9]|2[0-9]|3[0-1])|192\.168)\./.test(host)) return { ok: false, error: 'آدرس IP خصوصی مجاز نیست.' };
  if (/^169\.254\./.test(host)) return { ok: false, error: 'آدرس link-local مجاز نیست.' };
  return { ok: true, value: raw };
}

/* ============================ smart router ============================ */

const TASK_KEYWORDS = {
  code: ['کد', 'برنامه', 'function', 'class', 'api', 'sql', 'javascript', 'python', 'html', 'css', 'debug', 'bug', 'خطای کد'],
  reasoning: ['استدلال', 'تحلیل', 'ریاضیات', 'م법', 'چرا', 'چگونه', 'مقایسه', 'منطق', 'فلسفه'],
  translation: ['ترجمه', 'ترجمهٔ', 'translation', 'به انگلیسی', 'به فارسی'],
  creative: ['داستان', 'قصه', 'shiar', 'شعر', 'ایده', 'senario', 'سناریو'],
  simple: ['سلام', 'hello', 'chi', 'چه', 'کجا', 'کی', 'آیا']
};

export function smartRouteModel(userText, persona, availablePlatforms, settings) {
  const text = String(userText || '').toLowerCase();
  let task = 'general';
  let confidence = 0.3;

  for (const [taskName, keywords] of Object.entries(TASK_KEYWORDS)) {
    const hits = keywords.filter((k) => text.includes(k.toLowerCase())).length;
    if (hits > 0 && hits > confidence * 10) {
      task = taskName;
      confidence = Math.min(0.9, hits / keywords.length + 0.3);
    }
  }

  const preferred = {
    code: ['groq', 'workersai', 'cerebras', 'nvidia'],
    reasoning: ['workersai', 'groq', 'openrouter', 'nvidia'],
    translation: ['groq', 'gemini', 'workersai', 'openrouter'],
    creative: ['gemini', 'workersai', 'groq', 'openrouter'],
    simple: ['workersai', 'groq', 'orcarouter', 'openrouter'],
    general: ['workersai', 'groq', 'openrouter', 'orcarouter', 'onerouter', 'gemini', 'cerebras', 'sambanova', 'github', 'mistral', 'nvidia', 'cohere']
  };

  const order = preferred[task] || preferred.general;
  for (const platform of order) {
    if (!availablePlatforms.includes(platform)) continue;
    if (!(settings && settings.defaultModel && settings.defaultModel[platform])) continue;
    return { platform, model: settings.defaultModel[platform], task, confidence };
  }
  // final fallback to workersai
  return { platform: 'workersai', model: settings.defaultModel.workersai || PLATFORMS.workersai.defaultModel, task, confidence };
}

/* ============================ helpers ============================ */

async function fetchJson(url, options, timeoutMs) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs || MODELS_TIMEOUT_MS) });
  } catch (e) {
    throw new ProviderError('اتصال به ' + hostOf(url) + ' برقرار نشد: ' + String((e && e.message) || e).slice(0, 160), { detail: String((e && e.message) || e) });
  }
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const info = extractErrorInfo(text);
    throw new ProviderError(info.message || ('HTTP ' + res.status), { status: res.status, detail: info.message });
  }
  if (!json) throw new ProviderError('پاسخ JSON نامعتبر از ' + hostOf(url), { status: res.status });
  return json;
}

function extractErrorInfo(text) {
  const raw = String(text || '');
  try {
    const j = JSON.parse(raw);
    const msg =
      (j.error && (j.error.message || (j.error.metadata && j.error.metadata.raw))) ||
      (j.errors && j.errors[0] && j.errors[0].message) ||
      j.message || j.detail || raw;
    return { message: String(msg).slice(0, 300) };
  } catch {
    return { message: raw.slice(0, 300) };
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return 'سرویس‌دهنده'; }
}

export function validateBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return { ok: false, error: 'آدرس خالی است.' };
  let url;
  try { url = new URL(raw); } catch { return { ok: false, error: 'آدرس معتبر نیست.' }; }
  if (url.protocol !== 'https:') return { ok: false, error: 'آدرس باید HTTPS باشد.' };
  const host = url.hostname.toLowerCase();
  const allowed = /(^|\.)(onerouter\.(pro|ai|com)|infron\.ai)$/.test(host);
  if (!allowed) {
    return { ok: false, error: 'برای OneRouter فقط دامنه‌های onerouter.pro / onerouter.ai / onerouter.com / infron.ai مجاز است.' };
  }
  return { ok: true, value: raw };
}

/* ============================ curated fallback model lists ============================ */

export const GEMINI_CURATED_MODELS = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'مدل سریع و رایگان گوگل', ctx: 1048576, max: 8192, free: true, reasoning: false, vision: true },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: 'مدل قدرتمند گوگل برای ورد\infty', ctx: 2097152, max: 8192, free: false, reasoning: false, vision: true },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'جدیدترین مدل سریع گوگل', ctx: 1048576, max: 8192, free: true, reasoning: false, vision: true }
];

export const GROQ_CURATED_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile', desc: 'مدل سریع و قدرتمند Groq', ctx: 131072, max: 8192, free: true },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant', desc: 'مدل بسیار سریع Groq', ctx: 131072, max: 8192, free: true },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', desc: 'مدل MoE سریع Groq', ctx: 32768, max: 8192, free: true }
];

export const CEREBRAS_CURATED_MODELS = [
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', desc: 'مدل سریع Cerebras', ctx: 131072, max: 8192, free: true },
  { id: 'llama-3.1-8b', name: 'Llama 3.1 8B', desc: 'مدل بسیار سریع Cerebras', ctx: 131072, max: 8192, free: true }
];

export const SAMBANOVA_CURATED_MODELS = [
  { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', desc: 'مدل سریع SambaNova', ctx: 131072, max: 8192, free: true }
];

export const HUGGINGFACE_CURATED_MODELS = [
  { id: 'meta-llama/Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct', desc: 'MDL از HF', ctx: 131072, max: 8192, free: true },
  { id: 'Qwen/Qwen2.5-Coder-32B', name: 'Qwen 2.5 Coder 32B', desc: 'کدنویسی روی HF', ctx: 131072, max: 8192, free: true }
];

export const GITHUB_CURATED_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', desc: 'مدل گیت‌هاب', ctx: 131072, max: 8192, free: true },
  { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', desc: 'MDL گیت‌هاب', ctx: 131072, max: 8192, free: true }
];

export const MISTRAL_CURATED_MODELS = [
  { id: 'open-mistral-7b', name: 'Mistral 7B', desc: 'MDL میstral', ctx: 32768, max: 8192, free: true },
  { id: 'mistral-small-latest', name: 'Mistral Small', desc: 'MDL کوچک میstral', ctx: 32768, max: 8192, free: false }
];

export const NVIDIA_CURATED_MODELS = [
  { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct', desc: 'MDL NVIDIA NIM', ctx: 131072, max: 8192, free: true }
];

export const COHERE_CURATED_MODELS = [
  { id: 'command-r', name: 'Command R', desc: 'MDL Cohere', ctx: 131072, max: 8192, free: false }
];
