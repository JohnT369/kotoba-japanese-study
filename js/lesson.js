/* ============================================================
   lesson.js - 单课学习页（阅读模式 + 编辑模式）
   ============================================================ */

(function () {
  'use strict';

  // ---------- 状态 ----------
  const LS_MODE_KEY = 'jp_edit_mode_v1';       // 是否处于编辑模式
  let isEditMode = false;
  let isEditDirty = false;

  // ---------- 工具 ----------
  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function nl2br(str) {
    if (str == null) return '';
    return escapeHTML(str).replace(/\n/g, '<br>');
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + ' ' + h + ':' + mm;
    } catch (e) {
      return '';
    }
  }

  function lessonLabel(lesson) {
    const sequence = Number(lesson && lesson.sequence);
    return Number.isFinite(sequence) && sequence > 0 ? '第' + sequence + '课' : ((lesson && lesson.day) || '');
  }

  function getLessonIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  // ---------- 日语切分 + 朗读辅助 ----------
  // 把日文串切成 token：连续汉字 / 连续假名 / 标点 / 其它
  function tokenizeJP(str) {
    if (!str) return [];
    const tokens = [];
    let buf = '';
    let lastType = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      let t = 'other';
      if (/[\u4e00-\u9fff]/.test(ch)) t = 'kanji';
      else if (/[\u3040-\u309f\u30a0-\u30ff]/.test(ch)) t = 'kana';
      else if (/[、。！？，．「」『』（）・]/.test(ch)) t = 'punct';
      if (t === lastType) buf += ch;
      else {
        if (buf) tokens.push({ text: buf, type: lastType });
        buf = ch; lastType = t;
      }
    }
    if (buf) tokens.push({ text: buf, type: lastType });
    return tokens;
  }

  // 把日文渲染成可点击片段（朗读）
  function renderJPTokens(jp) {
    const tokens = tokenizeJP(jp);
    return tokens.map(function (tk) {
      return '<span class="jp-token" data-token="' + escapeHTML(tk.text) + '">' + escapeHTML(tk.text) + '</span>';
    }).join('');
  }

  // 朗读封装（依赖 TTS）
  function speakJP(text) {
    if (window.TTS && typeof window.TTS.speak === 'function') {
      window.TTS.speak(text, { lang: 'ja-JP' });
    }
  }

  // 临时高亮某个 token / 按钮
  function flashSpeaking(el, duration) {
    if (!el) return;
    el.classList.add('is-speaking');
    setTimeout(function () { el.classList.remove('is-speaking'); }, duration || 600);
  }

  // ---------- 构建模块容器 ----------
  function buildModule(num, title, innerHTML, extraClass) {
    return (
      '<div class="module ' + (extraClass || '') + '">' +
        '<div class="module-header">' +
          '<div class="module-num">' + escapeHTML(num) + '</div>' +
          '<h3 class="module-title">' + escapeHTML(title) + '</h3>' +
        '</div>' +
        innerHTML +
      '</div>'
    );
  }

  /* ============================================================
     阅读模式：原渲染函数
     ============================================================ */

  function renderGoals(goals) {
    if (!goals || goals.length === 0) return '';
    const items = goals.map(function (g) {
      return '<div class="goal-item">' + nl2br(g) + '</div>';
    }).join('');
    return buildModule('1', '今日目标',
      '<div class="goal-list">' + items + '</div>'
    );
  }

  function renderVocabulary(vocab) {
    if (!vocab || vocab.length === 0) return '';
    const cards = vocab.map(function (v, idx) {
      return (
        '<div class="vocab-card" data-vocab-index="' + idx + '">' +
          '<div class="vocab-card-inner">' +
            '<div class="vocab-face vocab-front">' +
              '<button type="button" class="vocab-play btn-play" data-vocab-play="' + idx + '" title="朗读">🔊</button>' +
              '<div class="vocab-word">' + escapeHTML(v.word) + '</div>' +
              '<div class="vocab-reading">' + escapeHTML(v.reading || '') + '</div>' +
              '<div class="vocab-hint">点击卡片翻转查看释义</div>' +
            '</div>' +
            '<div class="vocab-face vocab-back">' +
              '<div class="vocab-meaning">' + escapeHTML(v.meaning) + '</div>' +
              (v.type ? '<div class="vocab-type">' + escapeHTML(v.type) + '</div>' : '') +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule('2', '核心词汇',
      '<div class="vocab-grid">' + cards + '</div>' +
      '<p class="muted" style="text-align:center;font-size:var(--fs-xxs);">点击卡片翻转看释义 · 点 🔊 朗读该词</p>'
    );
  }

  function renderGrammar(grammar) {
    if (!grammar || grammar.length === 0) return '';
    const blocks = grammar.map(function (g) {
      return (
        '<div class="grammar-block">' +
          '<div class="grammar-pattern">' + escapeHTML(g.pattern) + '</div>' +
          '<div class="grammar-meaning">' + escapeHTML(g.meaning || '') + '</div>' +
          (g.desc ? '<div class="grammar-desc">' + nl2br(g.desc) + '</div>' : '') +
          (g.struct ? '<div class="grammar-struct">' + escapeHTML(g.struct) + '</div>' : '') +
        '</div>'
      );
    }).join('');

    return buildModule('3', '核心语法', blocks);
  }

  function renderExamples(examples) {
    if (!examples || examples.length === 0) return '';
    const list = examples.map(function (ex, idx) {
      return (
        '<div class="example-item" data-example-index="' + idx + '">' +
          '<div class="example-play-row">' +
            '<button type="button" class="btn-play example-play" data-example-play="' + idx + '" title="整句朗读">🔊 整句朗读</button>' +
          '</div>' +
          '<div class="example-jp" data-example-jp="' + idx + '">' + renderJPTokens(ex.jp) + '</div>' +
          (ex.reading ? '<p class="muted" style="font-size:var(--fs-xs);margin-bottom:var(--space-3);">' + escapeHTML(ex.reading) + '</p>' : '') +
          '<button class="example-toggle" type="button" data-example-toggle="' + idx + '">' +
            '<span>👁</span><span class="toggle-label">查看翻译与结构</span>' +
          '</button>' +
          '<div class="example-answer" data-example-answer="' + idx + '">' +
            '<div class="example-cn">中文：' + escapeHTML(ex.cn || '') + '</div>' +
            (ex.struct ? '<span class="example-struct">结构：' + escapeHTML(ex.struct) + '</span>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule('4', '例句',
      '<div class="example-list">' + list + '</div>' +
      '<p class="muted" style="text-align:center;font-size:var(--fs-xxs);">点击句中任意片段朗读该词 · 点 🔊 朗读整句</p>'
    );
  }

  function renderMistakes(mistakes) {
    if (!mistakes || mistakes.length === 0) return '';
    const list = mistakes.map(function (m) {
      return (
        '<div class="mistake-item">' +
          '<div class="mistake-mark">!</div>' +
          '<div class="mistake-content">' +
            (m.wrong ? '<div class="mistake-wrong">' + escapeHTML(m.wrong) + '</div>' : '') +
            (m.right ? '<div class="mistake-right">✅ ' + escapeHTML(m.right) + '</div>' : '') +
            (m.reason ? '<div class="mistake-reason">' + nl2br(m.reason) + '</div>' : '') +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule('5', '易错点',
      '<div class="mistake-list">' + list + '</div>'
    );
  }

  function renderQuiz(quiz) {
    if (!quiz || quiz.length === 0) return '';
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const list = quiz.map(function (q, qIdx) {
      const options = q.options.map(function (opt, oIdx) {
        return (
          '<button type="button" class="quiz-option" ' +
            'data-quiz-index="' + qIdx + '" data-option-index="' + oIdx + '">' +
            '<span class="quiz-option-letter">' + letters[oIdx] + '</span>' +
            '<span class="quiz-option-text">' + escapeHTML(opt) + '</span>' +
          '</button>'
        );
      }).join('');

      return (
        '<div class="quiz-item" data-quiz-item="' + qIdx + '">' +
          '<div class="quiz-question">' +
            escapeHTML('Q' + (qIdx + 1) + '. ' + q.question) +
            (q.sub ? '<div class="quiz-question-sub">' + escapeHTML(q.sub) + '</div>' : '') +
          '</div>' +
          '<div class="quiz-options">' + options + '</div>' +
          '<div class="quiz-feedback" data-quiz-feedback="' + qIdx + '"></div>' +
        '</div>'
      );
    }).join('');

    return buildModule('6', '小练习',
      '<div class="quiz-list">' + list + '</div>'
    );
  }

  function renderSentencePractice(sp) {
    if (!sp) return '';
    const tipsHTML = sp.tips && sp.tips.length > 0
      ? '<div class="sentence-tips">' +
          sp.tips.map(function (t) {
            return (
              '<div class="sentence-tip">' +
                '<strong>' + escapeHTML(t.word || '') + '</strong>' +
                escapeHTML(t.meaning || '') +
              '</div>'
            );
          }).join('') +
        '</div>'
      : '';

    return buildModule('7', '自己造句',
      '<div class="sentence-practice">' +
        '<div class="sentence-hint">' + nl2br(sp.hint || '') + '</div>' +
        tipsHTML +
        '<textarea class="sentence-write" placeholder="在这里写下你造的句子，至少 3 句...（本地保存，不会上传）"></textarea>' +
      '</div>'
    );
  }

  function renderSpeakPractice(sp, speakTip) {
    if (!sp || sp.length === 0) return '';
    const phrases = sp.map(function (p, idx) {
      return (
        '<div class="speak-phrase speak-item" data-speak-index="' + idx + '">' +
          '<div class="example-play-row">' +
            '<button type="button" class="btn-play speak-play" data-speak-play="' + idx + '" title="整句朗读">🔊 整句朗读</button>' +
          '</div>' +
          '<div class="speak-jp">' + renderJPTokens(p.jp) + '</div>' +
          '<div class="speak-reading">' + escapeHTML(p.reading || '') + '</div>' +
          (p.cn ? '<div class="speak-cn">' + escapeHTML(p.cn) + '</div>' : '') +
        '</div>'
      );
    }).join('');

    const tipHTML = speakTip
      ? '<div class="speak-tip">🎤 ' + nl2br(speakTip) + '</div>'
      : '';

    return buildModule('8', '今日开口',
      '<div class="speak-practice">' +
        '<div class="speak-phrases">' + phrases + '</div>' +
        tipHTML +
      '</div>'
    );
  }

  /* ============================================================
     新 3 大模块渲染（教材图片结构）
     ============================================================ */

  // 模块1：单词 + 短语汇总（表格：语调/读音/汉字/意义）
  function renderVocabularyTable(lesson) {
    const vocab = lesson.vocabulary || [];
    const phrases = lesson.phrases || [];
    // 自动编号：①②③... 最多 20，之后 (21)(22)
    const circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    function mark(i) {
      if (i < circled.length) return circled[i];
      return '(' + (i + 1) + ')';
    }

    // 单词表头 + 统计徽标
    const header =
      '<div class="vocab-table-header">' +
        '<span class="vth-title">本课单词</span>' +
        '<span class="vth-badge">' + vocab.length + ' 词</span>' +
      '</div>' +
      '<div class="vocab-table">' +
        '<div class="vt-row vt-head">' +
          '<div class="vt-cell vt-accent">语调</div>' +
          '<div class="vt-cell vt-reading">读音</div>' +
          '<div class="vt-cell vt-word">汉字·外来语</div>' +
          '<div class="vt-cell vt-meaning">意义</div>' +
        '</div>';

    const rows = vocab.map(function (v, i) {
      const note = v.note ? '<div class="vt-note">' + nl2br(v.note) + '</div>' : '';
      const accentDisplay = v.accent != null && v.accent !== '' ? v.accent : (String(i + 1));
      return (
        '<div class="vt-row" data-vt-index="' + i + '">' +
          '<div class="vt-cell vt-accent"><span class="accent-num">' + escapeHTML(accentDisplay) + '</span></div>' +
          '<div class="vt-cell vt-reading">' +
            '<span class="vt-play btn-play" data-vocab-play="' + i + '" title="朗读读音">🔊</span>' +
            escapeHTML(v.reading || '') +
          '</div>' +
          '<div class="vt-cell vt-word">' + escapeHTML(v.word || '') + note + '</div>' +
          '<div class="vt-cell vt-meaning">' + escapeHTML(v.meaning || '') + '</div>' +
        '</div>'
      );
    }).join('');

    const tableEnd = '</div>';

    // ===== 短语块：独立区 + 永不隐藏 + 自动编号①② =====
    const pMark = phrases.length ? '<span class="vth-badge">' + phrases.length + ' 条</span>' : '';
    const pHeadHTML =
      '<div class="vocab-table-header phrases-header">' +
        '<span class="vth-mp3 phrases-icon">📙</span>' +
        '<span class="vth-title">本课短语</span>' +
        pMark +
      '</div>';
    let pBodyHTML;
    if (!phrases.length) {
      pBodyHTML =
        '<div class="phrases-empty">' +
          '<div class="phrases-empty-icon">📋</div>' +
          '<div class="phrases-empty-text">暂无固定短语</div>' +
          '<div class="phrases-empty-hint">进入「编辑模式」可为本课添加搭配、寒暄句和常用短句</div>' +
        '</div>';
    } else {
      pBodyHTML =
        '<div class="vocab-table phrases-table">' +
          '<div class="vt-row vt-head">' +
            '<div class="vt-cell vt-phrase-mark">短语</div>' +
            '<div class="vt-cell vt-reading">读音</div>' +
            '<div class="vt-cell vt-word">短语</div>' +
            '<div class="vt-cell vt-meaning">意义·说明</div>' +
          '</div>' +
          phrases.map(function (p, i) {
            const note = p.note ? '<div class="vt-note">' + nl2br(p.note) + '</div>' : '';
            return (
              '<div class="vt-row">' +
                '<div class="vt-cell vt-phrase-mark"><span class="phrase-mark">' + mark(i) + '</span></div>' +
                '<div class="vt-cell vt-reading">' + escapeHTML(p.reading || '') + '</div>' +
                '<div class="vt-cell vt-word">' + escapeHTML(p.phrase || '') + note + '</div>' +
                '<div class="vt-cell vt-meaning">' + escapeHTML(p.meaning || '') + '</div>' +
              '</div>'
            );
          }).join('') +
        '</div>';
    }
    const phrasesHTML =
      '<div class="phrases-block">' + pHeadHTML + pBodyHTML + '</div>';

    return buildModule('1', '本课单词·短语',
      header + rows + tableEnd + phrasesHTML
    );
  }

  // 模块2：学习目标 + 例文（每个 goal：goalTitle → mainExample 结构图 → 例文列表）
  function renderLearningGoalsBlock(lesson) {
    const goals = lesson.learningGoals || [];
    if (goals.length === 0) return '';

    // ===== 顶部索引卡（3列：编号 / 目标标题 / 主例句）=====
    const circledG = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩','⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
    function gMark(i) { if (i < circledG.length) return circledG[i]; return '(' + (i+1) + ')'; }

    const indexCard =
      '<div class="lg-index-card">' +
        '<div class="lgic-row lgic-head">' +
          '<div class="lgic-col lgic-num">编号</div>' +
          '<div class="lgic-col lgic-title">学习目标</div>' +
          '<div class="lgic-col lgic-ex">主例句</div>' +
        '</div>' +
        goals.map(function (g, gi) {
          const mainJp = (g.mainExample && g.mainExample.jp) ? g.mainExample.jp : '';
          const snippet = mainJp.length > 38 ? mainJp.slice(0, 38) + '…' : mainJp;
          return (
            '<a class="lgic-row" href="#lg-' + (gi+1) + '">' +
              '<div class="lgic-col lgic-num"><span class="lgic-gnum">' + gMark(gi) + ' 学习目标 ' + (gi+1) + '</span></div>' +
              '<div class="lgic-col lgic-title">' + escapeHTML(g.goalTitle || '') + '</div>' +
              '<div class="lgic-col lgic-ex">' + escapeHTML(snippet) + '</div>' +
            '</a>'
          );
        }).join('') +
      '</div>';

    const blocks = goals.map(function (g, gIdx) {
      // 主例句 + 结构分析图
      const m = g.mainExample || {};
      const structure = (m.structure && m.structure.length) ? m.structure : [];

      // 结构渲染：每块一行（jp + role + cn），用连接线视觉化
      const structHTML = structure.length ?
        '<div class="lg-structure">' +
          structure.map(function (b) {
            const cnText = b.cn ? escapeHTML(b.cn) : '';
            return (
              '<div class="lg-stru-block">' +
                '<div class="lg-stru-jp">' + renderJPTokens(b.jp || '') + '</div>' +
                (b.role ? '<div class="lg-stru-role">' + escapeHTML(b.role) + '</div>' : '') +
                (cnText ? '<div class="lg-stru-cn">' + cnText + '</div>' : '') +
              '</div>'
            );
          }).join('') +
        '</div>'
        : '';

      const mainHTML =
        '<div class="lg-main-example">' +
          '<div class="lg-main-line">' +
            (m.reading ? '<div class="muted lg-reading">' + escapeHTML(m.reading) + '</div>' : '') +
            '<div class="example-play-row">' +
              '<button type="button" class="btn-play lg-main-play" title="整句朗读">🔊 朗读</button>' +
            '</div>' +
            '<div class="lg-main-jp">' + renderJPTokens(m.jp || '') + '</div>' +
            (m.cn ? '<div class="muted lg-main-cn">' + escapeHTML(m.cn) + '</div>' : '') +
          '</div>' +
          structHTML +
        '</div>';

      // 例文列表
      const exList = (g.examples || []).length ?
        '<div class="lg-examples">' +
          '<div class="lg-examples-title">例文</div>' +
          (g.examples.map(function (ex, eIdx) {
            const focus = ex.focus || '';
            let jpHtml = renderJPTokens(ex.jp || '');
            if (focus) {
              const safe = escapeHTML(focus).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const re = new RegExp('>(' + safe + ')<', 'g');
              jpHtml = jpHtml.replace(re, '><span class="lg-focus">$1</span><');
            }
            return (
              '<div class="lg-ex">' +
                (ex.reading ? '<div class="muted lg-ex-reading">' + escapeHTML(ex.reading) + '</div>' : '') +
                '<div class="example-play-row">' +
                  '<button type="button" class="btn-play lg-ex-play" title="朗读">🔊</button>' +
                '</div>' +
                '<div class="lg-ex-jp">' + jpHtml + '</div>' +
                (ex.cn ? '<div class="muted lg-ex-cn">' + escapeHTML(ex.cn) + '</div>' : '') +
                (ex.note ? '<div class="vt-note">' + escapeHTML(ex.note) + '</div>' : '') +
              '</div>'
            );
          }).join('')) +
        '</div>' : '';

      return (
        '<div id="lg-' + (gIdx + 1) + '" class="learning-goal">' +
          '<div class="lg-header">' +
            '<div class="lg-number">' + gMark(gIdx) + ' 学习目标 ' + (gIdx + 1) + '</div>' +
            '<h4 class="lg-title">' + escapeHTML(g.goalTitle || '') + '</h4>' +
          '</div>' +
          mainHTML +
          exList +
        '</div>'
      );
    }).join('');

    return buildModule('2', '学习目标·例文',
      indexCard + '<div class="learning-goals">' + blocks + '</div>'
    );
  }

  // 模块3：真实应用会话（对话，每行人名+假名+句子+翻译+注释）
  function renderDialogueBlock(lesson) {
    const d = lesson.dialogue;
    if (!d || !d.lines || d.lines.length === 0) return '';

    const lines = d.lines.map(function (ln, lnIdx) {
      // 注释：如果 annotations 存在，把注释加到对应 jp 片段下面
      let annotationsHTML = '';
      if (ln.annotations && ln.annotations.length) {
        annotationsHTML =
          '<div class="dlg-annotations">' +
            ln.annotations.map(function (an) {
              return (
                '<div class="dlg-anno">' +
                  (an.jp ? '<span class="dlg-anno-jp">' + escapeHTML(an.jp) + '</span>' : '') +
                  ' <span class="dlg-anno-note">' + escapeHTML(an.note) + '</span>' +
                '</div>'
              );
            }).join('') +
          '</div>';
      }

      return (
        '<div class="dlg-line">' +
          '<div class="dlg-speaker">' +
            '<div class="dlg-speaker-name">' + escapeHTML(ln.speaker || '') + '</div>' +
            (ln.speakerReading ? '<div class="muted dlg-speaker-reading">' + escapeHTML(ln.speakerReading) + '</div>' : '') +
          '</div>' +
          '<div class="dlg-body">' +
            '<div class="example-play-row">' +
              '<button type="button" class="btn-play dlg-line-play" title="整句朗读">🔊 朗读</button>' +
            '</div>' +
            '<div class="dlg-jp">' + renderJPTokens(ln.jp || '') + '</div>' +
            (ln.cn ? '<div class="dlg-cn">' + escapeHTML(ln.cn) + '</div>' : '') +
            annotationsHTML +
          '</div>' +
        '</div>'
      );
    }).join('');

    const header =
      '<div class="dlg-header">' +
        '<span class="dlg-header-title">' + escapeHTML(d.title || '应用会话') + '</span>' +
      '</div>';

    return buildModule('3', '应用会话',
      header +
      '<div class="dlg-body-block">' + lines + '</div>'
    );
  }

  /* ============================================================
     编辑模式：工具栏 + 各模块表单
     ============================================================ */

  function renderEditToolbar(lessonId, lesson) {
    const hasEdit = App.hasLessonEdit(lessonId);
    return (
      '<div class="edit-toolbar" aria-label="编辑操作">' +
        '<button type="button" class="btn btn-sm btn-outline" id="btnExitEditMode">← 返回阅读模式</button>' +
        '<span class="status ' + (hasEdit ? 'is-edited' : '') + '" id="editSaveStatus" role="status" aria-live="polite">' +
          (hasEdit ? '已保存到本机（未同步到 lessons.js）' : '与 lessons.js 原版一致') +
        '</span>' +
        '<div class="edit-toolbar-spacer"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="btnSaveEdit" disabled>💾 保存编辑</button>' +
        '<button type="button" class="btn btn-sm btn-outline" id="btnCancelEdit">取消</button>' +
        '<button type="button" class="btn btn-sm btn-outline" id="btnResetEdit">↺ 重置为原版</button>' +
        '<button type="button" class="btn btn-sm btn-outline" id="btnExportJSON">⬇ 导出本课 JSON</button>' +
      '</div>' +
      '<div class="export-result" id="exportResult">' +
        '<div class="export-result-hint">' +
          '💡 把下面这段 JSON 复制后，替换 data/lessons.js 中对应课程对象即可永久写入磁盘。' +
          ' 注意：只替换这一个对象，不要动其他课程。记得保留逗号。' +
        '</div>' +
        '<div style="display:flex;gap:var(--space-2);">' +
          '<button type="button" class="edit-btn success export-copy-btn" id="btnCopyJSON">📋 复制到剪贴板</button>' +
          '<button type="button" class="edit-btn export-copy-btn" id="btnDownloadJSON">下载 .json 文件</button>' +
        '</div>' +
        '<pre id="exportJSONContent" style="white-space:pre-wrap;word-break:break-word;margin:0;"></pre>' +
      '</div>'
    );
  }

  function renderEditLessonHeader(lesson) {
    // 课程 ID、名称说明与上下课跳转不属于本课内容编辑，避免在编辑界面重复占用空间。
    return '';
  }

  // 通用：可编辑列表的单行基础
  function editField(name, value, placeholder, isTextarea) {
    const safeVal = escapeHTML(value == null ? '' : value);
    const phAttr = placeholder ? ' placeholder="' + escapeHTML(placeholder) + '"' : '';
    if (isTextarea) {
      return '<div class="field-group">' +
        '<label>' + escapeHTML(name) + '</label>' +
        '<textarea data-edit-field="' + escapeHTML(name) + '"' + phAttr + '>' + safeVal + '</textarea>' +
      '</div>';
    }
    return '<div class="field-group">' +
      '<label>' + escapeHTML(name) + '</label>' +
      '<input type="text" data-edit-field="' + escapeHTML(name) + '" value="' + safeVal + '"' + phAttr + '>' +
    '</div>';
  }

  function editItemHeader(index, total) {
    return '<div class="edit-list-actions">' +
      '<span class="edit-list-index">第 ' + (index + 1) + ' / ' + total + ' 项</span>' +
      '<div style="display:flex;gap:var(--space-2);">' +
        '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
      '</div>' +
    '</div>';
  }

  function editAddButton(label) {
    return '<div class="edit-add-row">' +
      '<button type="button" class="edit-btn primary" data-edit-action="add">' +
        '+ ' + escapeHTML(label) +
      '</button>' +
    '</div>';
  }

  /* ============================================================
     新 3 大模块编辑表单（教材 schema）
     ============================================================ */

  // 模块 1：单词+短语（紧凑表格布局）
  function editRenderVocabularyList(vocab, phrases, moduleNum) {
    vocab = vocab && vocab.length ? vocab : [{ word: '', reading: '', meaning: '', accent: '' }];
    const items = vocab.map(function (v, i) {
      return (
        '<div class="edit-row" data-list-name="vocabulary" data-list-index="' + i + '">' +
          '<div class="edit-row__main">' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">汉字·外来语</label>' +
              '<input type="text" data-edit-field="汉字·外来语 (word)" value="' + escapeHTML(v.word || '') + '" placeholder="例：私">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">假名注音</label>' +
              '<input type="text" data-edit-field="假名注音 (reading)" value="' + escapeHTML(v.reading || '') + '" placeholder="例：わたし">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">释义</label>' +
              '<input type="text" data-edit-field="释义 (meaning)" value="' + escapeHTML(v.meaning || '') + '" placeholder="例：我">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">语调</label>' +
              '<input type="text" data-edit-field="语调 (accent)" value="' + escapeHTML(v.accent != null ? v.accent : '') + '" placeholder="例：0">' +
            '</div>' +
          '</div>' +
          '<div class="edit-row__footer">' +
            '<span class="edit-row__index">第 ' + (i + 1) + ' / ' + vocab.length + ' 项</span>' +
            '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    phrases = phrases && phrases.length ? phrases : [{ phrase: '', reading: '', meaning: '', note: '' }];
    const pItems = phrases.map(function (p, i) {
      return (
        '<div class="edit-row" data-list-name="phrases" data-list-index="' + i + '">' +
          '<div class="edit-row__main">' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">短语</label>' +
              '<input type="text" data-edit-field="短语 (phrase)" value="' + escapeHTML(p.phrase || '') + '" placeholder="例：はじめまして">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">注音</label>' +
              '<input type="text" data-edit-field="注音 (reading)" value="' + escapeHTML(p.reading || '') + '" placeholder="">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">释义</label>' +
              '<input type="text" data-edit-field="释义 (meaning)" value="' + escapeHTML(p.meaning || '') + '" placeholder="例：初次见面">' +
            '</div>' +
            '<div class="edit-cell">' +
              '<label class="edit-cell__label">备注</label>' +
              '<input type="text" data-edit-field="备注 (note)" value="' + escapeHTML(p.note || '') + '" placeholder="">' +
            '</div>' +
          '</div>' +
          '<div class="edit-row__footer">' +
            '<span class="edit-row__index">第 ' + (i + 1) + ' / ' + phrases.length + ' 项</span>' +
            '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '本课单词·短语',
      '<div class="edit-form edit-form--compact">' +
        '<div class="edit-section-title">📘 词汇表</div>' +
        '<div class="edit-list edit-list--compact" data-list-group="vocabulary">' + items + '</div>' +
        '<div class="edit-add-row">' +
          '<button type="button" class="edit-btn primary" data-edit-action="add">+ 添加一个单词</button>' +
        '</div>' +
        '<div class="edit-section-title" style="margin-top:var(--space-5);">📙 短语汇总</div>' +
        '<div class="edit-list edit-list--compact" data-list-group="phrases">' + pItems + '</div>' +
        '<div class="edit-add-row">' +
          '<button type="button" class="edit-btn primary" data-edit-action="add">+ 添加一条短语</button>' +
        '</div>' +
      '</div>'
    );
  }

  // 模块 2：学习目标·例文（紧凑布局）
  function editRenderLearningGoals(goals, moduleNum) {
    goals = goals && goals.length ? goals : [{
      goalNumber: '', goalTitle: '',
      mainExample: { jp: '', reading: '', cn: '', structure: [{ jp: '', role: '', cn: '' }] },
      examples: [{ jp: '', reading: '', cn: '', focus: '', note: '' }]
    }];

    const items = goals.map(function (g, gIdx) {
      g = g || {};
      const mainEx = g.mainExample || { jp: '', reading: '', cn: '', structure: [] };
      const struct = (mainEx.structure && mainEx.structure.length) ? mainEx.structure : [{ jp: '', role: '', cn: '' }];
      const structItems = struct.map(function (b, bIdx) {
        return (
          '<div class="edit-row" style="margin-bottom:var(--space-2);" data-list-name="lg-' + gIdx + '-structure" data-list-index="' + bIdx + '">' +
            '<div class="edit-row__main">' +
              '<div class="edit-cell"><label class="edit-cell__label">结构块</label><input type="text" data-edit-field="结构块日文 (jp)" value="' + escapeHTML(b.jp || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">语法角色</label><input type="text" data-edit-field="语法角色 (role)" value="' + escapeHTML(b.role || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">中文</label><input type="text" data-edit-field="中文对照 (cn)" value="' + escapeHTML(b.cn || '') + '"></div>' +
            '</div>' +
            '<div class="edit-row__footer">' +
              '<span class="edit-row__index">第 ' + (bIdx + 1) + ' 块</span>' +
              '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      const examples = (g.examples && g.examples.length) ? g.examples : [{ jp: '', reading: '', cn: '', focus: '', note: '' }];
      const exItems = examples.map(function (ex, exIdx) {
        return (
          '<div class="edit-row" data-list-name="lg-' + gIdx + '-examples" data-list-index="' + exIdx + '">' +
            '<div class="edit-row__main">' +
              '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">例文日文</label><input type="text" data-edit-field="例文日文 (jp)" value="' + escapeHTML(ex.jp || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">假名注音</label><input type="text" data-edit-field="假名注音 (reading)" value="' + escapeHTML(ex.reading || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">下划线词</label><input type="text" data-edit-field="下划线标注词 (focus)" value="' + escapeHTML(ex.focus || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">中文</label><input type="text" data-edit-field="中文 (cn)" value="' + escapeHTML(ex.cn || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">备注</label><input type="text" data-edit-field="小字备注 (note)" value="' + escapeHTML(ex.note || '') + '"></div>' +
            '</div>' +
            '<div class="edit-row__footer">' +
              '<span class="edit-row__index">第 ' + (exIdx + 1) + ' / ' + examples.length + ' 条</span>' +
              '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      const isFirst = gIdx === 0;
      const isLast = gIdx === goals.length - 1;
      const moveBtns =
        '<div class="lg-move-btns">' +
          (isFirst ? '<button type="button" class="lg-move-btn" disabled>↑</button>'
                   : '<button type="button" class="lg-move-btn" data-lg-move-up="' + gIdx + '" title="上移">↑</button>') +
          (isLast  ? '<button type="button" class="lg-move-btn" disabled>↓</button>'
                   : '<button type="button" class="lg-move-btn" data-lg-move-down="' + gIdx + '" title="下移">↓</button>') +
        '</div>';

      return (
        '<div class="edit-goal-block" data-list-name="learningGoals" data-list-index="' + gIdx + '">' +
          '<div class="edit-goal-header">' +
            '<div class="edit-goal-title">🎯 学习目标 ' + (gIdx + 1) + '</div>' +
            moveBtns +
          '</div>' +
          '<div class="edit-row" style="margin-bottom:var(--space-3);">' +
            '<div class="edit-row__main">' +
              '<div class="edit-cell"><label class="edit-cell__label">编号</label><input type="text" data-edit-field="学习目标编号 (goalNumber)" value="' + escapeHTML(g.goalNumber != null ? g.goalNumber : '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">标题</label><input type="text" data-edit-field="标题 (goalTitle)" value="' + escapeHTML(g.goalTitle || '') + '"></div>' +
            '</div>' +
          '</div>' +

          '<div class="edit-section-title">📌 主例句</div>' +
          '<div class="edit-row" style="margin-bottom:var(--space-3);">' +
            '<div class="edit-row__main">' +
              '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">日文</label><input type="text" data-edit-field="主例句日文 (jp)" value="' + escapeHTML(mainEx.jp || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">注音</label><input type="text" data-edit-field="注音 (reading)" value="' + escapeHTML(mainEx.reading || '') + '"></div>' +
              '<div class="edit-cell"><label class="edit-cell__label">中文</label><input type="text" data-edit-field="中文 (cn)" value="' + escapeHTML(mainEx.cn || '') + '"></div>' +
            '</div>' +
          '</div>' +

          '<div class="edit-section-title">📊 结构分析</div>' +
          '<div class="edit-list edit-list--compact" data-list-group="lg-' + gIdx + '-structure">' + structItems + '</div>' +
          '<div class="edit-add-row"><button type="button" class="edit-btn primary" data-edit-action="add">+ 添加结构块</button></div>' +

          '<div class="edit-section-title" style="margin-top:var(--space-3);">📝 例文列表</div>' +
          '<div class="edit-list edit-list--compact" data-list-group="lg-' + gIdx + '-examples">' + exItems + '</div>' +
          '<div class="edit-add-row"><button type="button" class="edit-btn primary" data-edit-action="add">+ 添加例文</button></div>' +

          '<div class="edit-row__footer" style="border-top:1px dashed var(--color-border);margin-top:var(--space-3);padding-top:var(--space-2);">' +
            '<span class="edit-row__index">目标 ' + (gIdx + 1) + ' / ' + goals.length + '</span>' +
            '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除此目标</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '学习目标·例文',
      '<div class="edit-form edit-form--compact">' +
        '<div class="edit-list" data-list-group="learningGoals">' + items + '</div>' +
        '<div class="edit-add-row"><button type="button" class="edit-btn primary" data-edit-action="add">+ 添加一个学习目标</button></div>' +
      '</div>'
    );
  }

  // 模块 3：应用会话（紧凑行布局）
  function editRenderDialogue(d, moduleNum) {
    d = d || { title: '', lines: [] };
    const lines = d.lines && d.lines.length ? d.lines : [{ speaker: '', speakerReading: '', jp: '', cn: '', annotations: [{ jp: '', note: '' }] }];

    const lineItems = lines.map(function (ln, lnIdx) {
      ln = ln || {};
      const anns = (ln.annotations && ln.annotations.length) ? ln.annotations : [{ jp: '', note: '' }];
      const annItems = anns.map(function (an, anIdx) {
        return (
          '<div class="edit-row" style="margin-bottom:var(--space-2);" data-list-name="dlg-' + lnIdx + '-annotations" data-list-index="' + anIdx + '">' +
            '<div class="edit-row__main">' +
              '<div class="edit-cell"><label class="edit-cell__label">日文</label><input type="text" data-edit-field="对应日文 (jp)" value="' + escapeHTML(an.jp || '') + '"></div>' +
              '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">注释</label><input type="text" data-edit-field="注释 (note)" value="' + escapeHTML(an.note || '') + '"></div>' +
            '</div>' +
            '<div class="edit-row__footer">' +
              '<span class="edit-row__index">第 ' + (anIdx + 1) + ' 条</span>' +
              '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除</button>' +
            '</div>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="edit-row edit-row--dialogue" data-list-name="dialogue-lines" data-list-index="' + lnIdx + '">' +
          '<div class="edit-row__main">' +
            '<div class="edit-cell"><label class="edit-cell__label">发言人名</label><input type="text" data-edit-field="发言人名 (speaker)" value="' + escapeHTML(ln.speaker || '') + '"></div>' +
            '<div class="edit-cell"><label class="edit-cell__label">人名注音</label><input type="text" data-edit-field="人名注音 (speakerReading)" value="' + escapeHTML(ln.speakerReading || '') + '"></div>' +
            '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">台词日文</label><input type="text" data-edit-field="台词日文 (jp)" value="' + escapeHTML(ln.jp || '') + '"></div>' +
            '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">中文</label><input type="text" data-edit-field="中文 (cn)" value="' + escapeHTML(ln.cn || '') + '"></div>' +
          '</div>' +
          '<div class="edit-section-title" style="margin-top:var(--space-2);margin-bottom:0;">💬 注释</div>' +
          '<div class="edit-list edit-list--compact" data-list-group="dlg-' + lnIdx + '-annotations">' + annItems + '</div>' +
          '<div class="edit-add-row"><button type="button" class="edit-btn primary" data-edit-action="add">+ 添加注释</button></div>' +
          '<div class="edit-row__footer" style="border-top:1px dashed var(--color-border);margin-top:var(--space-2);padding-top:var(--space-2);">' +
            '<span class="edit-row__index">第 ' + (lnIdx + 1) + ' / ' + lines.length + ' 行</span>' +
            '<button type="button" class="edit-btn danger" data-edit-action="remove">🗑 删除此行</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '应用会话',
      '<div class="edit-form edit-form--compact">' +
        '<div class="edit-row" style="margin-bottom:var(--space-3);">' +
          '<div class="edit-row__main">' +
            '<div class="edit-cell edit-cell--full"><label class="edit-cell__label">会话标题</label><input type="text" data-edit-field="会话标题 (title)" value="' + escapeHTML(d.title || '') + '"></div>' +
          '</div>' +
        '</div>' +
        '<div class="edit-section-title">🎤 对话行</div>' +
        '<div class="edit-list edit-list--compact" data-list-group="dialogue-lines">' + lineItems + '</div>' +
        '<div class="edit-add-row"><button type="button" class="edit-btn primary" data-edit-action="add">+ 添加一行对话</button></div>' +
      '</div>'
    );
  }

  // 1. 今日目标 编辑
  function editRenderGoals(goals, moduleNum) {
    goals = goals && goals.length ? goals : [''];
    const items = goals.map(function (g, i) {
      return (
        '<div class="edit-list-item" data-list-name="goals" data-list-index="' + i + '">' +
          '<div class="field-group">' +
            '<label>目标内容（每行 1 条）</label>' +
            '<textarea data-edit-field="goal" placeholder="例如：掌握 ...">' + escapeHTML(g || '') + '</textarea>' +
          '</div>' +
          editItemHeader(i, goals.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '今日目标',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一条目标')
    );
  }

  // 2. 核心词汇 编辑
  function editRenderVocabulary(vocab, moduleNum) {
    vocab = vocab && vocab.length ? vocab : [{ word: '', reading: '', meaning: '', type: '' }];
    const items = vocab.map(function (v, i) {
      return (
        '<div class="edit-list-item" data-list-name="vocabulary" data-list-index="' + i + '">' +
          '<div class="edit-list-row cols-4">' +
            editField('单词 (word)', v.word, '例：私') +
            editField('假名 (reading)', v.reading, '例：わたし') +
            editField('释义 (meaning)', v.meaning, '例：我') +
            editField('词性 (type)', v.type, '例：名词') +
          '</div>' +
          editItemHeader(i, vocab.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '核心词汇',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一个单词')
    );
  }

  // 3. 核心语法 编辑
  function editRenderGrammar(grammar, moduleNum) {
    grammar = grammar && grammar.length ? grammar : [{ pattern: '', meaning: '', desc: '', struct: '' }];
    const items = grammar.map(function (g, i) {
      return (
        '<div class="edit-list-item" data-list-name="grammar" data-list-index="' + i + '">' +
          '<div class="edit-list-row cols-2">' +
            editField('句型 (pattern)', g.pattern, '例：A は B です') +
            editField('含义 (meaning)', g.meaning, '例：A 是 B') +
          '</div>' +
          editField('详细说明 (desc)', g.desc, '详细说明，可换行', true) +
          editField('结构公式 (struct)', g.struct, '例：[名词A] + は + [名词B] + です') +
          editItemHeader(i, grammar.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '核心语法',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一个语法点')
    );
  }

  // 4. 例句 编辑
  function editRenderExamples(examples, moduleNum) {
    examples = examples && examples.length ? examples : [{ jp: '', reading: '', cn: '', struct: '' }];
    const items = examples.map(function (e, i) {
      return (
        '<div class="edit-list-item" data-list-name="examples" data-list-index="' + i + '">' +
          editField('日文 (jp)', e.jp, '例：私は中国人です。') +
          '<div class="edit-list-row cols-2">' +
            editField('假名注音 (reading)', e.reading, '例：わたしは ちゅうごくじん です。') +
            editField('语法结构 (struct)', e.struct, '例：私 は 中国人 です → A=私, B=中国人') +
          '</div>' +
          editField('中文翻译 (cn)', e.cn, '例：我是中国人。') +
          editItemHeader(i, examples.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '例句',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一个例句')
    );
  }

  // 5. 易错点 编辑
  function editRenderMistakes(mistakes, moduleNum) {
    mistakes = mistakes && mistakes.length ? mistakes : [{ wrong: '', right: '', reason: '' }];
    const items = mistakes.map(function (m, i) {
      return (
        '<div class="edit-list-item" data-list-name="mistakes" data-list-index="' + i + '">' +
          '<div class="edit-list-row cols-2">' +
            editField('错误写法 (wrong)', m.wrong, '例：私は中国人（です漏掉）') +
            editField('正确写法 (right)', m.right, '例：私は中国人です。') +
          '</div>' +
          editField('原因说明 (reason)', m.reason, '说明为什么错', true) +
          editItemHeader(i, mistakes.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '易错点',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一个易错点')
    );
  }

  // 6. 小练习 编辑
  function editRenderQuiz(quiz, moduleNum) {
    quiz = quiz && quiz.length ? quiz : [{ question: '', sub: '', options: ['', '', '', ''], answerIndex: 0, explain: '' }];
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const items = quiz.map(function (q, qi) {
      const options = (q.options && q.options.length ? q.options : ['', '']).map(function (opt, oi) {
        const isAnswer = oi === q.answerIndex;
        return (
          '<div class="quiz-edit-option ' + (isAnswer ? 'is-answer' : '') + '">' +
            '<div class="radio-holder">' +
              '<input type="radio" name="quiz-answer-' + qi + '" data-quiz-answer="' + qi + '" value="' + oi + '"' + (isAnswer ? ' checked' : '') + '>' +
              '<span style="font-size:var(--fs-xs);font-weight:700;">' + letters[oi] + '</span>' +
            '</div>' +
            '<input type="text" data-quiz-option="' + qi + ',' + oi + '" value="' + escapeHTML(opt || '') + '" placeholder="选项文本">' +
            '<button type="button" class="edit-btn danger" data-quiz-del-option="' + qi + ',' + oi + '">×</button>' +
          '</div>'
        );
      }).join('');

      return (
        '<div class="edit-list-item" data-list-name="quiz" data-list-index="' + qi + '">' +
          editField('题目 (question)', q.question, '例："我是日本人"怎么说？') +
          editField('副标题/提示 (sub)', q.sub, '可空') +
          '<div class="quiz-edit-options" data-quiz-options-wrap="' + qi + '">' +
            options +
          '</div>' +
          '<button type="button" class="edit-btn" data-quiz-add-option="' + qi + '">+ 添加一个选项</button>' +
          editField('解析 (explain)', q.explain, '答对/答错后都会显示这段解析', true) +
          editItemHeader(qi, quiz.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '小练习',
      '<div class="edit-form edit-list">' + items + '</div>' + editAddButton('添加一道题')
    );
  }

  // 7. 自己造句 编辑
  function editRenderSentencePractice(sp, moduleNum) {
    sp = sp || { hint: '', tips: [] };
    const tips = sp.tips && sp.tips.length ? sp.tips : [{ word: '', meaning: '' }];
    const tipsItems = tips.map(function (t, i) {
      return (
        '<div class="edit-list-item" style="padding:var(--space-3);" data-list-name="sp-tips" data-list-index="' + i + '">' +
          '<div class="edit-list-row cols-2">' +
            editField('词/词组 (word)', t.word, '') +
            editField('释义 (meaning)', t.meaning, '') +
          '</div>' +
          editItemHeader(i, tips.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '自己造句',
      '<div class="edit-form">' +
        editField('填写提示 (hint)', sp.hint, '例如：请用 "A は B です" 造句...', true) +
        '<div style="margin-top:var(--space-4);">' +
          '<div style="font-size:var(--fs-xs);color:var(--color-text-secondary);font-weight:600;margin-bottom:var(--space-3);letter-spacing:0.03em;">参考词汇提示卡（学生造句时展示）</div>' +
          '<div class="edit-list">' + tipsItems + '</div>' +
          editAddButton('添加一条词汇提示') +
        '</div>' +
      '</div>'
    );
  }

  // 8. 今日开口 编辑
  function editRenderSpeakPractice(sp, speakTip, moduleNum) {
    sp = sp && sp.length ? sp : [{ jp: '', reading: '', cn: '' }];
    const items = sp.map(function (p, i) {
      return (
        '<div class="edit-list-item" data-list-name="speakPractice" data-list-index="' + i + '">' +
          editField('日文句子 (jp)', p.jp, '例：はじめまして。') +
          '<div class="edit-list-row cols-2">' +
            editField('注音/罗马音 (reading)', p.reading, '例：hajimemashite.') +
            editField('中文 (cn)', p.cn, '例：初次见面。') +
          '</div>' +
          editItemHeader(i, sp.length) +
        '</div>'
      );
    }).join('');

    return buildModule(moduleNum, '今日开口',
      '<div class="edit-form edit-list">' + items + '</div>' +
      editAddButton('添加一句开口表达') +
      '<div style="margin-top:var(--space-4);">' +
        editField('开口提示 (speakTip)', speakTip, '例如：找镜子看着自己说，每句至少说 5 遍。', true) +
      '</div>'
    );
  }

  // 9. 完成课程模块（编辑模式只显示提示，不让打完成按钮）
  function editRenderCompleteSection(moduleNum) {
    return buildModule(moduleNum, '完成课程',
      '<div class="complete-section" style="padding:var(--space-5);gap:var(--space-3);border-top:none;background:var(--color-bg-soft);">' +
        '<div class="complete-title">编辑模式下无法标记完成</div>' +
        '<div class="complete-sub">请先"保存编辑" → "返回阅读模式"，再回来点击"完成这一课"按钮。</div>' +
      '</div>'
    );
  }

  /* ============================================================
     从表单读取 & 组装成 lesson 对象
     ============================================================ */
  function readTextarea(el, fallback) {
    if (!el) return fallback == null ? '' : fallback;
    const v = el.value;
    return v != null ? v : (fallback == null ? '' : fallback);
  }
  function readInput(el, fallback) {
    if (!el) return fallback == null ? '' : fallback;
    const v = el.value;
    return v != null ? v : (fallback == null ? '' : fallback);
  }

  function readItemFields(itemEl, fieldMap) {
    const out = {};
    fieldMap.forEach(function (map) {
      const selector = map.selector || ('[data-edit-field="' + map.field + '"]');
      const el = itemEl.querySelector(selector);
      if (el) {
        const raw = el.tagName === 'TEXTAREA' ? readTextarea(el, '') : readInput(el, '');
        out[map.out] = raw;
      } else {
        out[map.out] = map.default != null ? map.default : '';
      }
    });
    return out;
  }

  function collectListItems(rootEl, listName) {
    const items = rootEl.querySelectorAll('[data-list-name="' + listName + '"]');
    return Array.prototype.map.call(items, function (el) { return el; });
  }

  // 按 scope + 后缀 匹配 data-list-name（不依赖前缀 gIdx，支持上下移后正确收集）
  function collectListItemsBySuffix(scopeEl, suffix) {
    const all = scopeEl.querySelectorAll('[data-list-name]');
    const out = [];
    for (let i = 0; i < all.length; i++) {
      const name = all[i].getAttribute('data-list-name') || '';
      if (name.length >= suffix.length && name.slice(-suffix.length) === suffix) {
        out.push(all[i]);
      }
    }
    // 按 DOM 顺序稳定排序（all 本身已 querySelectorAll 深度优先）
    return out;
  }

  function collectFormData(lessonId) {
    const root = document.getElementById('lessonContent');
    if (!root) return null;

    // 磁盘/已存储原版（用于兼容字段兜底，比如 grammar）
    const original = App.getLessonById(lessonId) || {};

    // 0. 元信息
    // 本地覆盖以原始课程 ID 为键；编辑 ID 会让覆盖版无法再被课程列表找到。
    const id = lessonId;
    const day = original.day || '';
    // 课程名称已迁至学习导航编辑；单课内容编辑时保留当前名称，避免覆盖为留空值。
    const title = readInput(root.querySelector('[data-field="title"]'), original.title || '');
    const subtitle = readInput(root.querySelector('[data-field="subtitle"]'), original.subtitle || '');

    // ===== 新 Schema 3 大模块 =====

    // 模块1：vocabulary（4 列：word/reading/meaning/accent）+ phrases
    // type 和 note 字段已从编辑 UI 中移除，保存时从原始数据保留
    const originalVocab = original.vocabulary || [];
    const vocabulary = collectListItems(root, 'vocabulary').map(function (item, idx) {
      const originalItem = originalVocab[idx] || {};
      const readItem = readItemFields(item, [
        { field: '汉字·外来语 (word)', out: 'word' },
        { field: '假名注音 (reading)', out: 'reading' },
        { field: '释义 (meaning)', out: 'meaning' },
        { field: '语调 (accent)', out: 'accent' }
      ]);
      // 保留原始的 type 和 note（不在编辑 UI 中）
      readItem.type = originalItem.type || '';
      readItem.note = originalItem.note || '';
      return readItem;
    }).filter(function (v) { return (v.word && v.word.trim()) || (v.reading && v.reading.trim()); });

    const phrases = collectListItems(root, 'phrases').map(function (item) {
      return readItemFields(item, [
        { field: '短语 (phrase)', out: 'phrase' },
        { field: '注音 (reading)', out: 'reading' },
        { field: '释义 (meaning)', out: 'meaning' },
        { field: '备注 (note)', out: 'note' }
      ]);
    }).filter(function (p) { return (p.phrase && p.phrase.trim()) || (p.reading && p.reading.trim()); });

    // 模块2：learningGoals[]（每个 goal 自己的表单；structure/examples 按 gEl scope + 后缀匹配，不依赖 gIdx 前缀）
    const learningGoalsEls = collectListItems(root, 'learningGoals');
    const learningGoals = learningGoalsEls.map(function (gEl, gIdx) {
      // 头部 2 字段（不再使用 mp3 / page 教材残留）
      const goalNumber = readInput(gEl.querySelector('[data-edit-field="学习目标编号 (goalNumber)"]'), '');
      const goalTitle = readInput(gEl.querySelector('[data-edit-field="标题 (goalTitle)"]'), '');

      // 主例句 3 字段
      const mainEx = {
        jp: readInput(gEl.querySelector('[data-edit-field="主例句日文 (jp)"]'), ''),
        reading: readInput(gEl.querySelector('[data-edit-field="注音 (reading)"]'), ''),
        cn: readTextarea(gEl.querySelector('[data-edit-field="中文 (cn)"]'), ''),
        structure: []
      };
      // 结构块：按 gEl scope + 后缀匹配（不依赖当前 gIdx，支持上下移）
      const structEls = collectListItemsBySuffix(gEl, '-structure');
      mainEx.structure = structEls.map(function (bEl) {
        return readItemFields(bEl, [
          { field: '结构块日文 (jp)', out: 'jp' },
          { field: '语法角色 (role)', out: 'role' },
          { field: '中文对照 (cn)', out: 'cn' }
        ]);
      }).filter(function (b) { return (b.jp && b.jp.trim()) || (b.role && b.role.trim()); });

      // 例文列表：按 gEl scope + 后缀匹配
      const exEls = collectListItemsBySuffix(gEl, '-examples');
      const examples = exEls.map(function (exEl) {
        return readItemFields(exEl, [
          { field: '例文日文 (jp)', out: 'jp' },
          { field: '假名注音 (reading)', out: 'reading' },
          { field: '中文 (cn)', out: 'cn' },
          { field: '下划线标注词 (focus)', out: 'focus' },
          { field: '小字备注 (note)', out: 'note' }
        ]);
      }).filter(function (e) { return e.jp && e.jp.trim(); });

      return {
        goalNumber: goalNumber || (gIdx + 1),
        goalTitle: goalTitle,
        mainExample: mainEx,
        examples: examples
      };
    }).filter(function (g) { return g.goalTitle && g.goalTitle.trim(); });
    // 按 DOM 实际顺序重算 goalNumber（上下移按钮交换后，保存时编号自动正确）
    learningGoals.forEach(function (g, i) { g.goalNumber = i + 1; });

    // 模块3：dialogue（title + lines[]，line.annnotations）
    const dialogue = {
      title: readInput(root.querySelector('[data-edit-field="会话标题 (title)"]'), ''),
      lines: []
    };
    const dlgLineEls = collectListItems(root, 'dialogue-lines');
    dialogue.lines = dlgLineEls.map(function (lnEl, lnIdx) {
      const line = readItemFields(lnEl, [
        { field: '发言人名 (speaker)', out: 'speaker' },
        { field: '人名注音 (speakerReading)', out: 'speakerReading' },
        { field: '台词日文 (jp)', out: 'jp' },
        { field: '中文 (cn)', out: 'cn' }
      ]);
      // 注释
      const annEls = collectListItems(root, 'dlg-' + lnIdx + '-annotations');
      line.annotations = annEls.map(function (anEl) {
        return readItemFields(anEl, [
          { field: '对应日文 (jp)', out: 'jp' },
          { field: '注释 (note)', out: 'note' }
        ]);
      }).filter(function (an) { return (an.jp && an.jp.trim()) || (an.note && an.note.trim()); });
      return line;
    }).filter(function (l) { return (l.jp && l.jp.trim()) || (l.speaker && l.speaker.trim()); });

    // ===== 旧兼容字段（收集或兜底） =====

    // 1. goals（旧模块）：表单已移除，收集为空数组或保留原版
    const goals = collectListItems(root, 'goals').map(function (item) {
      return readTextarea(item.querySelector('[data-edit-field="goal"]'), '');
    }).filter(function (s) { return s && s.trim().length > 0; });

    // 2. grammar（兼容目录页 course-grammar）：如果没编辑就兜底用原版
    let grammar = collectListItems(root, 'grammar').map(function (item) {
      return readItemFields(item, [
        { field: '句型 (pattern)', out: 'pattern' },
        { field: '含义 (meaning)', out: 'meaning' },
        { field: '详细说明 (desc)', out: 'desc' },
        { field: '结构公式 (struct)', out: 'struct' }
      ]);
    }).filter(function (g) { return g.pattern && g.pattern.trim(); });
    if (!grammar.length && original.grammar && original.grammar.length) {
      grammar = original.grammar;
    }

    // 3. examples（旧）：表单已移除，空或保留原版
    let examples = collectListItems(root, 'examples').map(function (item) {
      return readItemFields(item, [
        { field: '日文 (jp)', out: 'jp' },
        { field: '假名注音 (reading)', out: 'reading' },
        { field: '中文翻译 (cn)', out: 'cn' },
        { field: '语法结构 (struct)', out: 'struct' }
      ]);
    }).filter(function (e) { return e.jp && e.jp.trim(); });
    if (!examples.length && original.examples && original.examples.length) {
      examples = original.examples;
    }

    // 4. mistakes
    const mistakes = collectListItems(root, 'mistakes').map(function (item) {
      return readItemFields(item, [
        { field: '错误写法 (wrong)', out: 'wrong' },
        { field: '正确写法 (right)', out: 'right' },
        { field: '原因说明 (reason)', out: 'reason' }
      ]);
    }).filter(function (m) { return (m.right && m.right.trim()) || (m.reason && m.reason.trim()); });

    // 5. quiz - 比较特殊，自己读
    const quizItems = collectListItems(root, 'quiz');
    const quiz = quizItems.map(function (qEl, qi) {
      const q = {
        question: readInput(qEl.querySelector('[data-edit-field="题目 (question)"]'), ''),
        sub: readInput(qEl.querySelector('[data-edit-field="副标题/提示 (sub)"]'), ''),
        explain: readTextarea(qEl.querySelector('[data-edit-field="解析 (explain)"]'), ''),
        options: [],
        answerIndex: 0
      };
      const answerRadio = qEl.querySelector('input[type="radio"][data-quiz-answer="' + qi + '"]:checked');
      q.answerIndex = answerRadio ? parseInt(answerRadio.value, 10) : 0;

      const optInputs = qEl.querySelectorAll('input[type="text"][data-quiz-option^="' + qi + ',"]');
      optInputs.forEach(function (inp) {
        q.options.push(readInput(inp, ''));
      });
      q.options = q.options.map(function (o) { return o || ''; });
      if (q.options.length < 2) {
        while (q.options.length < 2) q.options.push('');
      }
      if (q.answerIndex < 0 || q.answerIndex >= q.options.length) q.answerIndex = 0;
      return q;
    }).filter(function (q) { return q.question && q.question.trim(); });

    // 6. sentencePractice
    const spHint = readTextarea(root.querySelector('[data-edit-field="填写提示 (hint)"]'), '');
    const spTipsEls = collectListItems(root, 'sp-tips');
    const spTips = spTipsEls.map(function (item) {
      return readItemFields(item, [
        { field: '词/词组 (word)', out: 'word' },
        { field: '释义 (meaning)', out: 'meaning' }
      ]);
    }).filter(function (t) { return (t.word && t.word.trim()) || (t.meaning && t.meaning.trim()); });
    const sentencePractice = {
      hint: spHint,
      tips: spTips
    };

    // 7. speakPractice + speakTip
    const speakPractice = collectListItems(root, 'speakPractice').map(function (item) {
      return readItemFields(item, [
        { field: '日文句子 (jp)', out: 'jp' },
        { field: '注音/罗马音 (reading)', out: 'reading' },
        { field: '中文 (cn)', out: 'cn' }
      ]);
    }).filter(function (p) { return p.jp && p.jp.trim(); });
    const speakTip = readTextarea(root.querySelector('[data-edit-field="开口提示 (speakTip)"]'), '');

    return {
      id: id,
      day: day,
      title: title,
      subtitle: subtitle,
      // 新字段
      vocabulary: vocabulary,
      phrases: phrases,
      learningGoals: learningGoals,
      dialogue: dialogue,
      // 兼容字段
      goals: goals,
      grammar: grammar,
      examples: examples,
      mistakes: mistakes,
      quiz: quiz,
      sentencePractice: sentencePractice,
      speakPractice: speakPractice,
      speakTip: speakTip
    };
  }

  /* ============================================================
     整体渲染 & 工具栏按钮
     ============================================================ */

  function renderLesson(lesson) {
    const container = document.getElementById('lessonContent');
    if (!container) return;

    let sections = [];

    if (isEditMode) {
      var activeTab = '1';
      try { activeTab = localStorage.getItem('jp_lesson_tab_edit') || '1'; } catch (e) {}

      var tabDefs = [
        { id: '1', label: '单词·短语', icon: '📘' },
        { id: '2', label: '学习目标', icon: '🎯' },
        { id: '3', label: '应用会话', icon: '💬' }
      ];

      var tabBar =
        '<div class="lesson-tabs" role="tablist">' +
          tabDefs.map(function (t) {
            var isActive = t.id === activeTab;
            return '<button type="button" class="lesson-tab' + (isActive ? ' is-active' : '') + '" ' +
              'role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" ' +
              'data-module-tab-edit="' + t.id + '">' +
                '<span class="lesson-tab__icon">' + t.icon + '</span>' +
                '<span class="lesson-tab__label">' + t.label + '</span>' +
              '</button>';
          }).join('') +
        '</div>';

      var module1 = editRenderVocabularyList(lesson.vocabulary, lesson.phrases, '1');
      var module2 = editRenderLearningGoals(lesson.learningGoals, '2');
      var module3 = editRenderDialogue(lesson.dialogue, '3');

      var panel = function (id, html) {
        var show = id === activeTab;
        return '<div class="lesson-tab-panel' + (show ? ' is-active' : '') + '" ' +
          'role="tabpanel" data-module-panel-edit="' + id + '"' +
          (show ? '' : ' hidden') + '>' + (html || '') + '</div>';
      };

      sections = [
        renderEditToolbar(lesson.id, lesson),
        renderEditLessonHeader(lesson),
        tabBar,
        panel('1', module1),
        panel('2', module2),
        panel('3', module3)
      ];
    } else {
      const adj = App.getAdjacentLessons(lesson.id);
      const prevHTML = adj.prev
        ? '<a href="lesson.html?id=' + escapeHTML(adj.prev.id) + '" class="btn btn-outline btn-sm">← ' + escapeHTML(adj.prev.title) + '</a>'
        : '<button class="btn btn-outline btn-sm" disabled>已是第一课</button>';
      const nextHTML = adj.next
        ? '<a href="lesson.html?id=' + escapeHTML(adj.next.id) + '" class="btn btn-outline btn-sm">' + escapeHTML(adj.next.title) + ' →</a>'
        : '<button class="btn btn-outline btn-sm" disabled>暂无下一课</button>';

      const header =
        '<div class="lesson-header">' +
          '<div class="edit-toolbar">' +
            '<div class="status ' + (App.hasLessonEdit(lesson.id) ? 'is-edited' : '') + '" style="margin-bottom:0;">' +
              (App.hasLessonEdit(lesson.id) ? '当前显示为你在"编辑模式"下保存的版本（仅本地）' : '当前显示为 lessons.js 原版') +
            '</div>' +
            '<div class="edit-toolbar-spacer"></div>' +
            '<a class="btn btn-sm btn-outline" id="btnAIExplain" href="ai.html?tool=grammar_explain&q=' + encodeURIComponent(lesson.grammar && lesson.grammar[0] ? lesson.grammar[0].pattern : lesson.title) + '">✦ AI 解释语法</a>' +
            '<button type="button" class="btn btn-sm btn-outline" id="btnEnterEditMode">✎ 编辑这一课</button>' +
          '</div>' +
          '<div class="lesson-day">' + escapeHTML(lessonLabel(lesson)) + '</div>' +
          '<h2 class="lesson-title">' + escapeHTML(lesson.title) + '</h2>' +
          '<p class="lesson-sub">' + escapeHTML(lesson.subtitle || '') + '</p>' +
          '<div class="lesson-nav">' + prevHTML + nextHTML + '</div>' +
        '</div>';

      // 模块切换 Tab 栏：每段内容下方直接承接对应练习与达标评估
      var activeTab = '1';
      try { activeTab = localStorage.getItem('jp_lesson_tab') || '1'; } catch (e) {}
      if (['1', '2', '3'].indexOf(activeTab) === -1) activeTab = '1';

      var tabDefs = [
        { id: '1', label: '单词·短语', icon: '📘' },
        { id: '2', label: '学习目标', icon: '🎯' },
        { id: '3', label: '应用会话', icon: '💬' }
      ];

      var tabBar =
        '<div class="lesson-tabs" role="tablist">' +
          tabDefs.map(function (t) {
            var isActive = t.id === activeTab;
            return '<button type="button" class="lesson-tab' + (isActive ? ' is-active' : '') + '" ' +
              'role="tab" aria-selected="' + (isActive ? 'true' : 'false') + '" ' +
              'data-module-tab="' + t.id + '">' +
                '<span class="lesson-tab__icon">' + t.icon + '</span>' +
                '<span class="lesson-tab__label">' + t.label + '</span>' +
              '</button>';
          }).join('') +
        '</div>';

      var renderPractice = window.Practice && typeof window.Practice.renderModule === 'function'
        ? function (moduleKey) { return window.Practice.renderModule(lesson, moduleKey); }
        : function () { return '<p class="muted">练习模块正在加载，请刷新页面重试。</p>'; };
      var module1 = renderVocabularyTable(lesson) + renderPractice('vocabulary');
      var module2 = renderLearningGoalsBlock(lesson) + renderPractice('goals');
      var module3 = renderDialogueBlock(lesson) + renderPractice('dialogue');

      var panel = function (id, html) {
        var show = id === activeTab;
        return '<div class="lesson-tab-panel' + (show ? ' is-active' : '') + '" ' +
          'role="tabpanel" data-module-panel="' + id + '"' +
          (show ? '' : ' hidden') + '>' + (html || '') + '</div>';
      };

      sections = [
        header,
        tabBar,
        panel('1', module1),
        panel('2', module2),
        panel('3', module3)
      ];
    }

    container.innerHTML = sections.join('');
  }

  /* ============================================================
     编辑模式交互：列表增删 + quiz 选项增删
     ============================================================ */

  function bindEditListInteractions() {
    // 通用：删除 / 添加
    document.querySelectorAll('[data-edit-action="remove"]').forEach(function (btn) {
      if (btn._editBound) return;
      btn._editBound = true;
      btn.addEventListener('click', function () {
        const item = btn.closest('[data-list-name]');
        if (!item) return;
        if (!confirm('确定要删除这一项吗？')) return;
        const list = item.parentElement;
        const listName = item.getAttribute('data-list-name');
        item.remove();
        if (!listName) return;
        if (listName === 'learningGoals') renumberLearningGoals(list);
        else if (listName === 'dialogue-lines') renumberDialogueLines(list);
        else renumberDirectList(list, listName);
        markEditDirty();
      });
    });

    document.querySelectorAll('[data-edit-action="add"]').forEach(function (btn) {
      if (btn._editBound) return;
      btn._editBound = true;
      btn.addEventListener('click', function () {
        // 找到对应的 edit-list（前一个兄弟节点）
        const prevEditList = btn.parentElement.previousElementSibling;
        if (!prevEditList || !prevEditList.classList.contains('edit-list')) return;
        const sample = Array.prototype.find.call(prevEditList.children, function (child) {
          return child.hasAttribute('data-list-name');
        });
        if (!sample) return;
        const newItem = sample.cloneNode(true);
        // 清空所有输入
        newItem.querySelectorAll('input, textarea, select').forEach(function (inp) {
          if (inp.type === 'radio') {
            inp.checked = false;
          } else {
            inp.value = '';
          }
        });
        prevEditList.appendChild(newItem);
        const listName = newItem.getAttribute('data-list-name');
        if (listName === 'learningGoals') renumberLearningGoals(prevEditList);
        else if (listName === 'dialogue-lines') renumberDialogueLines(prevEditList);
        else renumberDirectList(prevEditList, listName);
        markEditDirty();
        newItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rebindAllEditInteractions();
      });
    });

    // ===== 学习目标卡片：↑ 上移 / ↓ 下移 =====
    document.querySelectorAll('[data-lg-move-up]').forEach(function (btn) {
      if (btn._lgBound) return;
      btn._lgBound = true;
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.getAttribute('data-lg-move-up'), 10);
        if (isNaN(idx) || idx <= 0) return;
        const list = btn.closest('.edit-list');
        if (!list) return;
        const items = list.querySelectorAll(':scope > [data-list-name="learningGoals"]');
        if (!items.length || idx >= items.length) return;
        const current = items[idx];
        const prev = items[idx - 1];
        list.insertBefore(current, prev);
        renumberLearningGoals(list);
        markEditDirty();
        rebindAllEditInteractions();
      });
    });
    document.querySelectorAll('[data-lg-move-down]').forEach(function (btn) {
      if (btn._lgBound) return;
      btn._lgBound = true;
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.getAttribute('data-lg-move-down'), 10);
        if (isNaN(idx)) return;
        const list = btn.closest('.edit-list');
        if (!list) return;
        const items = list.querySelectorAll(':scope > [data-list-name="learningGoals"]');
        if (!items.length || idx >= items.length - 1) return;
        const current = items[idx];
        const next = items[idx + 1];
        list.insertBefore(next, current);
        renumberLearningGoals(list);
        markEditDirty();
        rebindAllEditInteractions();
      });
    });

    // Quiz：选项增删 + 正确答案
    document.querySelectorAll('[data-quiz-add-option]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const qi = parseInt(btn.getAttribute('data-quiz-add-option'), 10);
        if (isNaN(qi)) return;
        const wrap = document.querySelector('[data-quiz-options-wrap="' + qi + '"]');
        if (!wrap) return;
        const existing = wrap.querySelectorAll('.quiz-edit-option');
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const oi = existing.length;
        const letter = letters[oi] || ('+' + oi);
        const html =
          '<div class="quiz-edit-option">' +
            '<div class="radio-holder">' +
              '<input type="radio" name="quiz-answer-' + qi + '" data-quiz-answer="' + qi + '" value="' + oi + '">' +
              '<span style="font-size:var(--fs-xs);font-weight:700;">' + letter + '</span>' +
            '</div>' +
            '<input type="text" data-quiz-option="' + qi + ',' + oi + '" value="" placeholder="新选项文本">' +
            '<button type="button" class="edit-btn danger" data-quiz-del-option="' + qi + ',' + oi + '">×</button>' +
          '</div>';
        wrap.insertAdjacentHTML('beforeend', html);
        markEditDirty();
        rebindQuizOptionInteractions();
      });
    });

    rebindQuizOptionInteractions();
  }

  function renumberDirectList(listEl, listName) {
    if (!listEl || !listName) return;
    const siblings = Array.prototype.filter.call(listEl.children, function (child) {
      return child.getAttribute('data-list-name') === listName;
    });
    siblings.forEach(function (sib, i) {
      sib.setAttribute('data-list-index', i);
      const idx = sib.querySelector('.edit-list-index, .edit-row__index');
      if (idx) idx.textContent = '第 ' + (i + 1) + ' / ' + siblings.length + ' 项';
    });
  }

  // learningGoals 列表 swap 后重编号：data-list-index / 头部文本 "学习目标 N" / ↑↓按钮 disabled 状态 / 嵌套 data-list-group 前缀 / data-list-name 前缀
  function renumberLearningGoals(listEl) {
    if (!listEl) return;
    const items = listEl.querySelectorAll(':scope > [data-list-name="learningGoals"]');
    const total = items.length;
    items.forEach(function (sib, i) {
      // 1) data-list-index
      sib.setAttribute('data-list-index', i);
      // 2) 底部进度文字
      const idxEl = sib.querySelector('.edit-list-index, .edit-row__index');
      if (idxEl) idxEl.textContent = '目标 ' + (i + 1) + ' / ' + total;
      // 3) 头部"学习目标 N"文本
      const headNum = sib.querySelector('.edit-goal-title');
      if (headNum) headNum.textContent = '🎯 学习目标 ' + (i + 1);
      // 4) ↑↓按钮 disabled / attr 重新赋值
      const moveBtnsWrap = sib.querySelector('.lg-move-btns');
      if (moveBtnsWrap) {
        // 重写按钮：第一个无上移，最后一个无下移
        const upDisabled = i === 0;
        const downDisabled = i === total - 1;
        moveBtnsWrap.innerHTML =
          (upDisabled ? '<button type="button" class="lg-move-btn" disabled>↑</button>'
                      : '<button type="button" class="lg-move-btn" data-lg-move-up="' + i + '" title="上移">↑</button>') +
          (downDisabled ? '<button type="button" class="lg-move-btn" disabled>↓</button>'
                        : '<button type="button" class="lg-move-btn" data-lg-move-down="' + i + '" title="下移">↓</button>');
      }
      // 5) 嵌套的 structure/examples 子列表：重写 data-list-group / data-list-name 前缀为 lg-{i}-*（保证新增按钮能匹配到正确组）
      const gname = 'lg-' + i + '-';
      ['structure', 'examples'].forEach(function (suffix) {
        const groupEl = sib.querySelector('[data-list-group$="-' + suffix + '"]');
        if (groupEl) groupEl.setAttribute('data-list-group', gname + suffix);
        const subItems = sib.querySelectorAll('[data-list-name$="-' + suffix + '"]');
        subItems.forEach(function (si, j) {
          si.setAttribute('data-list-name', gname + suffix);
          si.setAttribute('data-list-index', j);
          const subIdxEl = si.querySelector('.edit-list-index, .edit-row__index');
          if (subIdxEl) {
            const subTotal = sib.querySelectorAll('[data-list-name="' + gname + suffix + '"]').length;
            subIdxEl.textContent = '第 ' + (j + 1) + ' / ' + subTotal + (suffix === 'structure' ? ' 块' : ' 条');
          }
        });
      });
    });
  }

  function renumberDialogueLines(listEl) {
    if (!listEl) return;
    const lines = Array.prototype.filter.call(listEl.children, function (child) {
      return child.getAttribute('data-list-name') === 'dialogue-lines';
    });
    lines.forEach(function (line, i) {
      line.setAttribute('data-list-index', i);
      const lineIndex = line.querySelector(':scope > .edit-row__footer .edit-row__index');
      if (lineIndex) lineIndex.textContent = '第 ' + (i + 1) + ' / ' + lines.length + ' 行';

      const annList = line.querySelector('[data-list-group$="-annotations"]');
      const annName = 'dlg-' + i + '-annotations';
      if (annList) annList.setAttribute('data-list-group', annName);
      const annotations = line.querySelectorAll('[data-list-name$="-annotations"]');
      annotations.forEach(function (annotation, index) {
        annotation.setAttribute('data-list-name', annName);
        annotation.setAttribute('data-list-index', index);
        const annotationIndex = annotation.querySelector('.edit-row__index');
        if (annotationIndex) annotationIndex.textContent = '第 ' + (index + 1) + ' / ' + annotations.length + ' 条';
      });
    });
  }

  function rebindQuizOptionInteractions() {
    // 删除选项
    document.querySelectorAll('[data-quiz-del-option]').forEach(function (btn) {
      if (btn._editBound) return;
      btn._editBound = true;
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-quiz-del-option');
        if (!key) return;
        const parts = key.split(',');
        const qi = parseInt(parts[0], 10);
        const itemEl = btn.closest('.edit-list-item[data-list-name="quiz"]');
        const wrap = itemEl ? itemEl.querySelector('[data-quiz-options-wrap="' + qi + '"]') : null;
        if (!wrap) return;
        const total = wrap.querySelectorAll('.quiz-edit-option');
        if (total.length <= 2) {
          alert('一道题至少要保留 2 个选项哦。');
          return;
        }
        btn.closest('.quiz-edit-option').remove();
        // 重新编号选项 index 和 answer radio value
        renumberQuizOptions(itemEl, qi);
        markEditDirty();
        // 重新绑定（data-quiz-del-option 变了）
        rebindQuizOptionInteractions();
      });
    });

    // 选中正确答案时高亮
    document.querySelectorAll('input[type="radio"][data-quiz-answer]').forEach(function (r) {
      if (r._editBound2) return;
      r._editBound2 = true;
      const apply = function () {
        const qi = r.getAttribute('data-quiz-answer');
        const wrap = document.querySelector('[data-quiz-options-wrap="' + qi + '"]');
        if (!wrap) return;
        const optEls = wrap.querySelectorAll('.quiz-edit-option');
        const radios = wrap.querySelectorAll('input[type="radio"][data-quiz-answer="' + qi + '"]');
        optEls.forEach(function (el) { el.classList.remove('is-answer'); });
        radios.forEach(function (rr, i) {
          if (rr.checked && optEls[i]) optEls[i].classList.add('is-answer');
        });
      };
      r.addEventListener('change', apply);
      apply();
    });
  }

  function renumberQuizOptions(quizItemEl, qi) {
    const wrap = quizItemEl.querySelector('[data-quiz-options-wrap="' + qi + '"]');
    if (!wrap) return;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const opts = wrap.querySelectorAll('.quiz-edit-option');
    let currentAnswer = 0;
    const radios = wrap.querySelectorAll('input[type="radio"][data-quiz-answer="' + qi + '"]');
    radios.forEach(function (r, i) { if (r.checked) currentAnswer = i; });

    opts.forEach(function (optEl, oi) {
      // letter
      const letterSpan = optEl.querySelector('.radio-holder span:last-child');
      if (letterSpan) letterSpan.textContent = letters[oi] || ('+' + oi);
      // radio name/value
      const r = optEl.querySelector('input[type="radio"][data-quiz-answer]');
      if (r) {
        r.setAttribute('data-quiz-answer', String(qi));
        r.name = 'quiz-answer-' + qi;
        r.value = String(oi);
        r.checked = (oi === currentAnswer);
      }
      // text input
      const ti = optEl.querySelector('input[type="text"][data-quiz-option]');
      if (ti) ti.setAttribute('data-quiz-option', qi + ',' + oi);
      // del btn
      const del = optEl.querySelector('[data-quiz-del-option]');
      if (del) del.setAttribute('data-quiz-del-option', qi + ',' + oi);
      // is-answer 高亮
      optEl.classList.toggle('is-answer', oi === currentAnswer);
    });
  }

  function rebindAllEditInteractions() {
    // 编辑模式的 Tab 切换
    document.querySelectorAll('[data-module-tab-edit]').forEach(function (tab) {
      if (tab._editTabBound) return;
      tab._editTabBound = true;
      tab.addEventListener('click', function () {
        var targetId = tab.getAttribute('data-module-tab-edit');
        document.querySelectorAll('[data-module-tab-edit]').forEach(function (t) {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        document.querySelectorAll('[data-module-panel-edit]').forEach(function (p) {
          var show = p.getAttribute('data-module-panel-edit') === targetId;
          p.classList.toggle('is-active', show);
          if (show) p.removeAttribute('hidden');
          else p.setAttribute('hidden', '');
        });
        try { localStorage.setItem('jp_lesson_tab_edit', targetId); } catch (e) {}
      });
    });

    bindEditListInteractions();
    bindEditDirtyTracking();
    bindEditNavigationGuard();
  }

  function setEditSaveStatus(message, state) {
    const status = document.getElementById('editSaveStatus');
    if (status) {
      status.textContent = message;
      status.classList.toggle('is-dirty', state === 'dirty');
      status.classList.toggle('is-edited', state === 'saved');
    }
    const saveBtn = document.getElementById('btnSaveEdit');
    if (saveBtn) saveBtn.disabled = state !== 'dirty';
  }

  function markEditDirty() {
    if (!isEditMode || isEditDirty) return;
    isEditDirty = true;
    document.body.classList.add('has-unsaved-edits');
    setEditSaveStatus('有未保存修改', 'dirty');
  }

  function clearEditDirty(saved) {
    isEditDirty = false;
    document.body.classList.remove('has-unsaved-edits');
    setEditSaveStatus(saved ? '已保存到本机（未同步到 lessons.js）' : '与 lessons.js 原版一致', saved ? 'saved' : 'idle');
  }

  function bindEditDirtyTracking() {
    document.querySelectorAll('.edit-form input, .edit-form textarea, .edit-form select, .edit-meta-card input').forEach(function (field) {
      if (field._editDirtyBound) return;
      field._editDirtyBound = true;
      field.addEventListener('input', markEditDirty);
      field.addEventListener('change', markEditDirty);
    });
  }

  function confirmDiscardEdits() {
    return !isEditDirty || confirm('你有未保存的修改，离开后将丢失这些内容。确定继续吗？');
  }

  function bindEditNavigationGuard() {
    if (document._editNavigationGuardBound) return;
    document._editNavigationGuardBound = true;
    document.addEventListener('click', function (event) {
      if (!isEditMode || !isEditDirty || event.defaultPrevented) return;
      const link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href').charAt(0) === '#') return;
      if (!confirmDiscardEdits()) event.preventDefault();
    });
  }

  /* ============================================================
     工具栏：保存 / 取消 / 重置 / 导出
     ============================================================ */

  function bindEditToolbar(lessonId) {
    const originalBackup = App.getLessonOriginalById(lessonId);

    const exitBtn = document.getElementById('btnExitEditMode');
    if (exitBtn) exitBtn.addEventListener('click', function () { exitEditMode(lessonId); });

    const saveBtn = document.getElementById('btnSaveEdit');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      const obj = collectFormData(lessonId);
      if (!obj) { alert('无法读取表单内容。'); return; }
      if (!obj.title || !obj.title.trim()) { alert('主标题不能为空。'); return; }
      const ok = App.saveLessonEdit(lessonId, obj);
      if (!ok) { alert('保存失败：LocalStorage 可能被禁用。'); return; }
      isEditDirty = false;
      document.body.classList.remove('has-unsaved-edits');
      renderLesson(obj);
      bindEditToolbar(lessonId);
      rebindAllEditInteractions();
      setEditSaveStatus('✓ 已保存到本机（未同步到 lessons.js）', 'saved');
    });

    const cancelBtn = document.getElementById('btnCancelEdit');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      if (!confirmDiscardEdits()) return;
      // 直接重新渲染已保存的版本
      exitEditMode(lessonId, true);
    });

    const resetBtn = document.getElementById('btnResetEdit');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      if (!confirm('这会把本课恢复为磁盘 lessons.js 中的原版，你在编辑模式里的本地保存内容会被清空，确认吗？')) return;
      App.resetLessonEdit(lessonId);
      // 用原版重新渲染编辑模式
      if (originalBackup) {
        isEditDirty = false;
        document.body.classList.remove('has-unsaved-edits');
        renderLesson(originalBackup);
        bindEditToolbar(lessonId);
        rebindAllEditInteractions();
      }
    });

    const exportBtn = document.getElementById('btnExportJSON');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      const obj = collectFormData(lessonId);
      if (!obj) return;
      const pretty = JSON.stringify(obj, null, 2);
      const resultEl = document.getElementById('exportResult');
      const contentEl = document.getElementById('exportJSONContent');
      if (resultEl) resultEl.classList.add('is-visible');
      if (contentEl) contentEl.textContent = pretty;
      if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const copyBtn = document.getElementById('btnCopyJSON');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      const contentEl = document.getElementById('exportJSONContent');
      if (!contentEl) return;
      const text = contentEl.textContent || '';
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          const old = copyBtn.textContent;
          copyBtn.textContent = '✓ 已复制';
          setTimeout(function () { copyBtn.textContent = old; }, 1500);
        }).catch(function () {
          fallbackCopy(text, copyBtn);
        });
      } else {
        fallbackCopy(text, copyBtn);
      }
    });

    const downloadBtn = document.getElementById('btnDownloadJSON');
    if (downloadBtn) downloadBtn.addEventListener('click', function () {
      const contentEl = document.getElementById('exportJSONContent');
      if (!contentEl) return;
      const text = contentEl.textContent || '';
      if (!text) return;
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (lessonId || 'lesson') + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
  }

  function fallbackCopy(text, btn) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        const old = btn.textContent;
        btn.textContent = '✓ 已复制';
        setTimeout(function () { btn.textContent = old; }, 1500);
      } else {
        alert('复制失败，请手动选中文本复制。');
      }
    } catch (e) {
      alert('复制失败：' + e.message);
    }
  }

  function exitEditMode(lessonId, discardConfirmed) {
    if (!discardConfirmed && !confirmDiscardEdits()) return;
    isEditMode = false;
    isEditDirty = false;
    try { localStorage.setItem(LS_MODE_KEY, '0'); } catch (e) {}
    document.body.classList.remove('is-edit-mode');
    const l = App.getLessonById(lessonId);
    if (l) {
      renderLesson(l);
      bindInteractions(lessonId);
      bindReadToolbar(lessonId);
    }
  }

  function enterEditMode(lessonId) {
    // 进入时，确保编辑的内容是：有覆盖读覆盖，没覆盖读原版
    const covered = App.hasLessonEdit(lessonId)
      ? deepClone(App.getLessonById(lessonId))
      : deepClone(App.getLessonOriginalById(lessonId));
    isEditMode = true;
    isEditDirty = false;
    try { localStorage.setItem(LS_MODE_KEY, '1'); } catch (e) {}
    document.body.classList.add('is-edit-mode');
    renderLesson(covered);
    bindEditToolbar(lessonId);
    rebindAllEditInteractions();
    clearEditDirty(App.hasLessonEdit(lessonId));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindReadToolbar(lessonId) {
    const btn = document.getElementById('btnEnterEditMode');
    if (btn && !btn._boundEdit) {
      btn._boundEdit = true;
      btn.addEventListener('click', function () { enterEditMode(lessonId); });
    }
  }

  /* ============================================================
     阅读模式交互
     ============================================================ */

  function bindInteractions(lessonId) {
    // 模块切换 Tab
    document.querySelectorAll('[data-module-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        var targetId = tab.getAttribute('data-module-tab');
        // 切换 Tab 按钮状态
        document.querySelectorAll('[data-module-tab]').forEach(function (t) {
          t.classList.toggle('is-active', t === tab);
          t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        // 切换面板显示
        document.querySelectorAll('[data-module-panel]').forEach(function (p) {
          var show = p.getAttribute('data-module-panel') === targetId;
          p.classList.toggle('is-active', show);
          if (show) p.removeAttribute('hidden');
          else p.setAttribute('hidden', '');
        });
        // 记忆选择
        try { localStorage.setItem('jp_lesson_tab', targetId); } catch (e) {}
      });
    });

    document.querySelectorAll('.vocab-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        // 点击的是 🔊 朗读按钮则不翻转
        if (e.target.closest('.vocab-play')) return;
        card.classList.toggle('is-flipped');
      });
    });

    // 词汇朗读按钮
    document.querySelectorAll('[data-vocab-play]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-vocab-play'), 10);
        const lesson = App.getLessonById(lessonId);
        if (!lesson || !lesson.vocabulary || !lesson.vocabulary[idx]) return;
        const v = lesson.vocabulary[idx];
        speakJP(v.word);
        flashSpeaking(btn, 700);
        const card = btn.closest('.vocab-card');
        if (card) {
          card.classList.add('is-speaking');
          setTimeout(function () { card.classList.remove('is-speaking'); }, 700);
        }
      });
    });

    // 例句：整句朗读
    document.querySelectorAll('[data-example-play]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.getAttribute('data-example-play'), 10);
        const lesson = App.getLessonById(lessonId);
        if (!lesson || !lesson.examples || !lesson.examples[idx]) return;
        speakJP(lesson.examples[idx].jp);
        flashSpeaking(btn, 900);
      });
    });

    // 例句：token 点击朗读
    document.querySelectorAll('.example-jp').forEach(function (jpEl) {
      jpEl.addEventListener('click', function (e) {
        const tok = e.target.closest('.jp-token');
        if (!tok) return;
        const text = tok.getAttribute('data-token') || tok.textContent;
        speakJP(text);
        flashSpeaking(tok, 600);
      });
    });

    // 今日开口：整句朗读
    document.querySelectorAll('[data-speak-play]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = parseInt(btn.getAttribute('data-speak-play'), 10);
        const lesson = App.getLessonById(lessonId);
        if (!lesson || !lesson.speakPractice || !lesson.speakPractice[idx]) return;
        speakJP(lesson.speakPractice[idx].jp);
        flashSpeaking(btn, 900);
      });
    });

    // 今日开口：token 点击朗读
    document.querySelectorAll('.speak-item .speak-jp').forEach(function (jpEl) {
      jpEl.addEventListener('click', function (e) {
        const tok = e.target.closest('.jp-token');
        if (!tok) return;
        const text = tok.getAttribute('data-token') || tok.textContent;
        speakJP(text);
        flashSpeaking(tok, 600);
      });
    });

    // === 新 3 模块：朗读事件 ===
    // 1. 本课单词表：🔊 朗读单词
    document.querySelectorAll('[data-vocab-play]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const i = parseInt(btn.getAttribute('data-vocab-play'), 10);
        const lesson = App.getLessonById(lessonId);
        if (!lesson || !lesson.vocabulary || !lesson.vocabulary[i]) return;
        const v = lesson.vocabulary[i];
        speakJP(v.word);
        flashSpeaking(btn, 700);
        const row = btn.closest('.vt-row');
        if (row) { row.classList.add('is-speaking'); setTimeout(function () { row.classList.remove('is-speaking'); }, 700); }
      });
    });

    // 2. 学习目标：主例句 🔊 + 例文 🔊
    document.querySelectorAll('.lg-main-play, .lg-ex-play').forEach(function (btn, idx) {
      btn.addEventListener('click', function () {
        // 找到包含 btn 的 lg-main-example 或 lg-ex
        const container = btn.closest('.lg-main-example') || btn.closest('.lg-ex');
        const jpEl = container?.querySelector('.lg-main-jp, .lg-ex-jp');
        if (!jpEl) return;
        // 取纯文本（去掉 HTML token）
        speakJP(jpEl.textContent.trim());
        flashSpeaking(btn, 900);
      });
    });

    // 3. 学习目标结构块、主例句、例文、对话：token 点击朗读
    document.querySelectorAll(
      '.lg-main-jp, .lg-ex-jp, .lg-stru-jp, .dlg-jp, .vocab-table .jp-token'
    ).forEach(function (jpEl) {
      jpEl.addEventListener('click', function (e) {
        const tok = e.target.closest('.jp-token');
        if (!tok) return;
        const text = tok.getAttribute('data-token') || tok.textContent;
        speakJP(text);
        flashSpeaking(tok, 600);
      });
    });

    // 4. 对话：整行朗读
    document.querySelectorAll('.dlg-line-play').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const jpEl = btn.closest('.dlg-body')?.querySelector('.dlg-jp');
        if (!jpEl) return;
        speakJP(jpEl.textContent.trim());
        flashSpeaking(btn, 900);
      });
    });

    document.querySelectorAll('[data-example-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const idx = btn.getAttribute('data-example-toggle');
        const answer = document.querySelector('[data-example-answer="' + idx + '"]');
        const label = btn.querySelector('.toggle-label');
        if (!answer) return;
        const isVisible = answer.classList.toggle('is-visible');
        if (label) {
          label.textContent = isVisible ? '隐藏翻译与结构' : '查看翻译与结构';
        }
      });
    });

    document.querySelectorAll('.quiz-option').forEach(function (opt) {
      opt.addEventListener('click', function () {
        if (opt.disabled) return;
        const qIdx = parseInt(opt.getAttribute('data-quiz-index'), 10);
        const oIdx = parseInt(opt.getAttribute('data-option-index'), 10);
        if (isNaN(qIdx) || isNaN(oIdx)) return;

        const lesson = App.getLessonById(lessonId);
        if (!lesson || !lesson.quiz || !lesson.quiz[qIdx]) return;
        const q = lesson.quiz[qIdx];

        const allOptions = document.querySelectorAll(
          '.quiz-option[data-quiz-index="' + qIdx + '"]'
        );
        allOptions.forEach(function (o) { o.disabled = true; });

        const correct = q.answerIndex;
        const isRight = oIdx === correct;

        opt.classList.add(isRight ? 'is-correct' : 'is-wrong');
        if (!isRight && correct != null) {
          const correctOption = document.querySelector(
            '.quiz-option[data-quiz-index="' + qIdx + '"][data-option-index="' + correct + '"]'
          );
          if (correctOption) correctOption.classList.add('is-correct');
        }

        const fb = document.querySelector('[data-quiz-feedback="' + qIdx + '"]');
        if (fb) {
          const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
          fb.classList.add('is-visible', isRight ? 'is-correct' : 'is-wrong');
          fb.innerHTML =
            '<div><strong>' + (isRight ? '✅ 回答正确！' : '❌ 回答错误') + '</strong></div>' +
            (q.explain ? '<div style="margin-top:var(--space-2);">' + nl2br(q.explain) + '</div>' : '') +
            (correct != null
              ? '<div class="quiz-answer-text">正确答案：' + letters[correct] + '. ' + escapeHTML(q.options[correct]) + '</div>'
              : '');
        }
      });
    });

    const textarea = document.querySelector('.sentence-write');
    if (textarea && lessonId) {
      const draftKey = 'jp_lesson_draft_' + lessonId;
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) textarea.value = saved;
      } catch (e) {}
      textarea.addEventListener('input', function () {
        try { localStorage.setItem(draftKey, textarea.value); } catch (e) {}
      });
    }

    const practiceLesson = App.getLessonById(lessonId);
    if (practiceLesson && window.Practice && typeof window.Practice.bind === 'function') {
      window.Practice.bind(practiceLesson);
    }
  }

  /* ============================================================
     入口
     ============================================================ */

  function init() {
    const id = getLessonIdFromURL();
    const container = document.getElementById('lessonContent');
    if (!container) return;

    if (!id) {
      container.innerHTML =
        '<section class="hero">' +
          '<h2 class="hero-title">未指定课程</h2>' +
          '<p class="hero-subtitle">请从课程目录选择一课开始学习。</p>' +
        '</section>' +
        '<a href="courses.html" class="btn btn-primary">前往课程目录 →</a>';
      return;
    }

    const lesson = App.getLessonById(id);
    if (!lesson) {
      container.innerHTML =
        '<section class="hero">' +
          '<h2 class="hero-title">课程不存在</h2>' +
          '<p class="hero-subtitle">ID：' + escapeHTML(id) + ' 未找到对应课程。</p>' +
        '</section>' +
        '<a href="courses.html" class="btn btn-primary">返回课程目录 →</a>';
      return;
    }

    document.title = (lesson.title || '课程学习') + ' - 日语学习';

    // 打开单课 → 自动标记为 in_progress（若已 completed 则仅更新 lastVisitedAt，不降级）
    if (App && typeof App.markLessonInProgress === 'function') {
      try { App.markLessonInProgress(id); } catch (e) { /* 静默忽略，不影响学习页渲染 */ }
    }

    // 读取上次的模式
    try {
      isEditMode = localStorage.getItem(LS_MODE_KEY) === '1';
    } catch (e) { isEditMode = false; }
    if (isEditMode) document.body.classList.add('is-edit-mode');

    renderLesson(lesson);

    if (isEditMode) {
      bindEditToolbar(id);
      rebindAllEditInteractions();
      clearEditDirty(App.hasLessonEdit(id));
    } else {
      bindInteractions(id);
      bindReadToolbar(id);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('beforeunload', function (event) {
    if (!isEditMode || !isEditDirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
})();
