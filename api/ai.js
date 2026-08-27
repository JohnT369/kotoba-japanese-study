/* Vercel Serverless Function: AI provider proxy.
   Keep every credential, model selection and system prompt on the server. */

const TASKS = {
  grammar_explain:  { model: 'qwen-flash', temperature: 0.35, maxTokens: 900 },
  sentence_correct: { model: 'qwen-plus',  temperature: 0.35, maxTokens: 900 },
  conversation:     { model: 'qwen-max',   temperature: 0.55, maxTokens: 800 },
  translate:        { model: 'qwen-plus',  temperature: 0.25, maxTokens: 900 },
  kana_help:        { model: 'qwen-flash', temperature: 0.25, maxTokens: 600 },
  lesson_practice:  { model: 'qwen-plus',  temperature: 0.25, maxTokens: 2200 },
  voice_dialogue:   { model: 'qwen-max',   temperature: 0.15, maxTokens: 420 }
};

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 24;
const DAILY_REQUEST_LIMIT = 40;
const requestWindows = new Map();
const SUPABASE_URL = String(process.env.SUPABASE_URL || 'https://ytvjyffirlqhmzysdffd.supabase.co').replace(/\/+$/, '');
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_j-vIxJAfKLnTnZapn1ufRA_ppQo_ML1';

function send(res, status, payload) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(payload);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.socket && req.socket.remoteAddress || 'unknown');
}

function isRateLimited(req) {
  const now = Date.now();
  const key = clientKey(req);
  const existing = requestWindows.get(key) || [];
  const active = existing.filter(function (time) { return now - time < WINDOW_MS; });
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(key, active);
    return true;
  }
  active.push(now);
  requestWindows.set(key, active);
  return false;
}

async function getAuthenticatedUser(req) {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i);
  if (!token || !token[1]) return null;
  try {
    const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token[1] },
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return user && user.id ? { id: String(user.id), token: token[1] } : null;
  } catch (error) { return null; }
}

async function consumeDailyQuota(user) {
  try {
    const response = await fetch(SUPABASE_URL + '/rest/v1/rpc/consume_ai_quota', {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + user.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_requests: DAILY_REQUEST_LIMIT }),
      signal: AbortSignal.timeout(5000)
    });
    return response.ok && await response.json() === true;
  } catch (error) { return false; }
}

function systemPrompt(task) {
  const base = '你是一个日语学习助手，回答要简洁准确，必要时给出日语例句和读音（假名/罗马音）。用中文回答。';
  const prompts = {
    grammar_explain:  base + ' 当前任务：解释语法。请说明句型结构、接续、意思，并给 2 个例句（含假名读音）。',
    sentence_correct: base + ' 当前任务：批改造句。请指出错误、给出正确版本、简短说明原因。',
    conversation:     base + ' 当前任务：对话练习。扮演对话对象，回复一句日语（含读音），并附中文翻译。',
    translate:        base + ' 当前任务：翻译。请给出译文，必要时附读音或语法备注。',
    kana_help:        base + ' 当前任务：假名读音。请说明假名读音、声调，必要时给例词。',
    lesson_practice:  base + ' 当前任务：生成课程练习。严格遵守用户给定的 JSON schema；只返回合法 JSON，不要 Markdown、解释文字或代码围栏。题目必须严格限定在用户提供的本课词汇、句型、例句与会话内容内，答案和干扰项必须准确且难度匹配。',
    voice_dialogue:   base + ' 当前任务：进行语音会话陪练。严格遵守用户给定的 JSON schema；只返回合法 JSON，不要 Markdown、解释文字或代码围栏。理解初学者语音转写时保持善意，但反馈、评分和下一句均只能依据本课情景与指定表达。'
  };
  return prompts[task] || base;
}

function modelFor(task) {
  const envKey = 'AI_MODEL_' + task.toUpperCase();
  return process.env[envKey] || TASKS[task].model;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: '仅支持 POST 请求。' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const task = String(body.task || '');
  const prompt = String(body.prompt || '').trim();
  if (!TASKS[task]) return send(res, 400, { ok: false, error: '不支持的 AI 任务。' });
  if (!prompt) return send(res, 400, { ok: false, error: '请输入需要处理的内容。' });
  if (prompt.length > 14000) return send(res, 413, { ok: false, error: '输入内容过长，请缩短后重试。' });

  const user = await getAuthenticatedUser(req);
  if (!user) return send(res, 401, { ok: false, error: '请登录后再使用 AI 助学。' });
  if (isRateLimited(req)) return send(res, 429, { ok: false, error: '请求过于频繁，请十分钟后再试。' });
  if (!await consumeDailyQuota(user)) return send(res, 429, { ok: false, error: '今日 AI 调用额度已用完，请明天再来。' });

  const apiKey = process.env.BAILIAN_API_KEY;
  if (!apiKey) return send(res, 503, { ok: false, error: 'AI 服务尚未配置，请联系站点管理员。' });

  const taskConfig = TASKS[task];
  const baseURL = String(process.env.BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
  // 生成参数亦由服务端按任务固定，客户端传入的模型或采样参数一律忽略。
  const temperature = taskConfig.temperature;
  const maxTokens = taskConfig.maxTokens;
  const model = modelFor(task);

  try {
    const upstream = await fetch(baseURL + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'system', content: systemPrompt(task) }, { role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens
      }),
      signal: AbortSignal.timeout(25000)
    });
    const data = await upstream.json().catch(function () { return {}; });
    if (!upstream.ok) {
      console.error('AI upstream failed', { status: upstream.status, task: task });
      return send(res, 502, { ok: false, error: 'AI 服务暂时不可用，请稍后重试。' });
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) return send(res, 502, { ok: false, error: 'AI 未返回有效内容，请重试。' });
    return send(res, 200, { ok: true, text: String(text), model: model, task: task });
  } catch (error) {
    console.error('AI proxy request failed', { task: task, message: error && error.message });
    return send(res, 502, { ok: false, error: 'AI 服务连接失败，请稍后重试。' });
  }
};
