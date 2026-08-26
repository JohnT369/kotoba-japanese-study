/* ============================================================
   kana.js - 假名训练区逻辑
   依赖：window.TTS（朗读）、window.App（LocalStorage 工具可选）
   LocalStorage Key: jp_kana_stats_v1
   结构：{ "hiragana:seion": { total: N, correct: M }, ... }
   ============================================================ */

(function () {
  'use strict';

  // ---------- 假名数据 ----------
  // 每条：{ kana: 假名, romaji: 罗马音 }
  // 清音 46 音（含 ん）
  const SEION_HIRA = [
    { kana: 'あ', romaji: 'a' }, { kana: 'い', romaji: 'i' }, { kana: 'う', romaji: 'u' }, { kana: 'え', romaji: 'e' }, { kana: 'お', romaji: 'o' },
    { kana: 'か', romaji: 'ka' }, { kana: 'き', romaji: 'ki' }, { kana: 'く', romaji: 'ku' }, { kana: 'け', romaji: 'ke' }, { kana: 'こ', romaji: 'ko' },
    { kana: 'さ', romaji: 'sa' }, { kana: 'し', romaji: 'shi' }, { kana: 'す', romaji: 'su' }, { kana: 'せ', romaji: 'se' }, { kana: 'そ', romaji: 'so' },
    { kana: 'た', romaji: 'ta' }, { kana: 'ち', romaji: 'chi' }, { kana: 'つ', romaji: 'tsu' }, { kana: 'て', romaji: 'te' }, { kana: 'と', romaji: 'to' },
    { kana: 'な', romaji: 'na' }, { kana: 'に', romaji: 'ni' }, { kana: 'ぬ', romaji: 'nu' }, { kana: 'ね', romaji: 'ne' }, { kana: 'の', romaji: 'no' },
    { kana: 'は', romaji: 'ha' }, { kana: 'ひ', romaji: 'hi' }, { kana: 'ふ', romaji: 'fu' }, { kana: 'へ', romaji: 'he' }, { kana: 'ほ', romaji: 'ho' },
    { kana: 'ま', romaji: 'ma' }, { kana: 'み', romaji: 'mi' }, { kana: 'む', romaji: 'mu' }, { kana: 'め', romaji: 'me' }, { kana: 'も', romaji: 'mo' },
    { kana: 'や', romaji: 'ya' }, { kana: 'ゆ', romaji: 'yu' }, { kana: 'よ', romaji: 'yo' },
    { kana: 'ら', romaji: 'ra' }, { kana: 'り', romaji: 'ri' }, { kana: 'る', romaji: 'ru' }, { kana: 'れ', romaji: 're' }, { kana: 'ろ', romaji: 'ro' },
    { kana: 'わ', romaji: 'wa' }, { kana: 'を', romaji: 'wo' }, { kana: 'ん', romaji: 'n' }
  ];

  const SEION_KATA = [
    { kana: 'ア', romaji: 'a' }, { kana: 'イ', romaji: 'i' }, { kana: 'ウ', romaji: 'u' }, { kana: 'エ', romaji: 'e' }, { kana: 'オ', romaji: 'o' },
    { kana: 'カ', romaji: 'ka' }, { kana: 'キ', romaji: 'ki' }, { kana: 'ク', romaji: 'ku' }, { kana: 'ケ', romaji: 'ke' }, { kana: 'コ', romaji: 'ko' },
    { kana: 'サ', romaji: 'sa' }, { kana: 'シ', romaji: 'shi' }, { kana: 'ス', romaji: 'su' }, { kana: 'セ', romaji: 'se' }, { kana: 'ソ', romaji: 'so' },
    { kana: 'タ', romaji: 'ta' }, { kana: 'チ', romaji: 'chi' }, { kana: 'ツ', romaji: 'tsu' }, { kana: 'テ', romaji: 'te' }, { kana: 'ト', romaji: 'to' },
    { kana: 'ナ', romaji: 'na' }, { kana: 'ニ', romaji: 'ni' }, { kana: 'ヌ', romaji: 'nu' }, { kana: 'ネ', romaji: 'ne' }, { kana: 'ノ', romaji: 'no' },
    { kana: 'ハ', romaji: 'ha' }, { kana: 'ヒ', romaji: 'hi' }, { kana: 'フ', romaji: 'fu' }, { kana: 'ヘ', romaji: 'he' }, { kana: 'ホ', romaji: 'ho' },
    { kana: 'マ', romaji: 'ma' }, { kana: 'ミ', romaji: 'mi' }, { kana: 'ム', romaji: 'mu' }, { kana: 'メ', romaji: 'me' }, { kana: 'モ', romaji: 'mo' },
    { kana: 'ヤ', romaji: 'ya' }, { kana: 'ユ', romaji: 'yu' }, { kana: 'ヨ', romaji: 'yo' },
    { kana: 'ラ', romaji: 'ra' }, { kana: 'リ', romaji: 'ri' }, { kana: 'ル', romaji: 'ru' }, { kana: 'レ', romaji: 're' }, { kana: 'ロ', romaji: 'ro' },
    { kana: 'ワ', romaji: 'wa' }, { kana: 'ヲ', romaji: 'wo' }, { kana: 'ン', romaji: 'n' }
  ];

  // 浊音 / 半浊音
  const DAKUON_HIRA = [
    { kana: 'が', romaji: 'ga' }, { kana: 'ぎ', romaji: 'gi' }, { kana: 'ぐ', romaji: 'gu' }, { kana: 'げ', romaji: 'ge' }, { kana: 'ご', romaji: 'go' },
    { kana: 'ざ', romaji: 'za' }, { kana: 'じ', romaji: 'ji' }, { kana: 'ず', romaji: 'zu' }, { kana: 'ぜ', romaji: 'ze' }, { kana: 'ぞ', romaji: 'zo' },
    { kana: 'だ', romaji: 'da' }, { kana: 'ぢ', romaji: 'ji' }, { kana: 'づ', romaji: 'zu' }, { kana: 'で', romaji: 'de' }, { kana: 'ど', romaji: 'do' },
    { kana: 'ば', romaji: 'ba' }, { kana: 'び', romaji: 'bi' }, { kana: 'ぶ', romaji: 'bu' }, { kana: 'べ', romaji: 'be' }, { kana: 'ぼ', romaji: 'bo' },
    { kana: 'ぱ', romaji: 'pa' }, { kana: 'ぴ', romaji: 'pi' }, { kana: 'ぷ', romaji: 'pu' }, { kana: 'ぺ', romaji: 'pe' }, { kana: 'ぽ', romaji: 'po' }
  ];

  const DAKUON_KATA = [
    { kana: 'ガ', romaji: 'ga' }, { kana: 'ギ', romaji: 'gi' }, { kana: 'グ', romaji: 'gu' }, { kana: 'ゲ', romaji: 'ge' }, { kana: 'ゴ', romaji: 'go' },
    { kana: 'ザ', romaji: 'za' }, { kana: 'ジ', romaji: 'ji' }, { kana: 'ズ', romaji: 'zu' }, { kana: 'ゼ', romaji: 'ze' }, { kana: 'ゾ', romaji: 'zo' },
    { kana: 'ダ', romaji: 'da' }, { kana: 'ヂ', romaji: 'ji' }, { kana: 'ヅ', romaji: 'zu' }, { kana: 'デ', romaji: 'de' }, { kana: 'ド', romaji: 'do' },
    { kana: 'バ', romaji: 'ba' }, { kana: 'ビ', romaji: 'bi' }, { kana: 'ブ', romaji: 'bu' }, { kana: 'ベ', romaji: 'be' }, { kana: 'ボ', romaji: 'bo' },
    { kana: 'パ', romaji: 'pa' }, { kana: 'ピ', romaji: 'pi' }, { kana: 'プ', romaji: 'pu' }, { kana: 'ペ', romaji: 'pe' }, { kana: 'ポ', romaji: 'po' }
  ];

  // 拗音（主要）
  const YOUON_HIRA = [
    { kana: 'きゃ', romaji: 'kya' }, { kana: 'きゅ', romaji: 'kyu' }, { kana: 'きょ', romaji: 'kyo' },
    { kana: 'しゃ', romaji: 'sha' }, { kana: 'しゅ', romaji: 'shu' }, { kana: 'しょ', romaji: 'sho' },
    { kana: 'ちゃ', romaji: 'cha' }, { kana: 'ちゅ', romaji: 'chu' }, { kana: 'ちょ', romaji: 'cho' },
    { kana: 'にゃ', romaji: 'nya' }, { kana: 'にゅ', romaji: 'nyu' }, { kana: 'にょ', romaji: 'nyo' },
    { kana: 'ひゃ', romaji: 'hya' }, { kana: 'ひゅ', romaji: 'hyu' }, { kana: 'ひょ', romaji: 'hyo' },
    { kana: 'みゃ', romaji: 'mya' }, { kana: 'みゅ', romaji: 'myu' }, { kana: 'みょ', romaji: 'myo' },
    { kana: 'りゃ', romaji: 'rya' }, { kana: 'りゅ', romaji: 'ryu' }, { kana: 'りょ', romaji: 'ryo' },
    { kana: 'ぎゃ', romaji: 'gya' }, { kana: 'ぎゅ', romaji: 'gyu' }, { kana: 'ぎょ', romaji: 'gyo' },
    { kana: 'じゃ', romaji: 'ja' }, { kana: 'じゅ', romaji: 'ju' }, { kana: 'じょ', romaji: 'jo' },
    { kana: 'びゃ', romaji: 'bya' }, { kana: 'びゅ', romaji: 'byu' }, { kana: 'びょ', romaji: 'byo' },
    { kana: 'ぴゃ', romaji: 'pya' }, { kana: 'ぴゅ', romaji: 'pyu' }, { kana: 'ぴょ', romaji: 'pyo' }
  ];

  const YOUON_KATA = [
    { kana: 'キャ', romaji: 'kya' }, { kana: 'キュ', romaji: 'kyu' }, { kana: 'キョ', romaji: 'kyo' },
    { kana: 'シャ', romaji: 'sha' }, { kana: 'シュ', romaji: 'shu' }, { kana: 'ショ', romaji: 'sho' },
    { kana: 'チャ', romaji: 'cha' }, { kana: 'チュ', romaji: 'chu' }, { kana: 'チョ', romaji: 'cho' },
    { kana: 'ニャ', romaji: 'nya' }, { kana: 'ニュ', romaji: 'nyu' }, { kana: 'ニョ', romaji: 'nyo' },
    { kana: 'ヒャ', romaji: 'hya' }, { kana: 'ヒュ', romaji: 'hyu' }, { kana: 'ヒョ', romaji: 'hyo' },
    { kana: 'ミャ', romaji: 'mya' }, { kana: 'ミュ', romaji: 'myu' }, { kana: 'ミョ', romaji: 'myo' },
    { kana: 'リャ', romaji: 'rya' }, { kana: 'リュ', romaji: 'ryu' }, { kana: 'リョ', romaji: 'ryo' },
    { kana: 'ギャ', romaji: 'gya' }, { kana: 'ギュ', romaji: 'gyu' }, { kana: 'ギョ', romaji: 'gyo' },
    { kana: 'ジャ', romaji: 'ja' }, { kana: 'ジュ', romaji: 'ju' }, { kana: 'ジョ', romaji: 'jo' },
    { kana: 'ビャ', romaji: 'bya' }, { kana: 'ビュ', romaji: 'byu' }, { kana: 'ビョ', romaji: 'byo' },
    { kana: 'ピャ', romaji: 'pya' }, { kana: 'ピュ', romaji: 'pyu' }, { kana: 'ピョ', romaji: 'pyo' }
  ];

  const DATA = {
    hiragana: { seion: SEION_HIRA, dakuon: DAKUON_HIRA, youon: YOUON_HIRA },
    katakana: { seion: SEION_KATA, dakuon: DAKUON_KATA, youon: YOUON_KATA }
  };

  const TYPE_LABEL = { hiragana: '平假名', katakana: '片假名' };
  const GROUP_LABEL = { seion: '清音', dakuon: '浊音·半浊音', youon: '拗音' };

  // ---------- LocalStorage ----------
  const LS_KEY = 'jp_kana_stats_v1';

  function loadStats() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveStats(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }
  function recordStat(key, isCorrect) {
    const all = loadStats();
    if (!all[key]) all[key] = { total: 0, correct: 0 };
    all[key].total += 1;
    if (isCorrect) all[key].correct += 1;
    saveStats(all);
  }
  function resetStats() {
    try { localStorage.removeItem(LS_KEY); return true; } catch (e) { return false; }
  }

  // ---------- 状态 ----------
  const state = {
    type: 'hiragana',
    group: 'seion',
    mode: 'study'
  };

  // quiz 运行时
  const quiz = {
    current: null,       // { kana, romaji }
    options: [],         // [{ kana, romaji, isAnswer }]
    round: 0,
    correct: 0,
    wrong: 0,
    answered: false
  };

  // ---------- 工具 ----------
  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function speak(text) {
    if (window.TTS && typeof window.TTS.speak === 'function') {
      window.TTS.speak(text, { lang: 'ja-JP' });
    }
  }

  function getCurrentSet() {
    return DATA[state.type][state.group] || [];
  }
  function statKey() {
    return state.type + ':' + state.group;
  }

  // ---------- 渲染：学习模式 ----------
  function renderStudy() {
    const set = getCurrentSet();
    const title = TYPE_LABEL[state.type] + ' · ' + GROUP_LABEL[state.group];
    const titleEl = document.getElementById('kanaStudyTitle');
    if (titleEl) titleEl.textContent = title;

    const grid = document.getElementById('kanaGrid');
    if (!grid) return;
    if (set.length === 0) {
      grid.innerHTML = '<p class="muted">暂无数据。</p>';
      return;
    }
    grid.innerHTML = set.map(function (k, i) {
      return (
        '<button type="button" class="kana-card" data-kana-index="' + i + '">' +
          '<div class="kana-card-inner">' +
            '<div class="kana-face kana-front">' +
              '<div class="kana-char">' + escapeHTML(k.kana) + '</div>' +
              '<div class="kana-hint">点击翻转</div>' +
            '</div>' +
            '<div class="kana-face kana-back">' +
              '<div class="kana-romaji">' + escapeHTML(k.romaji) + '</div>' +
              '<div class="kana-char-small">' + escapeHTML(k.kana) + '</div>' +
              '<div class="kana-hint">点击朗读</div>' +
            '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');
  }

  // ---------- 渲染：测试模式 ----------
  function newQuiz() {
    const set = getCurrentSet();
    if (set.length === 0) return;
    quiz.answered = false;
    quiz.round += 1;
    // 选一个作为答案
    const answer = set[Math.floor(Math.random() * set.length)];
    quiz.current = answer;
    // 4 个选项：答案 + 3 个干扰
    const distractors = shuffle(set.filter(function (k) { return k.kana !== answer.kana; })).slice(0, 3);
    quiz.options = shuffle([answer].concat(distractors)).map(function (k) {
      return { kana: k.kana, romaji: k.romaji, isAnswer: k.kana === answer.kana };
    });
    renderQuiz();
    updateQuizStatsUI();
  }

  function renderQuiz() {
    const card = document.getElementById('kanaQuizCard');
    const opts = document.getElementById('kanaQuizOptions');
    const fb = document.getElementById('quizFeedback');
    const nextBtn = document.getElementById('btnNextQuiz');
    if (!card || !opts) return;

    // 题目：看假名选罗马音（默认）。片假名/平假名一致。
    card.innerHTML = '<div class="kana-quiz-char">' + escapeHTML(quiz.current.kana) + '</div>' +
      '<div class="muted">点击你认为正确的罗马音</div>';
    opts.innerHTML = quiz.options.map(function (o, i) {
      return '<button type="button" class="quiz-option kana-quiz-option" data-quiz-opt="' + i + '">' +
        escapeHTML(o.romaji) + '</button>';
    }).join('');
    if (fb) fb.textContent = '';
    if (nextBtn) nextBtn.hidden = true;
  }

  function updateQuizStatsUI() {
    const setEl = function (id, v) { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('quizRound', quiz.round);
    setEl('quizCorrect', quiz.correct);
    setEl('quizWrong', quiz.wrong);
    const total = quiz.correct + quiz.wrong;
    setEl('quizRate', total === 0 ? '-' : Math.round((quiz.correct / total) * 100) + '%');
  }

  function handleQuizAnswer(optIndex) {
    if (quiz.answered) return;
    quiz.answered = true;
    const chosen = quiz.options[optIndex];
    const isCorrect = chosen && chosen.isAnswer;
    if (isCorrect) quiz.correct += 1; else quiz.wrong += 1;
    recordStat(statKey(), isCorrect);

    // 高亮选项
    const btns = document.querySelectorAll('.kana-quiz-option');
    btns.forEach(function (b, i) {
      const o = quiz.options[i];
      if (o.isAnswer) b.classList.add('is-correct');
      else if (i === optIndex) b.classList.add('is-wrong');
      b.disabled = true;
    });

    // 朗读正确答案
    speak(quiz.current.kana);

    const fb = document.getElementById('quizFeedback');
    if (fb) {
      fb.textContent = isCorrect
        ? '✅ 正确！' + quiz.current.kana + ' = ' + quiz.current.romaji
        : '❌ 正确答案是：' + quiz.current.kana + ' = ' + quiz.current.romaji;
      fb.className = 'muted kana-tip ' + (isCorrect ? 'is-ok' : 'is-err');
    }
    const nextBtn = document.getElementById('btnNextQuiz');
    if (nextBtn) nextBtn.hidden = false;
    updateQuizStatsUI();
    renderStatsGrid();
  }

  // ---------- 渲染：历史统计 ----------
  function renderStatsGrid() {
    const grid = document.getElementById('kanaStatsGrid');
    if (!grid) return;
    const all = loadStats();
    const keys = [
      'hiragana:seion', 'hiragana:dakuon', 'hiragana:youon',
      'katakana:seion', 'katakana:dakuon', 'katakana:youon'
    ];
    grid.innerHTML = keys.map(function (k) {
      const s = all[k] || { total: 0, correct: 0 };
      const [t, g] = k.split(':');
      const rate = s.total === 0 ? '-' : Math.round((s.correct / s.total) * 100) + '%';
      return (
        '<div class="kana-stat-card">' +
          '<div class="ks-title">' + TYPE_LABEL[t] + ' · ' + GROUP_LABEL[g] + '</div>' +
          '<div class="ks-rate">' + rate + '</div>' +
          '<div class="ks-detail">' + s.correct + ' / ' + s.total + '</div>' +
        '</div>'
      );
    }).join('');
  }

  // ---------- 事件绑定 ----------
  function bindControls() {
    document.querySelectorAll('[data-kana-type]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-kana-type]').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        state.type = b.getAttribute('data-kana-type');
        onScopeChange();
      });
    });
    document.querySelectorAll('[data-kana-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-kana-group]').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        state.group = b.getAttribute('data-kana-group');
        onScopeChange();
      });
    });
    document.querySelectorAll('[data-kana-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('[data-kana-mode]').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        state.mode = b.getAttribute('data-kana-mode');
        switchMode();
      });
    });

    // 学习模式：卡片翻转 + 朗读
    const grid = document.getElementById('kanaGrid');
    if (grid) {
      grid.addEventListener('click', function (e) {
        const card = e.target.closest('.kana-card');
        if (!card) return;
        if (card.classList.contains('is-flipped')) {
          // 已翻转 → 朗读
          const idx = parseInt(card.getAttribute('data-kana-index'), 10);
          const set = getCurrentSet();
          if (set[idx]) speak(set[idx].kana);
        } else {
          card.classList.add('is-flipped');
        }
      });
    }

    // 测试模式：选项点击
    const opts = document.getElementById('kanaQuizOptions');
    if (opts) {
      opts.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-quiz-opt]');
        if (!btn) return;
        handleQuizAnswer(parseInt(btn.getAttribute('data-quiz-opt'), 10));
      });
    }
    const nextBtn = document.getElementById('btnNextQuiz');
    if (nextBtn) nextBtn.addEventListener('click', newQuiz);

    const resetBtn = document.getElementById('btnResetKanaStats');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (confirm('确定清除所有假名训练记录？')) {
        resetStats();
        renderStatsGrid();
        quiz.round = 0; quiz.correct = 0; quiz.wrong = 0;
        updateQuizStatsUI();
      }
    });
  }

  function onScopeChange() {
    if (state.mode === 'study') renderStudy();
    else { quiz.round = 0; quiz.correct = 0; quiz.wrong = 0; newQuiz(); }
    renderStatsGrid();
  }

  function switchMode() {
    const studySec = document.getElementById('kanaStudySection');
    const quizSec = document.getElementById('kanaQuizSection');
    if (state.mode === 'study') {
      if (studySec) studySec.hidden = false;
      if (quizSec) quizSec.hidden = true;
      renderStudy();
    } else {
      if (studySec) studySec.hidden = true;
      if (quizSec) quizSec.hidden = false;
      quiz.round = 0; quiz.correct = 0; quiz.wrong = 0;
      newQuiz();
    }
    renderStatsGrid();
  }

  // ---------- 初始化 ----------
  function init() {
    bindControls();
    switchMode();
    renderStatsGrid();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
