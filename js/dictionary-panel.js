/* Lightweight lesson-side drawer. It renders the course context first, then
 * enriches it through the same-origin dictionary adapter without blocking study. */
(function () {
  'use strict';

  let drawer = null;
  let active = null;
  let requestId = 0;
  const responseCache = new Map();

  function escapeHTML(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function ensureDrawer() {
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.className = 'dictionary-drawer-shell';
    drawer.hidden = true;
    drawer.innerHTML = '<div class="dictionary-drawer__backdrop" aria-hidden="true"></div><aside class="dictionary-drawer" role="dialog" aria-modal="true" aria-labelledby="dictionaryDrawerTitle"><div id="dictionaryDrawerBody"></div></aside>';
    document.body.appendChild(drawer);
    drawer.querySelector('.dictionary-drawer__backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !drawer.hidden) close(); });
    drawer.addEventListener('click', function (event) {
      if (event.target.closest('[data-drawer-speak]') && active && window.TTS) window.TTS.speak(active.context.term, { lang: 'ja-JP' });
    });
    return drawer;
  }

  function render() {
    const body = drawer && drawer.querySelector('#dictionaryDrawerBody');
    if (!body || !active) return;
    const context = active.context;
    const remote = active.remote && active.remote.entries && active.remote.entries[0];
    const primarySense = remote && remote.senses && remote.senses[0];
    const english = primarySense && primarySense.definitions || [];
    const parts = remote && remote.partsOfSpeech || [];
    const forms = remote && remote.forms || [];
    const jlpt = remote && remote.jlpt || [];
    const examples = (context.examples || []).slice(0, 2);
    const alternate = remote && remote.alternateReadings && remote.alternateReadings.length
      ? '<p class="dictionary-drawer__alternate">其他写法：' + remote.alternateReadings.map(function (item) { return escapeHTML(item.word || item.reading); }).filter(Boolean).join('、') + '</p>' : '';
    const remoteContent = active.loading
      ? '<div class="dictionary-drawer__loading">正在查询标准词典信息…</div>'
      : active.error
        ? '<div class="dictionary-drawer__notice">' + escapeHTML(active.error) + '</div>'
        : remote
          ? '<section class="dictionary-drawer__section"><p class="dictionary-drawer__label">标准释义 · English</p><ul class="dictionary-drawer__definitions">' + english.map(function (definition) { return '<li>' + escapeHTML(definition) + '</li>'; }).join('') + '</ul>' +
            (parts.length ? '<div class="dictionary-drawer__chips">' + parts.map(function (part) { return '<span>' + escapeHTML(part) + '</span>'; }).join('') + '</div>' : '') +
            (forms.length ? '<div class="dictionary-drawer__forms"><strong>常见变形</strong><span>' + forms.map(escapeHTML).join(' · ') + '</span></div>' : '') +
            (remote.resolvedFrom ? '<p class="dictionary-drawer__resolved">已将「' + escapeHTML(remote.resolvedFrom) + '」还原为词典形。</p>' : '') +
            '<p class="dictionary-drawer__source">词典数据：' + escapeHTML(active.remote.attribution || 'Jisho.org / JMdict') + '</p></section>'
          : '<div class="dictionary-drawer__notice">没有找到标准词典条目。你仍可使用本课释义与例句学习。</div>';
    body.innerHTML = '<div class="dictionary-drawer__header"><div><p class="dictionary-drawer__eyebrow">课内词典</p><h2 id="dictionaryDrawerTitle">' + escapeHTML(context.term) + '</h2>' +
      (context.reading ? '<p class="dictionary-drawer__reading">' + escapeHTML(context.reading) + '</p>' : '') + alternate + '</div></div>' +
      '<div class="dictionary-drawer__actions"><button type="button" class="btn btn-outline btn-sm" data-drawer-speak>🔊 朗读</button>' +
      '<a class="btn btn-primary btn-sm" href="dictionary.html?q=' + encodeURIComponent(context.term) + '">打开完整词典</a>' +
      (jlpt.length ? '<span class="dictionary-drawer__jlpt">' + jlpt.map(escapeHTML).join(' / ') + '</span>' : '') + '</div>' +
      '<section class="dictionary-drawer__section dictionary-drawer__course"><p class="dictionary-drawer__label">本课释义</p><p class="dictionary-drawer__meaning">' + escapeHTML(context.meaning || '暂未填写中文释义') + '</p>' +
      (context.type ? '<span class="dictionary-drawer__course-type">' + escapeHTML(context.type) + '</span>' : '') +
      (context.note ? '<p class="dictionary-drawer__note">' + escapeHTML(context.note) + '</p>' : '') + '</section>' +
      remoteContent +
      '<section class="dictionary-drawer__section"><p class="dictionary-drawer__label">课内例句</p>' +
      (examples.length ? '<div class="dictionary-drawer__examples">' + examples.map(function (example) { return '<article><p lang="ja">' + escapeHTML(example.jp) + '</p>' + (example.reading ? '<small>' + escapeHTML(example.reading) + '</small>' : '') + (example.cn ? '<span>' + escapeHTML(example.cn) + '</span>' : '') + '</article>'; }).join('') + '</div>' : '<p class="dictionary-drawer__empty">本课暂无包含该词的例句。</p>') + '</section>';
  }

  function close() {
    if (!drawer) return;
    drawer.hidden = true;
    document.body.classList.remove('is-dictionary-drawer-open');
  }

  async function fetchEntry(term, id) {
    if (responseCache.has(term)) return responseCache.get(term);
    const response = await fetch('/api/dictionary?q=' + encodeURIComponent(term), { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(function () { return {}; });
    if (!response.ok || !payload.ok) throw new Error(payload.error || '词典服务暂时不可用，请稍后重试。');
    responseCache.set(term, payload);
    return payload;
  }

  function open(context) {
    if (!context || !context.term) return;
    ensureDrawer();
    const id = ++requestId;
    active = { context: context, loading: true, remote: null, error: '' };
    drawer.hidden = false;
    document.body.classList.add('is-dictionary-drawer-open');
    render();
    fetchEntry(context.term, id).then(function (payload) {
      if (id !== requestId) return;
      active.loading = false; active.remote = payload; render();
    }).catch(function (error) {
      if (id !== requestId) return;
      active.loading = false; active.error = error && error.message || '词典服务暂时不可用，请稍后重试。'; render();
    });
  }

  window.DictionaryPanel = { open: open, close: close };
})();
