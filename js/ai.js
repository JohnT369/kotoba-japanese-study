/* ============================================================
   ai.js - 浏览器端 AI 调用入口
   密钥与模型路由仅存在于 Vercel 的 /api/ai 服务端函数中。
   ============================================================ */

(function () {
  'use strict';

  const API_ENDPOINT = '/api/ai';

  // 仅用于界面说明；服务端会再次校验任务类型并决定实际模型。
  const TASKS = {
    grammar_explain:  { label: '语法解释',     desc: '解释语法点、接续与例句',             tier: 'light',  defaultModel: 'qwen-flash' },
    sentence_correct: { label: '造句批改',     desc: '批改日语句子，判断自然度与语法',       tier: 'medium', defaultModel: 'qwen-plus' },
    conversation:     { label: '对话练习',     desc: '进行连贯的场景化日语会话',             tier: 'strong', defaultModel: 'qwen-max' },
    translate:        { label: '日中互译',     desc: '日语与中文的准确互译',                 tier: 'medium', defaultModel: 'qwen-plus' },
    kana_help:        { label: '假名/读音',    desc: '假名、读音与声调快速问答',             tier: 'light',  defaultModel: 'qwen-flash' },
    lesson_practice:  { label: '课程练习生成', desc: '按本课内容与难度生成结构化练习',       tier: 'medium', defaultModel: 'qwen-plus' },
    voice_dialogue:   { label: '语音会话陪练', desc: '基于语音转写进行本课限定会话反馈',     tier: 'strong', defaultModel: 'qwen-max' }
  };

  function pickModel(task) {
    return (TASKS[task] && TASKS[task].defaultModel) || 'qwen-plus';
  }

  function callAI(task, prompt, opts) {
    opts = opts || {};
    if (!TASKS[task]) {
      return Promise.resolve({ ok: false, text: '', error: '未知任务类型：' + task, model: '', task: task });
    }

    return fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: task,
        prompt: String(prompt || '')
      })
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok || !payload.ok) {
          return { ok: false, text: '', error: payload.error || ('请求失败（' + response.status + '）'), model: payload.model || '', task: task };
        }
        return { ok: true, text: String(payload.text || '').trim(), error: '', model: payload.model || pickModel(task), task: task };
      });
    }).catch(function () {
      return { ok: false, text: '', error: '无法连接 AI 服务，请稍后重试。', model: '', task: task };
    });
  }

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

  window.AI = {
    TASKS: TASKS,
    hasKey: function () { return true; }, // 兼容旧页面；密钥检查改由服务端完成。
    pickModel: pickModel,
    callAI: callAI,
    callJSON: callJSON,
    parseJSONText: parseJSONText
  };
})();
