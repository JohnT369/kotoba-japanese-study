/* ============================================================
   practice.js - 固定课程练习、模块达标评估与 AI 评分
   单词短语：4 道选择题，至少答对 3 题达标
   学习目标：3 道填空题，至少答对 2 题达标
   应用会话：2 个语音对话回合，AI 平均评分至少 70 分达标
   ============================================================ */

(function () {
  'use strict';

  const CACHE_KEY = 'jp_lesson_practice_v1';
  const PROGRESS_KEY = 'jp_lesson_practice_progress_v1';
  // 升级提示词与会话 schema 后，自动淘汰旧的泛化练习缓存。
  const SCHEMA_VERSION = 2;

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function readStore(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      return data && typeof data === 'object' ? data : {};
    } catch (e) { return {}; }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function sourcePayload(lesson) {
    const goals = Array.isArray(lesson.learningGoals) ? lesson.learningGoals : [];
    const dialogue = lesson.dialogue || {};
    return {
      lesson: { title: lesson.title || '', subtitle: lesson.subtitle || '', unit: lesson.unit || '', tags: lesson.tags || [], sequence: lesson.sequence || '' },
      vocabulary: (lesson.vocabulary || []).map(function (item) { return { word: item.word || '', reading: item.reading || '', meaning: item.meaning || '', type: item.type || '', accent: item.accent || '', note: item.note || '' }; }),
      phrases: (lesson.phrases || []).map(function (item) { return { phrase: item.phrase || '', reading: item.reading || '', meaning: item.meaning || '', note: item.note || '' }; }),
      learningGoals: goals.map(function (goal) {
        const main = goal.mainExample || {};
        return { title: goal.goalTitle || '', mainExample: { jp: main.jp || '', reading: main.reading || '', cn: main.cn || '', structure: main.structure || [] }, examples: (goal.examples || []).map(function (ex) { return { jp: ex.jp || '', reading: ex.reading || '', cn: ex.cn || '', focus: ex.focus || '', note: ex.note || '' }; }) };
      }),
      dialogue: { title: dialogue.title || '', lines: (dialogue.lines || []).map(function (line) { return { speaker: line.speaker || '', speakerReading: line.speakerReading || '', jp: line.jp || '', cn: line.cn || '', annotations: line.annotations || [] }; }) }
    };
  }

  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24); }
    return (hash >>> 0).toString(36);
  }

  function getSourceHash(lesson) { return hashText(JSON.stringify(sourcePayload(lesson))); }
  function normalizeText(value) { return String(value || '').replace(/[\s　]/g, '').replace(/[。！？!?、，,.]/g, '').trim(); }
  function isText(value) { return typeof value === 'string' && value.trim().length > 0; }

  function validatePractice(raw) {
    const vocabulary = raw && raw.vocabulary && raw.vocabulary.questions;
    const goals = raw && raw.goals && raw.goals.questions;
    const dialogue = raw && raw.dialogue && raw.dialogue.items;
    if (!Array.isArray(vocabulary) || vocabulary.length !== 4) return { ok: false, error: '单词短语练习必须包含 4 道选择题。' };
    if (!Array.isArray(goals) || goals.length !== 3) return { ok: false, error: '学习目标练习必须包含 3 道句型填空题。' };
    if (!Array.isArray(dialogue) || dialogue.length !== 2) return { ok: false, error: '应用会话练习必须包含 2 个情景回应。' };
    const checkedVocab = [];
    for (let i = 0; i < vocabulary.length; i++) {
      const item = vocabulary[i] || {};
      if (!isText(item.prompt) || !Array.isArray(item.options) || item.options.length !== 4 || !item.options.every(isText) || !Number.isInteger(item.answerIndex) || item.answerIndex < 0 || item.answerIndex > 3) return { ok: false, error: '第 ' + (i + 1) + ' 道词汇题格式不完整。' };
      checkedVocab.push({ prompt: item.prompt.trim(), options: item.options.map(function (x) { return x.trim(); }), answerIndex: item.answerIndex, explain: isText(item.explain) ? item.explain.trim() : '请回到本课词汇表确认词义和读音。' });
    }
    const checkedGoals = [];
    for (let j = 0; j < goals.length; j++) {
      const item = goals[j] || {};
      if (!isText(item.prompt) || !isText(item.sentenceTemplate) || !isText(item.answer) || (item.sentenceTemplate.match(/___/g) || []).length !== 1) return { ok: false, error: '第 ' + (j + 1) + ' 道句型题必须包含一个有效填空位。' };
      const accepted = Array.isArray(item.acceptedAnswers) ? item.acceptedAnswers.filter(isText).map(function (x) { return x.trim(); }) : [];
      if (!accepted.length) accepted.push(item.answer.trim());
      checkedGoals.push({ prompt: item.prompt.trim(), sentenceTemplate: item.sentenceTemplate.trim(), answer: item.answer.trim(), acceptedAnswers: accepted, hint: isText(item.hint) ? item.hint.trim() : '', explain: isText(item.explain) ? item.explain.trim() : '请对照本课主例句，注意助词和句尾。' });
    }
    const checkedDialogue = [];
    for (let k = 0; k < dialogue.length; k++) {
      const item = dialogue[k] || {};
      if (!isText(item.situation) || !isText(item.partnerLine) || !isText(item.instruction) || !isText(item.referenceAnswer) || !isText(item.followUpLine)) return { ok: false, error: '第 ' + (k + 1) + ' 个语音会话练习格式不完整。' };
      const required = Array.isArray(item.requiredExpressions) ? item.requiredExpressions.filter(isText).map(function (x) { return x.trim(); }) : [];
      if (required.length < 1 || required.length > 2) return { ok: false, error: '第 ' + (k + 1) + ' 个语音会话必须指定 1–2 个本课表达。' };
      checkedDialogue.push({ situation: item.situation.trim(), partnerLine: item.partnerLine.trim(), partnerReading: isText(item.partnerReading) ? item.partnerReading.trim() : '', instruction: item.instruction.trim(), requiredExpressions: required, referenceAnswer: item.referenceAnswer.trim(), referenceReading: isText(item.referenceReading) ? item.referenceReading.trim() : '', referenceCn: isText(item.referenceCn) ? item.referenceCn.trim() : '', followUpLine: item.followUpLine.trim(), followUpReading: isText(item.followUpReading) ? item.followUpReading.trim() : '', followUpCn: isText(item.followUpCn) ? item.followUpCn.trim() : '' });
    }
    return { ok: true, data: { vocabulary: { questions: checkedVocab }, goals: { questions: checkedGoals }, dialogue: { items: checkedDialogue } } };
  }

  function getRecord(lesson) {
    const record = readStore(CACHE_KEY)[lesson.id];
    if (!record || record.version !== SCHEMA_VERSION || !record.data) return null;
    const checked = validatePractice(record.data);
    return checked.ok ? Object.assign({}, record, { data: checked.data }) : null;
  }

  function buildPrompt(lesson) {
    const schema = { vocabulary: { questions: [{ prompt: '中文题干', options: ['选项A', '选项B', '选项C', '选项D'], answerIndex: 0, explain: '仅说明本课知识点' }] }, goals: { questions: [{ prompt: '中文指令', sentenceTemplate: '必须是本课原句，且只有 ___ 一个空', answer: '原句中的连续片段', acceptedAnswers: ['答案'], hint: '本课目标名称或中文提示', explain: '说明本课句型' }] }, dialogue: { items: [{ situation: '仅由本课会话改写的中文情景', partnerLine: '本课风格的对方日语', partnerReading: '假名读音', instruction: '中文口头回应任务', requiredExpressions: ['本课表达'], referenceAnswer: '只使用本课词汇和句型的日语回应', referenceReading: '假名读音', referenceCn: '中文', followUpLine: '对方的简短下一句', followUpReading: '假名读音', followUpCn: '中文' }] } };
    return [
      '你是严格遵循教材范围的日语初学者练习设计师。根据下列“唯一课程来源”生成练习，不允许凭常识补充未给出的词汇、语法、人物、地点或更高难度表达。',
      '难度必须与课程来源完全等阶：若课程是入门句型，题目只能考察本课已有句型的识别、替换和一轮回应；不得出现敬语扩展、过去时、动词变形或本课未出现的句尾。',
      '词汇与短语模块：固定 4 题，全部为四选一。正确项和 3 个干扰项都必须来自本课 vocabulary 或 phrases；同一题只考一个明确词义/读音/使用场景；选项语言形式必须一致；不要使用“以上都对”、否定陷阱或课外同义词。尽量覆盖词汇与短语，不能重复考同一项目。',
      '学习目标模块：固定 3 题。每题对应不同 learningGoals；sentenceTemplate 必须逐字取自该目标的 mainExample 或 examples，只把一个连续的、可学习的片段替换成 ___；答案必须能在课程来源原文中找到；不得自行造句。',
      '语音会话模块：固定 2 个回合。情景、对方台词、参考回应和下一句必须紧贴 dialogue.lines 的人物关系、语气与信息；每题 requiredExpressions 只列 1–2 个且必须来自本课词汇、短语、例句或会话。设计为学习者先听对方、再用日语口头回应；followUpLine 是学习者回应后可播放的简短收束句。',
      '只返回一个合法 JSON 对象，禁止 Markdown、代码围栏和额外文字。固定数量：4 道选择题、3 道单空填空题、2 个语音会话回合。',
      'JSON schema：' + JSON.stringify(schema),
      '唯一课程来源：' + JSON.stringify(sourcePayload(lesson))
    ].join('\n\n');
  }

  function practiceHash(record) { return record ? hashText(JSON.stringify(record.data)) : ''; }
  function blankProgress(lesson, record) { return { sourceHash: getSourceHash(lesson), practiceHash: practiceHash(record), vocabulary: {}, goals: {}, dialogue: {} }; }

  function getProgress(lesson, record) {
    if (!record) return blankProgress(lesson, null);
    const stored = readStore(PROGRESS_KEY)[lesson.id];
    if (!stored || stored.sourceHash !== getSourceHash(lesson) || stored.practiceHash !== practiceHash(record)) return blankProgress(lesson, record);
    return { sourceHash: stored.sourceHash, practiceHash: stored.practiceHash, vocabulary: stored.vocabulary || {}, goals: stored.goals || {}, dialogue: stored.dialogue || {} };
  }

  function updateProgress(lesson, record, mutate) {
    const progress = getProgress(lesson, record);
    mutate(progress);
    const all = readStore(PROGRESS_KEY);
    all[lesson.id] = progress;
    writeStore(PROGRESS_KEY, all);
  }

  function clearProgress(lessonId) {
    const all = readStore(PROGRESS_KEY);
    delete all[lessonId];
    writeStore(PROGRESS_KEY, all);
  }

  function masteryFor(moduleKey, record, progress) {
    if (!record) return { state: 'pending', label: '待生成', detail: '生成练习后开始评估' };
    let questions;
    let answered = 0;
    let correct = 0;
    if (moduleKey === 'vocabulary') {
      questions = record.data.vocabulary.questions;
      questions.forEach(function (question, index) { const answer = progress.vocabulary[index]; if (answer && Number.isInteger(answer.selected)) { answered++; if (answer.selected === question.answerIndex) correct++; } });
      if (answered < 4) return { state: answered ? 'progress' : 'pending', label: answered ? '进行中' : '待完成', detail: '已完成 ' + answered + ' / 4 题' };
      return correct >= 3 ? { state: 'passed', label: '已达标', detail: correct + ' / 4 正确（要求至少 3 题）' } : { state: 'review', label: '待巩固', detail: correct + ' / 4 正确（达标需至少 3 题）' };
    }
    if (moduleKey === 'goals') {
      questions = record.data.goals.questions;
      questions.forEach(function (_, index) { const answer = progress.goals[index]; if (answer && typeof answer.answer === 'string') { answered++; if (answer.correct) correct++; } });
      if (answered < 3) return { state: answered ? 'progress' : 'pending', label: answered ? '进行中' : '待完成', detail: '已完成 ' + answered + ' / 3 题' };
      return correct >= 2 ? { state: 'passed', label: '已达标', detail: correct + ' / 3 正确（要求至少 2 题）' } : { state: 'review', label: '待巩固', detail: correct + ' / 3 正确（达标需至少 2 题）' };
    }
    questions = record.data.dialogue.items;
    questions.forEach(function (_, index) { const answer = progress.dialogue[index]; if (answer && typeof answer.score === 'number') { answered++; correct += answer.score; } });
    if (answered < 2) return { state: answered ? 'progress' : 'pending', label: answered ? '进行中' : '待完成', detail: 'AI 已评估 ' + answered + ' / 2 题' };
    const average = Math.round(correct / answered);
    return average >= 70 ? { state: 'passed', label: '已达标', detail: '会话质量 ' + average + ' 分（要求平均 70 分）' } : { state: 'review', label: '待巩固', detail: '会话质量 ' + average + ' 分（达标需平均 70 分）' };
  }

  function renderMastery(moduleKey, record, progress) {
    const mastery = masteryFor(moduleKey, record, progress);
    return '<div class="practice-mastery is-' + mastery.state + '"><strong>' + escapeHTML(mastery.label) + '</strong><span>' + escapeHTML(mastery.detail) + '</span></div>';
  }

  function renderChoices(questions, progress) {
    return questions.map(function (question, index) {
      const saved = progress.vocabulary[index];
      const selected = saved && Number.isInteger(saved.selected) ? saved.selected : null;
      const correct = selected === question.answerIndex;
      return '<article class="practice-card"><div class="practice-card__number">词汇题 ' + (index + 1) + ' / 4</div><p class="practice-card__prompt">' + escapeHTML(question.prompt) + '</p><div class="practice-options">' + question.options.map(function (option, optionIndex) {
        const state = selected === null ? '' : optionIndex === question.answerIndex ? ' is-correct' : optionIndex === selected ? ' is-wrong' : '';
        return '<button type="button" class="practice-option' + state + '" data-practice-choice="' + index + ',' + optionIndex + '"' + (selected === null ? '' : ' disabled') + '><span>' + String.fromCharCode(65 + optionIndex) + '</span>' + escapeHTML(option) + '</button>';
      }).join('') + '</div><p class="practice-feedback' + (selected === null ? '' : correct ? ' is-correct' : ' is-wrong') + '">' + (selected === null ? '' : (correct ? '✓ 回答正确。' : '正确答案已标出。') + ' ' + escapeHTML(question.explain)) + '</p></article>';
    }).join('');
  }

  function renderGoals(questions, progress) {
    return questions.map(function (question, index) {
      const saved = progress.goals[index];
      const answered = saved && typeof saved.answer === 'string';
      const correct = answered && saved.correct;
      return '<article class="practice-card"><div class="practice-card__number">句型题 ' + (index + 1) + ' / 3</div><p class="practice-card__prompt">' + escapeHTML(question.prompt) + '</p><p class="practice-template">' + escapeHTML(question.sentenceTemplate) + '</p><div class="practice-fill-action"><input type="text" autocomplete="off" data-practice-fill-input="' + index + '" value="' + escapeHTML(answered ? saved.answer : '') + '" placeholder="填写空格中的内容"><button type="button" class="btn btn-outline btn-sm" data-practice-fill-check="' + index + '">检查</button></div>' + (question.hint ? '<p class="practice-hint">提示：' + escapeHTML(question.hint) + '</p>' : '') + '<p class="practice-feedback' + (!answered ? '' : correct ? ' is-correct' : ' is-wrong') + '" data-practice-fill-feedback="' + index + '">' + (!answered ? '' : (correct ? '✓ 正确。' : '还不对。参考答案：' + escapeHTML(question.answer) + '。') + ' ' + escapeHTML(question.explain)) + '</p></article>';
    }).join('');
  }

  function renderDialogues(items, progress) {
    return items.map(function (item, index) {
      const saved = progress.dialogue[index];
      const assessed = saved && typeof saved.score === 'number';
      const followUp = saved && saved.followUpLine ? '<div class="voice-dialogue__followup"><span>AI 对话收束</span><strong>' + escapeHTML(saved.followUpLine) + '</strong>' + (saved.followUpReading ? '<small>' + escapeHTML(saved.followUpReading) + '</small>' : '') + (saved.followUpCn ? '<small>' + escapeHTML(saved.followUpCn) + '</small>' : '') + '<button type="button" class="btn-play" data-practice-followup-play="' + index + '" title="播放 AI 下一句">🔊</button></div>' : '';
      return '<article class="practice-card practice-card--voice"><div class="practice-card__number">语音会话 ' + (index + 1) + ' / 2</div><p class="practice-situation">情景：' + escapeHTML(item.situation) + '</p><div class="voice-dialogue__partner"><span>对方说</span><strong>' + escapeHTML(item.partnerLine) + '</strong>' + (item.partnerReading ? '<small>' + escapeHTML(item.partnerReading) + '</small>' : '') + '<button type="button" class="btn-play" data-practice-partner-play="' + index + '" title="播放对方台词">🔊</button></div><p class="practice-card__prompt">' + escapeHTML(item.instruction) + '</p><p class="voice-dialogue__target">本回合尽量用：' + item.requiredExpressions.map(function (expression) { return '<span>' + escapeHTML(expression) + '</span>'; }).join('') + '</p><textarea data-practice-dialogue-input="' + index + '" placeholder="点击“开始语音对话”后会在这里显示识别文本；也可以手动补充">' + escapeHTML(saved && saved.answer ? saved.answer : '') + '</textarea><p class="voice-dialogue__status" data-practice-voice-status="' + index + '">先听对方，再开口回应。</p><div class="practice-dialogue-actions"><button type="button" class="btn btn-primary btn-sm" data-practice-voice-start="' + index + '">🎙 开始语音对话</button><button type="button" class="btn btn-outline btn-sm" data-practice-reference="' + index + '">查看参考回应</button><button type="button" class="btn btn-outline btn-sm" data-practice-ai-check="' + index + '">AI 会话反馈</button></div><div class="practice-reference" data-practice-reference-result="' + index + '" hidden></div>' + followUp + '<p class="practice-feedback' + (!assessed ? '' : saved.score >= 70 ? ' is-correct' : ' is-wrong') + '" data-practice-dialogue-feedback="' + index + '">' + (!assessed ? '' : 'AI 会话评分：' + saved.score + ' 分。' + escapeHTML(saved.feedback || '')) + '</p></article>';
    }).join('');
  }

  const META = {
    vocabulary: { eyebrow: '模块一配套练习', title: '单词与短语练习', desc: '4 道选择题；完成后按正确率评估掌握程度。' },
    goals: { eyebrow: '模块二配套练习', title: '学习目标练习', desc: '3 道句型填空；完成后按正确率评估掌握程度。' },
    dialogue: { eyebrow: '模块三配套练习', title: '语音应用会话', desc: '听一句、说一句；由高质量会话模型按本课表达即时反馈。' }
  };

  function renderModule(lesson, moduleKey) {
    const meta = META[moduleKey];
    if (!meta) return '';
    const record = getRecord(lesson);
    const progress = getProgress(lesson, record);
    const stale = record && record.sourceHash !== getSourceHash(lesson);
    const hasAI = window.AI && typeof window.AI.hasKey === 'function' && window.AI.hasKey();
    const label = record ? (stale ? '按最新课程重新生成' : '重新生成三组练习') : '生成三组练习';
    let body = '<div class="practice-empty"><div class="practice-empty__icon">✦</div><h4>还没有生成练习</h4><p>生成后，三组固定练习会分别出现在对应学习模块下方。</p></div>';
    if (record && moduleKey === 'vocabulary') body = renderChoices(record.data.vocabulary.questions, progress);
    if (record && moduleKey === 'goals') body = renderGoals(record.data.goals.questions, progress);
    if (record && moduleKey === 'dialogue') body = renderDialogues(record.data.dialogue.items, progress);
    return '<section class="lesson-practice lesson-practice--module" data-lesson-practice="' + escapeHTML(lesson.id) + '" data-practice-module="' + moduleKey + '"><div class="practice-toolbar"><div><p class="practice-eyebrow">' + meta.eyebrow + '</p><h4 class="practice-module-title">' + meta.title + '</h4><p class="practice-toolbar__status">' + (stale ? '课程内容已变化，建议重新生成练习。' : meta.desc) + '</p></div><div class="practice-toolbar__actions"><button type="button" class="btn btn-primary btn-sm" data-practice-generate>' + (hasAI ? '✦ ' + label : '配置 AI 后生成') + '</button>' + (record ? '<button type="button" class="btn btn-outline btn-sm" data-practice-clear>清除练习</button>' : '') + '</div></div>' + renderMastery(moduleKey, record, progress) + '<div class="practice-error" data-practice-error hidden></div><div class="practice-module-body">' + body + '</div></section>';
  }

  function replaceAll(lesson) {
    Array.prototype.slice.call(document.querySelectorAll('[data-lesson-practice]')).forEach(function (root) { root.outerHTML = renderModule(lesson, root.getAttribute('data-practice-module')); });
    bind(lesson);
  }

  function showError(root, message) {
    const error = root.querySelector('[data-practice-error]');
    if (error) { error.textContent = message; error.hidden = false; }
  }

  function generate(lesson, root, button) {
    if (!window.AI || !window.AI.hasKey || !window.AI.hasKey()) { window.location.href = 'ai.html'; return; }
    const oldRecord = getRecord(lesson);
    if (oldRecord && !confirm('重新生成会覆盖三组练习和现有达标记录，确认继续吗？')) return;
    button.disabled = true;
    button.textContent = '正在生成…';
    window.AI.callJSON('lesson_practice', buildPrompt(lesson), { temperature: 0.25, maxTokens: 2200 }).then(function (result) {
      const checked = result.ok ? validatePractice(result.data) : { ok: false, error: result.error };
      if (!checked.ok) { showError(root, '生成失败：' + checked.error); button.disabled = false; button.textContent = '重试生成'; return; }
      const all = readStore(CACHE_KEY);
      all[lesson.id] = { version: SCHEMA_VERSION, sourceHash: getSourceHash(lesson), generatedAt: new Date().toISOString(), model: result.model || '', data: checked.data };
      if (!writeStore(CACHE_KEY, all)) { showError(root, '练习已生成，但浏览器无法保存到本机。'); return; }
      clearProgress(lesson.id);
      replaceAll(lesson);
    });
  }

  function speakJapanese(text) {
    if (window.TTS && typeof window.TTS.speak === 'function') {
      window.TTS.speak(text, { lang: 'ja-JP', rate: 0.86 });
      return true;
    }
    return false;
  }

  function voiceDialoguePrompt(item, answer) {
    return [
      '你是本课专属的日语语音会话教练。学习者通过语音识别提交了回应；识别文本可能有轻微错别字，需结合本课内容善意判断，但不能把明显不同的表达视为正确。',
      '仅按本回合评分：情景回应 40 分，requiredExpressions 的恰当使用 35 分，初学者范围内的自然度与语法 25 分。不得要求或奖励本课未出现的高阶表达。',
      '若回应已基本完成任务，nextPartnerLine 必须原样返回给定的 followUpLine；若未完成，nextPartnerLine 返回空字符串。feedback 为不超过 60 字的中文建议，先肯定有效部分，再指出一个最关键的可改进点。',
      '只返回 JSON，不要 Markdown 或额外文字。JSON schema：{"score":0到100的整数,"feedback":"中文建议","nextPartnerLine":"原样回传或空","nextPartnerReading":"原样回传或空","nextPartnerCn":"原样回传或空"}',
      '情景：' + item.situation,
      '对方说：' + item.partnerLine,
      '本回合任务：' + item.instruction,
      '本课必练表达：' + item.requiredExpressions.join('、'),
      '参考回应：' + item.referenceAnswer,
      '可播放的下一句：' + item.followUpLine,
      '下一句读音：' + item.followUpReading,
      '下一句中文：' + item.followUpCn,
      '学习者语音识别文本：' + answer
    ].join('\n');
  }

  function validateAssessment(raw) {
    const score = raw && Number(raw.score);
    if (!Number.isFinite(score) || score < 0 || score > 100 || !isText(raw.feedback)) return { ok: false, error: 'AI 返回的会话反馈格式不完整，请重试。' };
    return { ok: true, data: { score: Math.round(score), feedback: raw.feedback.trim(), nextPartnerLine: isText(raw.nextPartnerLine) ? raw.nextPartnerLine.trim() : '', nextPartnerReading: isText(raw.nextPartnerReading) ? raw.nextPartnerReading.trim() : '', nextPartnerCn: isText(raw.nextPartnerCn) ? raw.nextPartnerCn.trim() : '' } };
  }

  function bind(lesson) {
    document.querySelectorAll('[data-lesson-practice]').forEach(function (root) {
      if (root._practiceBound) return;
      root._practiceBound = true;
      const record = getRecord(lesson);
      const generateButton = root.querySelector('[data-practice-generate]');
      if (generateButton) generateButton.addEventListener('click', function () { generate(lesson, root, generateButton); });
      const clearButton = root.querySelector('[data-practice-clear]');
      if (clearButton) clearButton.addEventListener('click', function () {
        if (!confirm('清除本课三组练习及达标记录吗？')) return;
        const all = readStore(CACHE_KEY); delete all[lesson.id]; writeStore(CACHE_KEY, all); clearProgress(lesson.id); replaceAll(lesson);
      });
      if (!record) return;
      root.querySelectorAll('[data-practice-choice]').forEach(function (button) {
        button.addEventListener('click', function () {
          const parts = button.getAttribute('data-practice-choice').split(',');
          updateProgress(lesson, record, function (progress) { progress.vocabulary[Number(parts[0])] = { selected: Number(parts[1]) }; });
          replaceAll(lesson);
        });
      });
      root.querySelectorAll('[data-practice-fill-check]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-fill-check'));
          const question = record.data.goals.questions[index];
          const input = root.querySelector('[data-practice-fill-input="' + index + '"]');
          const feedback = root.querySelector('[data-practice-fill-feedback="' + index + '"]');
          if (!question || !input) return;
          const answer = input.value.trim();
          if (!answer) { if (feedback) { feedback.textContent = '请先填写答案。'; feedback.className = 'practice-feedback is-wrong'; } return; }
          const correct = question.acceptedAnswers.some(function (item) { return normalizeText(item) === normalizeText(answer); });
          updateProgress(lesson, record, function (progress) { progress.goals[index] = { answer: answer, correct: correct }; });
          replaceAll(lesson);
        });
      });
      root.querySelectorAll('[data-practice-reference]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-reference'));
          const item = record.data.dialogue.items[index];
          const result = root.querySelector('[data-practice-reference-result="' + index + '"]');
          if (!item || !result) return;
          result.innerHTML = '<strong>参考回应</strong><span>' + escapeHTML(item.referenceAnswer) + '</span>' + (item.referenceReading ? '<small>' + escapeHTML(item.referenceReading) + '</small>' : '') + (item.referenceCn ? '<small>' + escapeHTML(item.referenceCn) + '</small>' : '');
          result.hidden = false;
        });
      });
      root.querySelectorAll('[data-practice-partner-play]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-partner-play'));
          const item = record.data.dialogue.items[index];
          if (item) speakJapanese(item.partnerLine);
        });
      });
      root.querySelectorAll('[data-practice-followup-play]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-followup-play'));
          const saved = getProgress(lesson, record).dialogue[index];
          if (saved && saved.followUpLine) speakJapanese(saved.followUpLine);
        });
      });
      root.querySelectorAll('[data-practice-voice-start]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-voice-start'));
          const item = record.data.dialogue.items[index];
          const input = root.querySelector('[data-practice-dialogue-input="' + index + '"]');
          const status = root.querySelector('[data-practice-voice-status="' + index + '"]');
          if (!item || !input) return;
          speakJapanese(item.partnerLine);
          const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
          if (!Recognition) {
            if (status) status.textContent = '当前浏览器不支持语音识别：已播放对方台词，请在下方输入回应后获取 AI 会话反馈。';
            return;
          }
          const recognition = new Recognition();
          recognition.lang = 'ja-JP';
          recognition.continuous = false;
          recognition.interimResults = true;
          button.disabled = true;
          button.textContent = '正在聆听…';
          if (status) status.textContent = '请用日语回答；结束说话后会自动转写。';
          recognition.onresult = function (event) {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
            if (transcript) input.value = transcript.trim();
            if (status && transcript) status.textContent = '已识别：' + transcript.trim() + '。确认后点击“AI 会话反馈”。';
          };
          recognition.onerror = function () { if (status) status.textContent = '没有识别到清晰语音，请再试一次或直接在下方补充文字。'; };
          recognition.onend = function () { button.disabled = false; button.textContent = '🎙 开始语音对话'; };
          try { recognition.start(); } catch (e) { button.disabled = false; button.textContent = '🎙 开始语音对话'; if (status) status.textContent = '语音识别暂时不可用，请直接输入回应。'; }
        });
      });
      root.querySelectorAll('[data-practice-ai-check]').forEach(function (button) {
        button.addEventListener('click', function () {
          const index = Number(button.getAttribute('data-practice-ai-check'));
          const item = record.data.dialogue.items[index];
          const input = root.querySelector('[data-practice-dialogue-input="' + index + '"]');
          const feedback = root.querySelector('[data-practice-dialogue-feedback="' + index + '"]');
          const answer = input && input.value.trim();
          if (!item || !answer) { if (feedback) { feedback.textContent = '请先写下你的日语回应。'; feedback.className = 'practice-feedback is-wrong'; } return; }
          if (!window.AI || !window.AI.hasKey || !window.AI.hasKey()) { window.location.href = 'ai.html'; return; }
          button.disabled = true;
          button.textContent = '对话分析中…';
          window.AI.callJSON('voice_dialogue', voiceDialoguePrompt(item, answer), { temperature: 0.15, maxTokens: 320 }).then(function (result) {
            const checked = result.ok ? validateAssessment(result.data) : { ok: false, error: result.error };
            if (!checked.ok) { if (feedback) { feedback.textContent = 'AI 会话反馈失败：' + checked.error; feedback.className = 'practice-feedback is-wrong'; } button.disabled = false; button.textContent = 'AI 会话反馈'; return; }
            updateProgress(lesson, record, function (progress) { progress.dialogue[index] = { answer: answer, score: checked.data.score, feedback: checked.data.feedback, followUpLine: checked.data.nextPartnerLine, followUpReading: checked.data.nextPartnerReading, followUpCn: checked.data.nextPartnerCn }; });
            replaceAll(lesson);
          });
        });
      });
    });
  }

  window.Practice = { renderModule: renderModule, bind: bind, validate: validatePractice, getSourceHash: getSourceHash, getMastery: masteryFor };
})();
