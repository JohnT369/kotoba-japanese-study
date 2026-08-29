/* Course dictionary: indexes the learner's current, editable course vocabulary.
 * Personal word states live in App's synced learning snapshot, so the feature
 * works offline first and follows the user after sign-in without a second store. */
(function () {
  'use strict';

  const STORE_KEY = 'dictionary';

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, '').toLocaleLowerCase();
  }

  function hashId(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return 'dict-' + (hash >>> 0).toString(36);
  }

  function sourceFor(lesson) {
    return {
      lessonId: String(lesson.id || ''),
      title: String(lesson.title || '未命名课时'),
      sequence: Number(lesson.sequence) || 0
    };
  }

  function buildEntries(lessons, isArchived) {
    const byKey = {};
    (lessons || []).forEach(function (lesson) {
      if (!lesson || (typeof isArchived === 'function' && isArchived(lesson.id))) return;
      const source = sourceFor(lesson);
      function add(raw, kind) {
        const term = String(raw && (raw.word || raw.phrase) || '').trim();
        if (!term) return;
        const reading = String(raw.reading || '').trim();
        const key = normalize(term) + '|' + normalize(reading);
        const item = byKey[key] || {
          id: hashId(key), term: term, reading: reading,
          meaning: String(raw.meaning || '').trim(), kind: kind,
          type: String(raw.type || '').trim(), accent: String(raw.accent == null ? '' : raw.accent).trim(),
          note: String(raw.note || '').trim(), sources: []
        };
        if (!item.meaning && raw.meaning) item.meaning = String(raw.meaning);
        if (!item.type && raw.type) item.type = String(raw.type);
        if (!item.note && raw.note) item.note = String(raw.note);
        if (!item.sources.some(function (itemSource) { return itemSource.lessonId === source.lessonId; })) item.sources.push(source);
        byKey[key] = item;
      }
      (lesson.vocabulary || []).forEach(function (word) { add(word, 'word'); });
      (lesson.phrases || []).forEach(function (phrase) { add(phrase, 'phrase'); });
    });
    return Object.keys(byKey).map(function (key) {
      const entry = byKey[key];
      entry.sources.sort(function (a, b) { return a.sequence - b.sequence || a.title.localeCompare(b.title, 'zh-CN'); });
      return entry;
    }).sort(function (a, b) { return a.term.localeCompare(b.term, 'ja'); });
  }

  function searchEntries(entries, query) {
    const q = normalize(query);
    if (!q) return entries;
    return entries.filter(function (entry) {
      return [entry.term, entry.reading, entry.meaning, entry.type, entry.note].some(function (value) {
        return normalize(value).includes(q);
      });
    });
  }

  function loadStore() {
    const raw = window.App && App.getLearningStore ? App.getLearningStore(STORE_KEY, { entries: {} }) : { entries: {} };
    return raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object' ? raw : { entries: {} };
  }

  function saveStore(store) {
    if (window.App && App.setLearningStore) App.setLearningStore(STORE_KEY, store);
  }

  function snapshot(entry, status) {
    return {
      id: entry.id, term: entry.term, reading: entry.reading, meaning: entry.meaning,
      kind: entry.kind, type: entry.type, accent: entry.accent, note: entry.note,
      sources: entry.sources || [], status: status || 'saved', updatedAt: new Date().toISOString()
    };
  }

  function setSaved(entry, saved) {
    const store = loadStore();
    if (saved) store.entries[entry.id] = snapshot(entry, (store.entries[entry.id] || {}).status || 'saved');
    else delete store.entries[entry.id];
    saveStore(store);
    return store;
  }

  function setStatus(entry, status) {
    const store = loadStore();
    store.entries[entry.id] = snapshot(entry, status);
    saveStore(store);
    return store;
  }

  function scheduleNow(entry) {
    setSaved(entry, true);
    if (window.App && App.recordReviewItem) {
      App.recordReviewItem({
        id: 'dict:' + entry.id, type: 'dictionary', label: '单词：' + entry.term,
        detail: (entry.reading ? entry.reading + ' · ' : '') + (entry.meaning || '回顾这个词的意思'),
        href: 'dictionary.html?review=' + encodeURIComponent(entry.id), dueNow: true
      }, false);
    }
  }

  function allEntries() {
    const lessons = window.App && App.getLessons ? App.getLessons() : [];
    const archived = window.App && App.isLessonArchived ? App.isLessonArchived : function () { return false; };
    const indexed = buildEntries(lessons, archived);
    const byId = {};
    indexed.forEach(function (entry) { byId[entry.id] = entry; });
    const store = loadStore();
    Object.keys(store.entries).forEach(function (id) {
      if (!byId[id]) byId[id] = store.entries[id];
    });
    return Object.keys(byId).map(function (id) { return byId[id]; });
  }

  function card(entry, record, reviewMode, revealed) {
    const saved = !!record;
    const status = saved ? record.status || 'saved' : '';
    const sourceHTML = (entry.sources || []).map(function (source) {
      return '<a href="lesson.html?id=' + encodeURIComponent(source.lessonId) + '" class="dictionary-source">第' + escapeHTML(source.sequence || '—') + '课 · ' + escapeHTML(source.title) + '</a>';
    }).join('');
    const tags = [entry.kind === 'phrase' ? '短语' : '单词', entry.type, entry.accent ? '重音 ' + entry.accent : ''].filter(Boolean)
      .map(function (tag) { return '<span>' + escapeHTML(tag) + '</span>'; }).join('');
    const reviewAnswer = reviewMode && !revealed
      ? '<div class="dictionary-review-answer is-hidden"><p>先在心里回想中文释义，再显示答案。</p></div>'
      : '<div class="dictionary-meaning">' + escapeHTML(entry.meaning || '暂未填写中文释义') + '</div>';
    const normalActions =
      '<button type="button" class="btn btn-outline btn-sm" data-dict-action="speak" data-dict-id="' + entry.id + '">🔊 朗读</button>' +
      '<button type="button" class="btn ' + (saved ? 'btn-outline' : 'btn-primary') + ' btn-sm" data-dict-action="save" data-dict-id="' + entry.id + '">' + (saved ? '取消收藏' : '收藏') + '</button>' +
      (saved ? '<button type="button" class="btn btn-outline btn-sm" data-dict-action="status" data-dict-status="' + (status === 'saved' ? 'learning' : status === 'learning' ? 'mastered' : 'learning') + '" data-dict-id="' + entry.id + '">' + (status === 'saved' ? '开始学习' : status === 'learning' ? '标记已掌握' : '改为学习中') + '</button>' : '') +
      '<button type="button" class="btn btn-outline btn-sm" data-dict-action="review" data-dict-id="' + entry.id + '">加入今日复习</button>';
    const reviewActions = revealed
      ? '<button type="button" class="btn btn-success btn-sm" data-dict-action="review-result" data-dict-result="correct" data-dict-id="' + entry.id + '">记住了</button><button type="button" class="btn btn-outline btn-sm" data-dict-action="review-result" data-dict-result="wrong" data-dict-id="' + entry.id + '">需要巩固</button>'
      : '<button type="button" class="btn btn-primary btn-sm" data-dict-action="reveal" data-dict-id="' + entry.id + '">显示释义</button>';
    return '<article class="dictionary-card" data-dict-entry="' + entry.id + '">' +
      '<div class="dictionary-card__main"><div class="dictionary-term-row"><h3>' + escapeHTML(entry.term) + '</h3>' + (saved ? '<span class="dictionary-status is-' + escapeHTML(status) + '">' + (status === 'mastered' ? '已掌握' : status === 'learning' ? '学习中' : '已收藏') + '</span>' : '') + '</div>' +
      (entry.reading ? '<p class="dictionary-reading">' + escapeHTML(entry.reading) + '</p>' : '') + reviewAnswer +
      (entry.note ? '<p class="dictionary-note">' + escapeHTML(entry.note) + '</p>' : '') +
      '<div class="dictionary-tags">' + tags + '</div>' +
      (sourceHTML ? '<div class="dictionary-sources"><span>来源</span>' + sourceHTML + '</div>' : '') +
      '</div><div class="dictionary-actions">' + (reviewMode ? reviewActions : normalActions) + '</div></article>';
  }

  function init() {
    const root = document.getElementById('dictionaryResults');
    const form = document.getElementById('dictionarySearch');
    const input = document.getElementById('dictionaryQuery');
    const summary = document.getElementById('dictionarySummary');
    if (!root || !form || !input || !summary) return;
    const params = new URLSearchParams(window.location.search);
    let query = params.get('q') || '';
    let filter = 'all';
    let reviewId = params.get('review') || '';
    let revealed = false;
    input.value = query;

    function render() {
      const store = loadStore();
      const entries = allEntries();
      const savedCount = Object.keys(store.entries).length;
      const savedNode = document.getElementById('dictionarySavedCount');
      if (savedNode) savedNode.textContent = savedCount;
      let visible = searchEntries(entries, query);
      if (reviewId) visible = entries.filter(function (entry) { return entry.id === reviewId; });
      else if (filter !== 'all') visible = visible.filter(function (entry) { return store.entries[entry.id] && (filter === 'saved' || store.entries[entry.id].status === filter); });
      document.querySelectorAll('[data-dictionary-filter]').forEach(function (button) { button.classList.toggle('is-active', button.getAttribute('data-dictionary-filter') === filter); });
      if (reviewId) summary.textContent = visible.length ? '复习模式：先回想释义，再自行判断掌握程度。' : '这项复习内容已不存在，可回到课程词表继续学习。';
      else summary.textContent = query ? '找到 ' + visible.length + ' 个匹配项' : (filter === 'all' ? '当前编辑词表共 ' + entries.length + ' 项' : '共 ' + visible.length + ' 项');
      root.innerHTML = visible.length ? visible.map(function (entry) { return card(entry, store.entries[entry.id], !!reviewId, revealed); }).join('') :
        '<div class="dictionary-empty"><h3>没有找到对应词条</h3><p>试试日文、假名或中文释义。词典会随课程词表与编辑内容更新。</p><a class="btn btn-primary" href="courses.html">回到课程路线 →</a></div>';
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      query = input.value.trim(); reviewId = ''; revealed = false;
      const next = new URLSearchParams(); if (query) next.set('q', query);
      history.replaceState(null, '', 'dictionary.html' + (next.toString() ? '?' + next.toString() : ''));
      render();
    });
    document.querySelectorAll('[data-dictionary-filter]').forEach(function (button) {
      button.addEventListener('click', function () { filter = button.getAttribute('data-dictionary-filter') || 'all'; reviewId = ''; revealed = false; render(); });
    });
    root.addEventListener('click', function (event) {
      const button = event.target.closest('[data-dict-action]');
      if (!button) return;
      const entry = allEntries().find(function (item) { return item.id === button.getAttribute('data-dict-id'); });
      if (!entry) return;
      const action = button.getAttribute('data-dict-action');
      if (action === 'speak' && window.TTS) window.TTS.speak(entry.term, { lang: 'ja-JP' });
      if (action === 'save') setSaved(entry, !loadStore().entries[entry.id]);
      if (action === 'status') setStatus(entry, button.getAttribute('data-dict-status') || 'learning');
      if (action === 'review') scheduleNow(entry);
      if (action === 'reveal') revealed = true;
      if (action === 'review-result' && window.App && App.recordReviewItem) {
        App.recordReviewItem({ id: 'dict:' + entry.id, type: 'dictionary', label: '单词：' + entry.term, detail: entry.meaning || '', href: 'dictionary.html?review=' + encodeURIComponent(entry.id) }, button.getAttribute('data-dict-result') === 'correct');
        setStatus(entry, button.getAttribute('data-dict-result') === 'correct' ? 'mastered' : 'learning');
        reviewId = ''; revealed = false;
      }
      render();
    });
    render();
  }

  window.Dictionary = { buildEntries: buildEntries, searchEntries: searchEntries };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
