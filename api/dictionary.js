/* Same-origin dictionary adapter. The browser never calls the provider directly:
 * this route validates input, applies a small shared cache and normalizes results
 * so the UI can later switch to a self-hosted JMdict index without a rewrite. */

const JISHO_URL = 'https://jisho.org/api/v1/search/words';
const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 3;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 120;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 24;
const cache = new Map();
const requestWindows = new Map();

function sendJson(res, status, payload, cacheControl) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl || 'no-store');
  res.json(payload);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket && req.socket.remoteAddress || 'unknown');
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const active = (requestWindows.get(key) || []).filter(function (time) { return now - time < WINDOW_MS; });
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(key, active);
    return true;
  }
  active.push(now);
  requestWindows.set(key, active);
  return false;
}

function normalizeQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function formsFor(entry) {
  const word = String(entry.word || '');
  const parts = (entry.partsOfSpeech || []).join(' ');
  const hasPart = function (text) { return parts.toLowerCase().includes(text); };
  if (!word || !hasPart('verb')) return [];
  if (word === 'する') return ['します', 'しない', 'した', 'して', 'できる'];
  if (word === '来る' || word === 'くる') return ['きます', 'こない', 'きた', 'きて', 'こられる'];
  const end = word.slice(-1);
  const stem = word.slice(0, -1);
  if (hasPart('ichidan') && end === 'る') return [stem + 'ます', stem + 'ない', stem + 'た', stem + 'て', stem + 'られる'];
  const godan = {
    'う': ['います', 'わない', 'った', 'って', 'える'],
    'つ': ['ちます', 'たない', 'った', 'って', 'てる'],
    'る': ['ります', 'らない', 'った', 'って', 'れる'],
    'く': ['きます', 'かない', 'いた', 'いて', 'ける'],
    'ぐ': ['ぎます', 'がない', 'いだ', 'いで', 'げる'],
    'す': ['します', 'さない', 'した', 'して', 'せる'],
    'ぬ': ['にます', 'なない', 'んだ', 'んで', 'ねる'],
    'ぶ': ['びます', 'ばない', 'んだ', 'んで', 'べる'],
    'む': ['みます', 'まない', 'んだ', 'んで', 'める']
  };
  return godan[end] ? godan[end].map(function (ending) { return stem + ending; }) : [];
}

function normalizeEntry(raw, query) {
  const japanese = Array.isArray(raw && raw.japanese) ? raw.japanese : [];
  const primary = japanese[0] || {};
  const word = String(primary.word || primary.reading || raw && raw.slug || '');
  const reading = String(primary.reading || '');
  const senses = (raw && raw.senses || []).slice(0, 3).map(function (sense) {
    return {
      definitions: (sense.english_definitions || []).slice(0, 5).map(String),
      partsOfSpeech: (sense.parts_of_speech || []).slice(0, 4).map(String),
      tags: (sense.tags || []).slice(0, 4).map(String)
    };
  }).filter(function (sense) { return sense.definitions.length; });
  const partsOfSpeech = [];
  senses.forEach(function (sense) {
    sense.partsOfSpeech.forEach(function (part) { if (!partsOfSpeech.includes(part)) partsOfSpeech.push(part); });
  });
  const entry = {
    word: word,
    reading: reading,
    alternateReadings: japanese.slice(1, 4).map(function (item) { return { word: String(item.word || ''), reading: String(item.reading || '') }; }),
    common: !!(raw && raw.is_common),
    jlpt: (raw && raw.jlpt || []).slice(0, 2).map(function (item) { return String(item).replace(/^jlpt-/i, '').toUpperCase(); }),
    partsOfSpeech: partsOfSpeech,
    senses: senses,
    source: { provider: 'Jisho.org', jmdict: !!(raw && raw.attribution && raw.attribution.jmdict) }
  };
  entry.forms = formsFor(entry);
  entry.resolvedFrom = normalizeQuery(query) !== word ? normalizeQuery(query) : '';
  return entry;
}

function getCached(key) {
  const record = cache.get(key);
  if (!record || Date.now() - record.createdAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return record.payload;
}

function putCached(key, payload) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, { createdAt: Date.now(), payload: payload });
}

async function lookup(query) {
  const url = new URL(JISHO_URL);
  url.searchParams.set('keyword', query);
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 6000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error('Dictionary provider returned ' + response.status);
    const data = await response.json();
    return {
      query: query,
      entries: (data && data.data || []).slice(0, MAX_RESULTS).map(function (raw) { return normalizeEntry(raw, query); }).filter(function (entry) { return entry.word && entry.senses.length; }),
      attribution: 'Jisho.org / JMdict'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: '仅支持 GET 请求。' });
  const url = new URL(req.url, 'http://localhost');
  if (url.searchParams.get('health') === '1') return sendJson(res, 200, { ok: true, provider: 'jisho-adapter' });
  const query = normalizeQuery(url.searchParams.get('q'));
  if (!query) return sendJson(res, 400, { ok: false, error: '请输入要查询的日语词。' });
  if (query.length > MAX_QUERY_LENGTH) return sendJson(res, 413, { ok: false, error: '单次查询最多 ' + MAX_QUERY_LENGTH + ' 个字符。' });
  if (isRateLimited(req)) return sendJson(res, 429, { ok: false, error: '查词请求过于频繁，请稍后再试。' });
  const cached = getCached(query);
  if (cached) return sendJson(res, 200, Object.assign({ ok: true, cached: true }, cached), 'public, max-age=300');
  try {
    const payload = await lookup(query);
    putCached(query, payload);
    return sendJson(res, 200, Object.assign({ ok: true, cached: false }, payload), 'public, max-age=300');
  } catch (error) {
    console.error('Dictionary lookup failed', { message: error && error.message });
    return sendJson(res, 502, { ok: false, error: '词典服务暂时不可用，请稍后重试。' });
  }
}

module.exports = handler;
module.exports._test = { formsFor: formsFor, normalizeEntry: normalizeEntry, normalizeQuery: normalizeQuery };
