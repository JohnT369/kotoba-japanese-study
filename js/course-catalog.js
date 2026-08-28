/* ============================================================
   course-catalog.js - 学习导航层：课程目录 & 进度页共享视图层
   暴露全局：window.CourseCatalog
   三件套：getCourseSummary / getCourseStatus / getLessonUrl
   视图模型：buildCatalogItems / getNextContinueItem
   渲染：renderCourseList（tab 过滤 + 卡片 + details 折叠）
   ============================================================ */

(function () {
  'use strict';

  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return String(n == null ? '' : n).padStart(2, '0');
  }

  // ===== 三件套 1：摘要计算 =====
  function getCourseSummary(lesson) {
    if (!lesson) return null;
    let seq = lesson.sequence;
    if (seq == null || (typeof seq !== 'number' && !(typeof seq === 'string' && /^\d+$/.test(seq)))) {
      if (window.App && typeof window.App.getLessonIndex === 'function') {
        const idx = window.App.getLessonIndex(lesson.id);
        if (idx >= 0) seq = idx + 1;
      }
    }
    const nVocab = Array.isArray(lesson.vocabulary) ? lesson.vocabulary.length : 0;
    const nPhrases = Array.isArray(lesson.phrases) ? lesson.phrases.length : 0;
    const nGoals = Array.isArray(lesson.learningGoals) ? lesson.learningGoals.length : 0;
    const dayDisplay = '第' + (seq != null ? Number(seq) : '') + '课';
    return {
      dayDisplay: dayDisplay,
      sequence: seq,
      unit: lesson.unit,
      tags: Array.isArray(lesson.tags) ? lesson.tags.slice() : [],
      estimatedMinutes: typeof lesson.estimatedMinutes === 'number' ? lesson.estimatedMinutes : undefined,
      nVocab: nVocab,
      nPhrases: nPhrases,
      nGoals: nGoals
    };
  }

  // ===== 三件套 2：状态计算（progress / edits 是预读对象，不再查 LS）=====
  function getCourseStatus(lessonId, progress, edits) {
    const entry = progress && typeof progress === 'object' ? progress[lessonId] : null;
    let status = 'not_started';
    if (entry && typeof entry.status === 'string') {
      status = entry.status;
    } else if (entry && entry.completed === true) {
      // 兼容兜底：未迁移的老数据（实际上 migrate 应该已经处理了）
      status = 'completed';
    }
    const isCompleted = status === 'completed';
    const isInProgress = status === 'in_progress';
    const hasEdit = !!(edits && typeof edits === 'object' && edits[lessonId]);
    const isArchived = !!(edits && edits.__archivedLessonIds && edits.__archivedLessonIds[lessonId]);

    let ctaText = '开始学习 →';
    let ctaVariant = 'btn-primary';
    if (isInProgress) { ctaText = '继续学习 →'; ctaVariant = 'btn-primary'; }
    else if (isCompleted) { ctaText = '复习 →'; ctaVariant = 'btn-outline'; }

    let badgeHTML;
    if (isArchived) {
      badgeHTML = '<span class="badge badge-outline">已归档</span>';
    } else if (isCompleted) {
      badgeHTML = '<span class="badge badge-success">已完成</span>' + (hasEdit ? ' <span class="edit-badge">本地编辑</span>' : '');
    } else if (isInProgress) {
      badgeHTML = '<span class="badge badge-primary-outline">进行中</span>' + (hasEdit ? ' <span class="edit-badge">本地编辑</span>' : '');
    } else {
      badgeHTML = '<span class="badge badge-outline">未学习</span>' + (hasEdit ? ' <span class="edit-badge">本地编辑</span>' : '');
    }

    return {
      status: status,
      isCompleted: isCompleted,
      isInProgress: isInProgress,
      isArchived: isArchived,
      hasEdit: hasEdit,
      ctaText: ctaText,
      ctaVariant: ctaVariant,
      badgeHTML: badgeHTML,
      startedAt: entry ? entry.startedAt : null,
      lastVisitedAt: entry ? entry.lastVisitedAt : null,
      completedAt: entry ? entry.completedAt : null
    };
  }

  // ===== 三件套 3：跳转 URL =====
  function getLessonUrl(lessonId) {
    return 'lesson.html?id=' + encodeURIComponent(lessonId);
  }

  // ===== 视图模型：把 lessons + progress + edits 一次性拼成 catalogItems =====
  // items[i] = { id, lesson, summary, status, url }
  function buildCatalogItems(lessons, progress, edits) {
    const ls = Array.isArray(lessons) ? lessons : [];
    const pg = progress || {};
    const ed = edits || {};
    return ls.map(function (lesson) {
      const id = lesson.id;
      return {
        id: id,
        lesson: lesson,
        summary: getCourseSummary(lesson),
        status: getCourseStatus(id, pg, ed),
        isCustom: !!(window.App && typeof window.App.isCustomLesson === 'function' && window.App.isCustomLesson(id)),
        url: getLessonUrl(id)
      };
    });
  }

  // ===== Hero 主 CTA 推荐：in_progress(lastVisitedAt desc) → 首个 not_started → 最老 completed =====
  function getNextContinueItem(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    let bestInProgress = null;
    let bestInProgressTime = '';
    let firstNotStarted = null;
    let oldestCompleted = null;
    let oldestCompletedTime = '9999-12-31T23:59:59.999Z';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const s = it.status;
      if (s.isArchived) continue;
      if (s.isInProgress) {
        const t = s.lastVisitedAt || '';
        if (t > bestInProgressTime) { bestInProgressTime = t; bestInProgress = it; }
      } else if (!s.isCompleted && !s.isInProgress) {
        if (firstNotStarted === null) firstNotStarted = it;
      } else if (s.isCompleted) {
        const t = s.completedAt || '9999-12-31T23:59:59.999Z';
        if (t < oldestCompletedTime) { oldestCompletedTime = t; oldestCompleted = it; }
      }
    }
    return bestInProgress || firstNotStarted || oldestCompleted || items[0];
  }

  // ===== 渲染 1 张课程卡片 =====
  function renderCard(item) {
    const s = item.summary;
    const st = item.status;
    const lesson = item.lesson;
    const url = item.url;

    const meta = (s.nVocab + s.nPhrases + s.nGoals) > 0
      ? '<div class="course-card__meta">' +
          '<span class="cs-pill cs-vocab">📘 ' + s.nVocab + ' 词</span>' +
          '<span class="cs-pill cs-phrase">📙 ' + s.nPhrases + ' 短语</span>' +
          '<span class="cs-pill cs-goal">🎯 ' + s.nGoals + ' 目标</span>' +
        '</div>'
      : '';

    const statusCls =
      (st.isCompleted ? ' is-completed' : '') +
      (st.isInProgress ? ' is-in-progress' : '') +
      (st.hasEdit ? ' has-edit' : '') +
      (st.isArchived ? ' is-archived' : '');

    const managementControls = st.isArchived
      ? '<button type="button" class="btn btn-outline btn-sm" data-cc-restore>恢复课时</button>'
      : '<button type="button" class="btn btn-outline btn-sm" data-cc-archive>归档</button>' +
          (item.isCustom ? '<button type="button" class="btn btn-outline btn-sm course-card__delete" data-cc-delete>删除</button>' : '');

    const titleEditor =
      '<form class="course-card__title-editor" data-cc-title-form="' + escapeHTML(item.id) + '" hidden>' +
        '<label>课程名称<input type="text" data-cc-title value="' + escapeHTML(lesson.title || '') + '" maxlength="80" required></label>' +
        '<label>副标题（可选）<input type="text" data-cc-subtitle value="' + escapeHTML(lesson.subtitle || '') + '" maxlength="120"></label>' +
        '<div class="course-card__editor-actions"><button type="submit" class="btn btn-primary btn-sm">保存名称</button><button type="button" class="btn btn-outline btn-sm" data-cc-title-cancel>取消</button></div>' +
      '</form>';

    return (
      '<article class="course-card' + statusCls + '" tabindex="0" role="link" data-url="' + escapeHTML(url) + '" aria-label="' + escapeHTML(s.dayDisplay + ' ' + (lesson.title || '')) + '">' +
        '<div class="course-card__summary">' +
          '<div class="course-card__head">' +
            '<div class="course-num">' + s.dayDisplay + '</div>' +
            '<div class="course-card__status">' + st.badgeHTML + '</div>' +
          '</div>' +
          '<div class="course-card__body">' +
            '<div class="course-title-row"><h3 class="course-title">' + escapeHTML(lesson.title || '') + '</h3></div>' +
            '<p class="course-sub">' + escapeHTML(lesson.subtitle || '') + '</p>' +
            meta +
          '</div>' +
        '</div>' +
        '<div class="course-card__controls">' +
          (st.isArchived ? '' : '<button type="button" class="btn btn-outline btn-sm course-card__title-edit" data-cc-title-edit aria-label="编辑课程名称">编辑名称</button>') +
          '<div class="course-card__management">' + managementControls + '</div>' +
          '<div class="course-card__actions"><a href="' + url + '" class="btn ' + (st.isArchived ? 'btn-outline' : st.ctaVariant) + ' btn-sm course-card__cta">' + (st.isArchived ? '查看课时' : st.ctaText) + '</a></div>' +
        '</div>' +
        titleEditor +
      '</article>'
    );
  }

  // ===== 渲染：tab + 卡片列表 =====
  // options: { tabFilter = 'all' | 'in_progress' | 'completed' | 'archived', items, emptyText? }
  // returns: { html, tabCounts: {all, in_progress, completed, archived, filtered} }
  function buildCourseList(options) {
    const items = Array.isArray(options.items) ? options.items : [];
    const filter = ['in_progress', 'completed', 'archived'].indexOf(options.tabFilter) >= 0 ? options.tabFilter : 'all';
    const active = items.filter(function (i) { return !i.status.isArchived; });
    let filtered = active;
    if (filter === 'in_progress') filtered = active.filter(function (i) { return i.status.isInProgress; });
    else if (filter === 'completed') filtered = active.filter(function (i) { return i.status.isCompleted; });
    else if (filter === 'archived') filtered = items.filter(function (i) { return i.status.isArchived; });

    const counts = {
      all: active.length,
      in_progress: active.filter(function (i) { return i.status.isInProgress; }).length,
      completed: active.filter(function (i) { return i.status.isCompleted; }).length,
      archived: items.filter(function (i) { return i.status.isArchived; }).length
    };
    counts.filtered = filtered.length;

    let empty = '';
    if (filtered.length === 0) {
      const msg = options.emptyText || '暂无匹配的课程。';
      empty = '<p class="muted course-catalog__empty">' + escapeHTML(msg) + '</p>';
    }

    const tabsHTML =
      '<div class="course-catalog__tabs" role="tablist">' +
        '<button role="tab" class="course-catalog__tab' + (filter === 'all' ? ' is-active' : '') + '" ' +
          'data-cc-filter="all" aria-selected="' + (filter === 'all' ? 'true' : 'false') + '">全部 (' + counts.all + ')</button>' +
        '<button role="tab" class="course-catalog__tab' + (filter === 'in_progress' ? ' is-active' : '') + '" ' +
          'data-cc-filter="in_progress" aria-selected="' + (filter === 'in_progress' ? 'true' : 'false') + '">进行中 (' + counts.in_progress + ')</button>' +
        '<button role="tab" class="course-catalog__tab' + (filter === 'completed' ? ' is-active' : '') + '" ' +
          'data-cc-filter="completed" aria-selected="' + (filter === 'completed' ? 'true' : 'false') + '">已完成 (' + counts.completed + ')</button>' +
        '<button role="tab" class="course-catalog__tab' + (filter === 'archived' ? ' is-active' : '') + '" ' +
          'data-cc-filter="archived" aria-selected="' + (filter === 'archived' ? 'true' : 'false') + '">已归档 (' + counts.archived + ')</button>' +
      '</div>';

    const cardsHTML = filtered.map(renderCard).join('');

    const html = tabsHTML + '<div class="course-list course-catalog__grid">' + cardsHTML + '</div>' + empty;
    return { html: html, tabCounts: counts, filter: filter };
  }

  function renderCourseList(containerEl, options) {
    if (!containerEl) return null;
    const result = buildCourseList(options);
    containerEl.innerHTML = result.html;

    // 绑定 tab 点击：只切换 DOM active + 再次渲染 cards（不重绘 tabs，除非重建 — 这里为简单走一次重建 + 事件再绑一次，items 不会变）
    const tabs = containerEl.querySelectorAll('[data-cc-filter]');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function (ev) {
        const f = ev.currentTarget.getAttribute('data-cc-filter') || 'all';
        const currentOptions = Object.assign({}, options, { tabFilter: f });
        const newResult = buildCourseList(currentOptions);
        containerEl.innerHTML = newResult.html;
        // 再次绑定（递归）
        renderCourseList._rebind(containerEl, currentOptions);
      });
    });

    containerEl.querySelectorAll('[data-cc-title-edit]').forEach(function (button) {
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = button.closest('.course-card');
        const form = card && card.querySelector('[data-cc-title-form]');
        if (!form) return;
        form.hidden = false;
        button.hidden = true;
        const input = form.querySelector('[data-cc-title]');
        if (input) input.focus();
      });
    });

    containerEl.querySelectorAll('[data-cc-archive], [data-cc-restore], [data-cc-delete]').forEach(function (button) {
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = button.closest('.course-card');
        const lessonId = card && card.querySelector('[data-cc-title-form]') && card.querySelector('[data-cc-title-form]').getAttribute('data-cc-title-form');
        const title = card && card.querySelector('.course-title') && card.querySelector('.course-title').textContent || '此课时';
        if (!lessonId || !window.App) return;
        if (button.hasAttribute('data-cc-archive')) {
          if (!confirm('归档后将从默认课程路线隐藏，仍可在“已归档”中恢复。确认归档“' + title + '”吗？')) return;
          if (!window.App.setLessonArchived(lessonId, true)) { alert('归档失败，请检查本地存储权限。'); return; }
          if (typeof options.onDataChanged === 'function') options.onDataChanged('archived');
          return;
        }
        if (button.hasAttribute('data-cc-restore')) {
          if (!window.App.setLessonArchived(lessonId, false)) { alert('恢复失败，请检查本地存储权限。'); return; }
          if (typeof options.onDataChanged === 'function') options.onDataChanged('all');
          return;
        }
        if (!confirm('永久删除“' + title + '”吗？其课程内容、学习进度、练习和复习记录将一并删除，且无法恢复。')) return;
        if (!window.App.deleteCustomLesson(lessonId)) { alert('删除失败：只有自建课时可以永久删除。'); return; }
        if (typeof options.onDataChanged === 'function') options.onDataChanged('all');
      });
    });

    containerEl.querySelectorAll('[data-cc-title-cancel]').forEach(function (button) {
      button.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const card = button.closest('.course-card');
        const form = card && card.querySelector('[data-cc-title-form]');
        const editButton = card && card.querySelector('[data-cc-title-edit]');
        if (form) form.hidden = true;
        if (editButton) editButton.hidden = false;
      });
    });

    containerEl.querySelectorAll('[data-cc-title-form]').forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const lessonId = form.getAttribute('data-cc-title-form');
        const titleInput = form.querySelector('[data-cc-title]');
        const subtitleInput = form.querySelector('[data-cc-subtitle]');
        const title = titleInput ? titleInput.value.trim() : '';
        if (!title) { if (titleInput) titleInput.focus(); return; }
        const saved = window.App && typeof window.App.updateLessonMeta === 'function' && window.App.updateLessonMeta(lessonId, { title: title, subtitle: subtitleInput ? subtitleInput.value : '' });
        if (!saved) { alert('保存失败，请检查浏览器本地存储权限。'); return; }
        if (typeof options.onDataChanged === 'function') options.onDataChanged(options.tabFilter || 'all');
      });
    });

    // 卡片本身可键盘 tab：回车/空格触发跳转
    const cards = containerEl.querySelectorAll('.course-card[role="link"]');
    cards.forEach(function (card) {
      card.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
        if (ev.target && ev.target.closest && ev.target.closest('input, button, form, details')) return;
        const url = card.getAttribute('data-url');
        if (!url) return;
        ev.preventDefault();
        window.location.href = url;
      });
      card.addEventListener('click', function (ev) {
        // 只有点卡片空白处才跳转；点 CTA 让浏览器正常跳转（不会被这里阻止，因为 a 先处理）
        const target = ev.target;
        if (target && target.closest && (target.closest('.course-card__cta') || target.closest('.course-card__title-edit') || target.closest('.course-card__title-editor') || target.closest('.course-card__management'))) return;
        if (target && target.closest && (target.closest('details') || target.closest('summary'))) return;
        const url = card.getAttribute('data-url');
        if (url) window.location.href = url;
      });
    });

    return result;
  }
  // 内部重绑定（tabs 重建后需要重挂 click）
  renderCourseList._rebind = function (containerEl, options) {
    return renderCourseList(containerEl, options);
  };

  // ===== 暴露 =====
  window.CourseCatalog = {
    getCourseSummary: getCourseSummary,
    getCourseStatus: getCourseStatus,
    getLessonUrl: getLessonUrl,
    buildCatalogItems: buildCatalogItems,
    getNextContinueItem: getNextContinueItem,
    buildCourseList: buildCourseList,
    renderCourseList: renderCourseList
  };
})();
