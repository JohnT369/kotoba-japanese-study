/* Today's spaced-review list. Kept separate from the page shell so review rules
 * can evolve without growing review.html into another application module. */
(function () {
  'use strict';

  function render() {
    const list = document.getElementById('reviewList');
    const summary = document.getElementById('reviewSummary');
    if (!list || !summary || !window.App) return;
    const items = App.getDueReviewItems(20);
    summary.textContent = items.length
      ? '今天有 ' + items.length + ' 项需要回顾；每次答对后，下一次复习会自动延后。'
      : '今天没有到期内容。继续完成课程或假名训练，系统会自动生成复习计划。';
    if (!items.length) {
      list.innerHTML = '<div class="review-empty"><h3>复习清单已清空</h3><p>去学习一课或做一轮假名练习，薄弱项会自动回到这里。</p><a class="btn btn-primary" href="courses.html">继续学习 →</a></div>';
      return;
    }
    list.replaceChildren();
    items.forEach(function (item) {
      const card = document.createElement('article');
      card.className = 'review-card';
      const text = document.createElement('div');
      const eyebrow = document.createElement('p');
      eyebrow.className = 'review-card__type';
      eyebrow.textContent = item.type === 'kana' ? '假名复习' : '课程复习';
      const title = document.createElement('h3');
      title.textContent = item.label;
      const detail = document.createElement('p');
      detail.textContent = item.detail || '回顾一次，让记忆更稳固。';
      const action = document.createElement('a');
      action.className = 'btn btn-primary btn-sm';
      action.href = item.href || 'review.html';
      action.textContent = '去复习 →';
      text.append(eyebrow, title, detail);
      card.append(text, action);
      list.appendChild(card);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
