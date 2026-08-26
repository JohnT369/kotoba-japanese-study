/* ============================================================
   progress.js - 学习进度页渲染
   ============================================================ */

(function () {
  'use strict';

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

  function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderLessonProgressList() {
    const list = document.getElementById('lessonProgressList');
    if (!list) return;

    // 一次性读取（共享视图模型），避免逐课逐课查 LocalStorage
    const all = (window.App && typeof window.App.loadAllOnce === 'function')
      ? window.App.loadAllOnce()
      : { lessons: window.App.getLessons(), progress: {}, edits: {} };
    const items = (window.CourseCatalog && window.CourseCatalog.buildCatalogItems)
      ? window.CourseCatalog.buildCatalogItems(all.lessons, all.progress, all.edits)
      : [];

    if (items.length === 0) {
      list.innerHTML = '<p class="muted">暂无课程数据。</p>';
      return;
    }

    const rows = items.map(function (it) {
      const s = it.summary;
      const st = it.status;
      const url = it.url;
      const title = (it.lesson && it.lesson.title) ? it.lesson.title : '';
      const date = st.completedAt ? formatDate(st.completedAt) : '';
      const btnText = st.isCompleted ? '复习' : (st.isInProgress ? '继续学习' : '学习');
      const btnVariant = st.isCompleted ? 'btn-outline' : 'btn-primary';

      return (
        '<div class="lesson-progress-row ' + (st.isCompleted ? 'is-completed' : '') + '">' +
          '<div class="lpr-num">' + s.dayDisplay + '</div>' +
          '<div>' +
            '<span class="lpr-title">' + escapeHTML(title) + '</span>' +
            (st.hasEdit ? '<span class="edit-badge">本地编辑</span>' : '') +
            (st.isCompleted && date ? '<span class="lpr-date">完成于 ' + date + '</span>' : '') +
            (st.isInProgress ? '<span class="badge badge-primary-outline lpr-status">进行中</span>' : '') +
          '</div>' +
          '<div class="lpr-action">' +
            '<a href="' + url + '" class="btn ' + btnVariant + ' btn-sm">' + btnText + ' →</a>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    list.innerHTML = '<div class="lesson-progress-list">' + rows + '</div>';
  }

  function init() {
    // 统计数字
    const stats = App.getStats();
    const el = (id) => document.getElementById(id);
    if (el('totalLessons')) el('totalLessons').textContent = stats.total;
    if (el('completedLessons')) el('completedLessons').textContent = stats.completed;
    if (el('remainingLessons')) el('remainingLessons').textContent = stats.remaining;
    if (el('progressPercent')) el('progressPercent').textContent = stats.percent + '%';

    // 进度条
    const fill = document.getElementById('overallProgress');
    const text = document.getElementById('overallProgressText');
    if (fill) fill.style.width = stats.percent + '%';
    if (text) text.textContent = stats.percent + '%';

    // 每课详情
    renderLessonProgressList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
