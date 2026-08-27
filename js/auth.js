/* Global email/password sign-in and per-user Supabase sync. */
(function () {
  'use strict';

  const config = window.KOTOBA_SUPABASE_CONFIG;
  if (!config || !window.supabase || !window.App) {
    console.warn('账户服务未加载，网站将以本地学习模式运行。');
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
  });
  let activeUser = null;
  let hydratedUserId = null;
  let syncing = false;
  const queuedSync = { progress: false, course: false, learning: false };
  const isAuthPage = document.body.classList.contains('page-auth');

  function latestTimestamp(entry) {
    return entry && (entry.lastVisitedAt || entry.completedAt || entry.startedAt || '') || '';
  }

  function mergeProgress(local, remoteRows) {
    const next = Object.assign({}, local || {});
    (remoteRows || []).forEach(function (row) {
      const remote = {
        status: row.status,
        startedAt: row.started_at,
        lastVisitedAt: row.last_visited_at,
        completedAt: row.completed_at
      };
      const current = next[row.lesson_id];
      if (!current || latestTimestamp(remote) >= latestTimestamp(current)) next[row.lesson_id] = remote;
    });
    return next;
  }

  function progressRows(userId, progress) {
    return Object.keys(progress || {}).map(function (lessonId) {
      const entry = progress[lessonId] || {};
      return {
        user_id: userId,
        lesson_id: lessonId,
        status: entry.status || 'not_started',
        started_at: entry.startedAt || null,
        last_visited_at: entry.lastVisitedAt || null,
        completed_at: entry.completedAt || null
      };
    });
  }

  async function syncProgress() {
    if (!activeUser || syncing) return;
    const resetAt = window.App.getProgressResetAt && window.App.getProgressResetAt();
    if (resetAt) {
      const { error } = await client.from('lesson_progress').delete().eq('user_id', activeUser.id);
      if (error) { console.warn('清除云端学习进度失败:', error.message); return; }
      window.App.clearProgressResetAt();
      return;
    }
    const rows = progressRows(activeUser.id, window.App.loadProgress());
    if (!rows.length) return;
    const { error } = await client.from('lesson_progress').upsert(rows, { onConflict: 'user_id,lesson_id' });
    if (error) console.warn('同步学习进度失败:', error.message);
  }

  async function syncCourseState() {
    if (!activeUser || syncing) return;
    const snapshot = window.App.getStorageSnapshot();
    const { error } = await client.from('user_course_state').upsert({
      user_id: activeUser.id,
      custom_lessons: snapshot.customLessons,
      lesson_edits: snapshot.lessonEdits
    }, { onConflict: 'user_id' });
    if (error) console.warn('同步课程资料失败:', error.message);
  }

  async function syncLearningState() {
    if (!activeUser || syncing) return;
    const snapshot = window.App.getLearningStateSnapshot();
    const { error } = await client.from('user_learning_state').upsert({
      user_id: activeUser.id,
      state: snapshot
    }, { onConflict: 'user_id' });
    if (error) console.warn('同步练习与复习记录失败:', error.message);
  }

  function queueSync(kind) {
    if (!Object.prototype.hasOwnProperty.call(queuedSync, kind) || queuedSync[kind]) return;
    queuedSync[kind] = true;
    window.setTimeout(function () {
      queuedSync[kind] = false;
      if (kind === 'progress') void syncProgress();
      else if (kind === 'course') void syncCourseState();
      else void syncLearningState();
    }, 250);
  }

  async function hydrateUser(user) {
    if (!user || hydratedUserId === user.id) return;
    hydratedUserId = user.id;
    activeUser = user;
    window.App.setStorageOwner(user.id);
    syncing = true;
    try {
      const local = window.App.getStorageSnapshot();
      const [progressResult, courseResult, learningResult] = await Promise.all([
        client.from('lesson_progress').select('lesson_id,status,started_at,last_visited_at,completed_at,updated_at'),
        client.from('user_course_state').select('custom_lessons,lesson_edits,updated_at').maybeSingle(),
        client.from('user_learning_state').select('state,updated_at').maybeSingle()
      ]);
      if (progressResult.error) throw progressResult.error;
      if (courseResult.error) throw courseResult.error;

      const remoteCourse = courseResult.data;
      const localCourseChangedAt = local.courseStateUpdatedAt || '';
      const useRemoteCourse = remoteCourse && String(remoteCourse.updated_at || '') > localCourseChangedAt;
      const merged = {
        progress: window.App.getProgressResetAt && window.App.getProgressResetAt() ? {} : mergeProgress(local.progress, progressResult.data),
        customLessons: useRemoteCourse && Array.isArray(remoteCourse.custom_lessons) ? remoteCourse.custom_lessons : local.customLessons,
        lessonEdits: useRemoteCourse && remoteCourse.lesson_edits && typeof remoteCourse.lesson_edits === 'object' ? remoteCourse.lesson_edits : local.lessonEdits,
        courseStateUpdatedAt: useRemoteCourse ? remoteCourse.updated_at : localCourseChangedAt
      };
      window.App.replaceStorageSnapshot(merged);
      if (!learningResult.error && learningResult.data && learningResult.data.state) {
        const localLearning = window.App.getLearningStateSnapshot();
        const remoteChangedAt = String(learningResult.data.updated_at || '');
        if (remoteChangedAt > String(localLearning.updatedAt || '')) window.App.replaceLearningState(learningResult.data.state);
      } else if (learningResult.error) {
        console.warn('读取练习与复习记录失败:', learningResult.error.message);
      }
    } catch (error) {
      console.warn('读取云端学习资料失败:', error.message || error);
    } finally {
      syncing = false;
    }
    await Promise.all([syncProgress(), syncCourseState(), syncLearningState()]);
    window.dispatchEvent(new Event('app:state-synced'));
    if (isAuthPage) {
      window.location.replace('index.html');
      return;
    }
    const renderedFor = sessionStorage.getItem('kotoba:hydrated-user');
    if (renderedFor !== user.id) {
      sessionStorage.setItem('kotoba:hydrated-user', user.id);
      window.location.reload();
      return;
    }
    renderAccount();
  }

  function setMessage(text, isError) {
    const message = document.getElementById('authMessage');
    if (!message) return;
    message.textContent = text || '';
    message.classList.toggle('is-error', !!isError);
  }

  function closeModal() {
    if (isAuthPage) {
      window.location.href = 'index.html';
      return;
    }
    const modal = document.getElementById('authModal');
    if (modal) modal.hidden = true;
  }

  function renderAccount() {
    const entry = document.getElementById('authEntry');
    if (!entry) return;
    entry.replaceChildren();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'auth-entry__button';
    button.textContent = activeUser ? (activeUser.email || '我的账户') : '登录 / 注册';
    button.addEventListener('click', function () {
      if (!activeUser) window.location.href = 'login.html';
    });
    entry.appendChild(button);
    if (activeUser) {
      const signOut = document.createElement('button');
      signOut.type = 'button';
      signOut.className = 'auth-entry__signout';
      signOut.textContent = '退出';
      signOut.addEventListener('click', async function () {
        const { error } = await client.auth.signOut();
        if (error) { setMessage(error.message, true); return; }
        window.App.setStorageOwner(null);
        sessionStorage.removeItem('kotoba:hydrated-user');
        activeUser = null;
        hydratedUserId = null;
        window.location.reload();
      });
      entry.appendChild(signOut);
    }
  }

  function mountAuthUI() {
    if (!isAuthPage) {
      const entry = document.createElement('div');
      entry.id = 'authEntry';
      entry.className = 'auth-entry';
      document.body.appendChild(entry);
    }

    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'auth-modal';
    modal.hidden = !isAuthPage;
    modal.innerHTML = '<div class="auth-modal__backdrop"></div><section class="auth-modal__panel" role="dialog" aria-modal="true" aria-labelledby="authTitle"><button class="auth-modal__close" type="button" aria-label="关闭">×</button><p class="auth-modal__eyebrow">KOTOBA ACCOUNT</p><h2 id="authTitle">登录以保存你的学习</h2><p class="auth-modal__intro">课程进度、自建课程和课程编辑将仅同步到你的账户。</p><form id="authForm"><label>邮箱<input id="authEmail" type="email" autocomplete="email" required></label><label>密码<input id="authPassword" type="password" minlength="8" autocomplete="current-password" required></label><p id="authMessage" class="auth-modal__message" aria-live="polite"></p><button id="authSubmit" class="btn btn-primary btn-block" type="submit">登录</button></form><button id="authModeToggle" class="auth-modal__toggle" type="button">没有账户？注册</button></section>';
    document.body.appendChild(modal);
    let mode = 'signin';

    modal.querySelector('.auth-modal__backdrop').addEventListener('click', closeModal);
    modal.querySelector('.auth-modal__close').addEventListener('click', closeModal);
    document.getElementById('authModeToggle').addEventListener('click', function () {
      mode = mode === 'signin' ? 'signup' : 'signin';
      document.getElementById('authTitle').textContent = mode === 'signin' ? '登录以保存你的学习' : '创建你的学习账户';
      document.getElementById('authSubmit').textContent = mode === 'signin' ? '登录' : '注册';
      this.textContent = mode === 'signin' ? '没有账户？注册' : '已有账户？登录';
      document.getElementById('authPassword').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
      setMessage('');
    });
    document.getElementById('authForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      const submit = document.getElementById('authSubmit');
      submit.disabled = true;
      setMessage('正在处理…');
      try {
        if (mode === 'signup') {
          const { data, error } = await client.auth.signUp({
            email: email,
            password: password,
            options: { emailRedirectTo: window.location.origin + window.location.pathname }
          });
          if (error) throw error;
          setMessage(data.session ? '注册成功，正在同步你的学习资料…' : '注册成功，请到邮箱完成验证后再登录。');
          if (data.session) closeModal();
        } else {
          const { error } = await client.auth.signInWithPassword({ email: email, password: password });
          if (error) throw error;
          closeModal();
        }
      } catch (error) {
        setMessage(error.message || '操作失败，请稍后重试。', true);
      } finally {
        submit.disabled = false;
      }
    });
    renderAccount();
  }

  function mountSidebarEntry() {
    if (isAuthPage) return;
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    const link = document.createElement('a');
    link.id = 'authSidebarEntry';
    link.className = 'nav-item auth-sidebar-entry';
    link.href = 'login.html';
    link.innerHTML = '<span class="nav-icon">◌</span><span>登录 / 注册</span>';
    nav.appendChild(link);
  }

  window.addEventListener('app:progress-changed', function () { queueSync('progress'); });
  window.addEventListener('app:course-state-changed', function () { queueSync('course'); });
  window.addEventListener('app:learning-state-changed', function () { queueSync('learning'); });
  client.auth.onAuthStateChange(function (_event, session) {
    window.setTimeout(function () {
      if (session && session.user) void hydrateUser(session.user);
      else if (!activeUser) renderAccount();
    }, 0);
  });
  window.KotobaAuth = { client: client, getUser: function () { return activeUser; } };

  function init() {
    mountAuthUI();
    mountSidebarEntry();
    client.auth.getSession().then(function (result) {
      if (result.data.session && result.data.session.user) return hydrateUser(result.data.session.user);
      renderAccount();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
