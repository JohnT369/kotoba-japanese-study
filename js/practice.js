/* ============================================================
   practice.js - 固定课程练习、模块达标评估与 AI 评分
   单词短语：4 道选择题，至少答对 3 题达标
   学习目标：3 道填空题，至少答对 2 题达标
   应用会话：2 个情景回应，AI 平均评分至少 70 分达标
   ============================================================ */

(function () {
  'use strict';

  const CACHE_KEY = 'jp_lesson_practice_v1';
  const PROGRESS_KEY = 'jp_lesson_practice_progress_v1';
  const SCHEMA_VERSION = 1;

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
      vocabulary: (lesson.vocabulary || []).map(function (item) { return { word: item.word || '', reading: item.reading || '', meaning: item.meaning || '' }; }),
      phrases: (lesson.phrases || []).map(function (item) { return { phrase: item.phrase || '', reading: item.reading || '', meaning: item.meaning || '' }; }),
      learningGoals: goals.map(function (goal) {
        const main = goal.mainExample || {};
        return { title: goal.goalTitle || '', mainExample: { jp: main.jp || '', reading: main.reading || '', cn: main.cn || '' }, examples: (goal.examples || []).map(function (ex) { return { jp: ex.jp || '', reading: ex.reading || '', cn: ex.cn || '' }; }) };
      }),
      dialogue: { title: dialogue.title || '', lines: (dialogue.lines || []).map(function (line) { return { speaker: line.speaker || '', jp: line.jp || '', cn: line.cn || '' }; }) }
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
      if (!isText(item.situation) || !isText(item.partnerLine) || !isText(item.instruction) || !isText(item.referenceAnswer)) return { ok: false, error: '第 ' + (k + 1) + ' 个会话练习格式不完整。' };
      checkedDialogue.push({ situation: item.situation.trim(), partnerLine: item.partnerLine.trim(), instruction: item.instruction.trim(), referenceAnswer: item.referenceAnswer.trim(), referenceReading: isText(item.referenceReading) ? item.referenceReading.trim() : '', referenceCn: isText(item.referenceCn) ? item.referenceCn.trim() : '' });
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
    const schema = { vocabulary: { questions: [{ prompt: '题干', options: ['A', 'B', 'C', 'D'], answerIndex: 0, explain: '解析' }] }, goals: { questions: [{ prompt: '题干', sentenceTemplate: '日文 ___', answer: '答案', acceptedAnswers: ['答案'], hint: '提示', explain: '解析' }] }, dialogue: { items: [{ situation: '中文情景', partnerLine: '对方日文', instruction: '中文指令', referenceAnswer: '参考日文回应', referenceReading: '假名', referenceCn: '中文' }] } };
    return ['根据下列课程内容生成固定练习，只使用给定词汇、短语、学习目标和会话语境。', '只返回一个合法 JSON 对象，禁止 Markdown、代码围栏和额外文字。', '固定数量：4 道选择题、3 道且仅有一个 ___ 的填空题、2 个会话回应题。', 'JSON schema：' + JSON.stringify(schema), '课程内容：' + JSON.stringify(sourcePayload(lesson))].join('\n\n');
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
      return '<article class="practice-card"><div class="practice-card__number">会话题 ' + (index + 1) + ' / 2</div><p class="practice-situation">情景：' + escapeHTML(item.situation) + '</p><p class="practice-partner">对方：' + escapeHTML(item.partnerLine) + '</p><p class="practice-card__prompt">' + escapeHTML(item.instruction) + '</p><textarea data-practice-dialogue-input="' + index + '" placeholder="用日语写一句回应">' + escapeHTML(saved && saved.answer ? saved.answer : '') + '</textarea><div class="practice-dialogue-actions"><button type="button" class="btn btn-outline btn-sm" data-practice-reference="' + index + '">查看参考回应</button><button type="button" class="btn btn-primary btn-sm" data-practice-ai-check="' + index + '">AI 评估</button></div><div class="practice-reference" data-practice-reference-result="' + index + '" hidden></div><p class="practice-feedback' + (!assessed ? '' : saved.score >= 70 ? ' is-correct' : ' is-wrong') + '" data-practice-dialogue-feedback="' + index + '">' + (!assessed ? '' : 'AI 评分：' + saved.score + ' 分。' + escapeHTML(saved.feedback || '')) + '</p></article>';
    }).join('');
  }

  const META = {
    vocabulary: { eyebrow: '模块一配套练习', title: '单词与短语练习', desc: '4 道选择题；完成后按正确率评估掌握程度。' },
    goals: { eyebrow: '模块二配套练习', title: '学习目标练习', desc: '3 道句型填空；完成后按正确率评估掌握程度。' },
    dialogue: { eyebrow: '模块三配套练习', title: '应用会话练习', desc: '2 个情景回应；由 AI 按完成质量评分。' }
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

  function assessmentPrompt(item, answer) {
    return ['评估学习者的日语会话回应。只返回 JSON，不要 Markdown 或额外文字。', '评分：回应情景 40 分，使用本课合适表达 35 分，日语自然与语法 25 分。', 'JSON schema：{"score":0到100的整数,"feedback":"不超过60字的中文改进建议"}', '情景：' + item.situation, '对方说：' + item.partnerLine, '作答要求：' + item.instruction, '参考回应：' + item.referenceAnswer, '学习者回应：' + answer].join('\n');
  }

  function validateAssessment(raw) {
    const score = raw && Number(raw.score);
    if (!Number.isFinite(score) || score < 0 || score > 100 || !isText(raw.feedback)) return { ok: false, error: 'AI 返回的评分格式不完整，请重试。' };
    return { ok: true, data: { score: Math.round(score), feedback: raw.feedback.trim() } };
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
          button.textContent = '评估中…';
          window.AI.callJSON('dialogue_assess', assessmentPrompt(item, answer), { temperature: 0.2, maxTokens: 260 }).then(function (result) {
            const checked = result.ok ? validateAssessment(result.data) : { ok: false, error: result.error };
            if (!checked.ok) { if (feedback) { feedback.textContent = 'AI 评估失败：' + checked.error; feedback.className = 'practice-feedback is-wrong'; } button.disabled = false; button.textContent = 'AI 评估'; return; }
            updateProgress(lesson, record, function (progress) { progress.dialogue[index] = { answer: answer, score: checked.data.score, feedback: checked.data.feedback }; });
            replaceAll(lesson);
          });
        });
      });
    });
  }

  window.Practice = { renderModule: renderModule, bind: bind, validate: validatePractice, getSourceHash: getSourceHash, getMastery: masteryFor };
})();
