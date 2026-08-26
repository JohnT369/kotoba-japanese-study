/* ============================================================
   ai.js - AI 调用接口 + 模型分流
   暴露全局对象：window.AI
   设计：
     - 单一入口 callAI(task, prompt, opts) -> Promise<Result>
     - 按 task 类型路由到不同模型（模型分流表）
     - 使用阿里云百炼 OpenAI 兼容 /v1/chat/completions 协议
     - 配置存 LocalStorage：jp_ai_config_v1
   Result: { ok: boolean, text: string, error: string, model: string, task: string }
   ============================================================ */

(function () {
  'use strict';

  const LS_KEY = 'jp_ai_config_v1';

  // ---------- 任务分流表 ----------
  // 每个 task 对应一种使用场景，统一使用百炼千问模型：
  // flash 负责高频轻任务，plus 负责日语理解与结构化输出，max 只用于高质量会话。
  const TASKS = {
    grammar_explain:  { label: '语法解释',     desc: '解释语法点、接续与例句',           tier: 'light',  defaultModel: 'qwen-flash' },
    sentence_correct: { label: '造句批改',     desc: '批改日语句子，判断自然度与语法',     tier: 'medium', defaultModel: 'qwen-plus' },
    conversation:     { label: '对话练习',     desc: '进行更自然、连贯的场景化日语会话',   tier: 'strong', defaultModel: 'qwen-max' },
    translate:        { label: '日中互译',     desc: '日语与中文的准确互译',               tier: 'medium', defaultModel: 'qwen-plus' },
    kana_help:        { label: '假名/读音',    desc: '假名、读音、声调等快速问答',         tier: 'light',  defaultModel: 'qwen-flash' },
    lesson_practice:  { label: '课程练习生成', desc: '按固定 JSON 结构生成三组课程练习',   tier: 'medium', defaultModel: 'qwen-plus' },
    dialogue_assess:  { label: '会话达标评估', desc: '按本课情景评估日语回应的完成质量',     tier: 'medium', defaultModel: 'qwen-plus' }
  };

  // ---------- 配置存取 ----------
  const DEFAULT_CONFIG = {
    provider: 'aliyun-bailian',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    defaultModel: 'qwen-plus',
    models: {
      grammar_explain: 'qwen-flash',
      sentence_correct: 'qwen-plus',
      conversation: 'qwen-max',
      translate: 'qwen-plus',
      kana_help: 'qwen-flash',
      lesson_practice: 'qwen-plus',
      dialogue_assess: 'qwen-plus'
    }
  };

  function isBailianConfig(cfg) {
    const baseURL = String((cfg && cfg.baseURL) || '');
    return cfg && (cfg.provider === 'aliyun-bailian' || /(?:maas|dashscope)\.aliyuncs\.com/i.test(baseURL));
  }

  function normalizeBaseURL(baseURL) {
    const value = String(baseURL || '').trim();
    // 旧版本曾将业务空间 URL 模板直接写入配置；模板本身无法请求。
    return /\{WorkspaceId\}/.test(value) ? DEFAULT_CONFIG.baseURL : (value || DEFAULT_CONFIG.baseURL);
  }

  function getConfig() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_CONFIG);
      const obj = JSON.parse(raw);
      // 原先的 OpenAI 配置会自动迁移到百炼预设，保留已填写的 Key 以免误删。
      if (!isBailianConfig(obj)) {
        return Object.assign({}, DEFAULT_CONFIG, { apiKey: obj.apiKey || '' });
      }
      // 合并默认，避免老配置缺字段
      return Object.assign({}, DEFAULT_CONFIG, obj, {
        provider: 'aliyun-bailian',
        baseURL: normalizeBaseURL(obj.baseURL),
        models: Object.assign({}, DEFAULT_CONFIG.models, (obj.models || {}))
      });
    } catch (e) {
      return Object.assign({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(Object.assign({}, cfg, { provider: 'aliyun-bailian' })));
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetConfig() {
    try { localStorage.removeItem(LS_KEY); return true; } catch (e) { return false; }
  }

  function hasKey() {
    return !!getConfig().apiKey;
  }

  // 给某 task 选模型：优先 models[task]，其次 defaultModel
  function pickModel(task) {
    const cfg = getConfig();
    return (cfg.models && cfg.models[task]) || cfg.defaultModel || 'qwen-plus';
  }

  // ---------- 系统提示词（按 task 分流） ----------
  function systemPrompt(task) {
    const base = '你是一个日语学习助手，回答要简洁准确，必要时给出日语例句和读音（假名/罗马音）。用中文回答。';
    const map = {
      grammar_explain:  base + ' 当前任务：解释语法。请说明句型结构、接续、意思，并给 2 个例句（含假名读音）。',
      sentence_correct: base + ' 当前任务：批改造句。请指出错误、给出正确版本、简短说明原因。',
      conversation:     base + ' 当前任务：对话练习。扮演对话对象，回复一句日语（含读音），并附中文翻译。',
      translate:        base + ' 当前任务：翻译。请给出译文，必要时附读音或语法备注。',
      kana_help:        base + ' 当前任务：假名读音。请说明假名读音、声调，必要时给例词。',
      lesson_practice:  base + ' 当前任务：生成课程练习。严格遵守用户给定的 JSON schema；只返回合法 JSON，不要 Markdown、解释文字或代码围栏。题目必须只使用用户提供的课程内容，答案和干扰项必须准确。',
      dialogue_assess:  base + ' 当前任务：评估会话练习。严格遵守用户给定的 JSON schema；只返回合法 JSON，不要 Markdown、解释文字或代码围栏。仅按本课情景、指定表达和语言自然度评分。'
    };
    return map[task] || base;
  }

  // ---------- 主入口 ----------
  // callAI(task, prompt, opts) -> Promise<{ok, text, error, model, task}>
  function callAI(task, prompt, opts) {
    opts = opts || {};
    const cfg = getConfig();
    if (!cfg.apiKey) {
      return Promise.resolve({
        ok: false,
        text: '',
        error: '尚未配置 API Key，请到「AI 助手」页面填写。',
        model: '',
        task: task
      });
    }
    if (!TASKS[task]) {
      return Promise.resolve({
        ok: false, text: '', error: '未知任务类型：' + task, model: '', task: task
      });
    }

    const model = opts.model || pickModel(task);
    const baseURL = normalizeBaseURL(cfg.baseURL).replace(/\/+$/, '');
    const url = baseURL + '/chat/completions';

    const body = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt(task) },
        { role: 'user', content: prompt }
      ],
      temperature: opts.temperature != null ? opts.temperature : 0.6,
      max_tokens: opts.maxTokens || 800
    };

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.apiKey
      },
      body: JSON.stringify(body)
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (t) {
          throw new Error('HTTP ' + resp.status + ' ' + (t.slice(0, 200) || resp.statusText));
        });
      }
      return resp.json();
    }).then(function (json) {
      const text = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      return { ok: true, text: text.trim(), error: '', model: model, task: task };
    }).catch(function (err) {
      return { ok: false, text: '', error: String(err.message || err), model: model, task: task };
    });
  }

  // 兼容常见模型输出：支持纯 JSON 或 ```json 代码围栏。
  function parseJSONText(text) {
    const raw = String(text || '').trim();
    if (!raw) return { ok: false, data: null, error: 'AI 未返回内容。' };
    const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const candidates = [unfenced];
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) candidates.push(unfenced.slice(start, end + 1));
    for (let i = 0; i < candidates.length; i++) {
      try { return { ok: true, data: JSON.parse(candidates[i]), error: '' }; } catch (e) {}
    }
    return { ok: false, data: null, error: 'AI 返回的内容不是合法 JSON，请重试。' };
  }

  function callJSON(task, prompt, opts) {
    return callAI(task, prompt, opts).then(function (result) {
      if (!result.ok) return Object.assign({}, result, { data: null });
      const parsed = parseJSONText(result.text);
      if (!parsed.ok) return Object.assign({}, result, { ok: false, data: null, error: parsed.error });
      return Object.assign({}, result, { data: parsed.data });
    });
  }

  // ---------- 暴露 ----------
  window.AI = {
    TASKS: TASKS,
    getConfig: getConfig,
    saveConfig: saveConfig,
    resetConfig: resetConfig,
    hasKey: hasKey,
    pickModel: pickModel,
    callAI: callAI,
    callJSON: callJSON,
    parseJSONText: parseJSONText
  };
})();
