/* ============================================================
   app.js - 通用功能（导航、LocalStorage 进度管理）
   暴露全局对象：window.App
   ============================================================ */

(function () {
  'use strict';

  // ---------- LocalStorage Key ----------
  const LS_KEY = 'jp_learning_progress_v1';
  const LS_META_KEY = 'jp_learning_meta_v1';
  const LS_EDITS_KEY = 'jp_lesson_edits_v1';
  const LS_CUSTOM_LESSONS_KEY = 'jp_custom_lessons_v1';
  const LS_LEARNING_STATE_KEY = 'jp_learning_state_v1';
  const LS_PROGRESS_RESET_AT_KEY = 'jp_learning_progress_reset_at_v1';
  const LS_COURSE_STATE_UPDATED_AT_KEY = 'jp_course_state_updated_at_v1';
  const LS_ANONYMOUS_CLAIM_KEY = 'jp_kotoba_anonymous_storage_claimed_by';
  let storageOwnerId = null;

  function storageKey(baseKey) {
    return storageOwnerId ? baseKey + ':' + storageOwnerId : baseKey;
  }

  function emitStateChange(type) {
    window.dispatchEvent(new CustomEvent(type, { detail: { userId: storageOwnerId } }));
  }

  function writeStoredValue(baseKey, value) {
    localStorage.setItem(storageKey(baseKey), JSON.stringify(value));
  }

  function readStoredValue(baseKey, fallback) {
    try { return safeParseJSON(localStorage.getItem(storageKey(baseKey)), fallback); }
    catch (e) { return fallback; }
  }

  // 登录后把登录前仅存在于当前浏览器的资料归入首次登录的账户一次。
  // 之后每个用户都使用独立的 localStorage 命名空间，切换账户不会串看到彼此资料。
  function setStorageOwner(userId) {
    const nextOwnerId = typeof userId === 'string' && userId ? userId : null;
    if (nextOwnerId === storageOwnerId) return false;
    storageOwnerId = nextOwnerId;
    if (!storageOwnerId) return true;

    try {
      const claimedBy = localStorage.getItem(LS_ANONYMOUS_CLAIM_KEY);
      if (!claimedBy) {
        [LS_KEY, LS_META_KEY, LS_EDITS_KEY, LS_CUSTOM_LESSONS_KEY, LS_LEARNING_STATE_KEY, LS_PROGRESS_RESET_AT_KEY, LS_COURSE_STATE_UPDATED_AT_KEY].forEach(function (baseKey) {
          const legacy = localStorage.getItem(baseKey);
          const scoped = localStorage.getItem(storageKey(baseKey));
          if (legacy !== null && scoped === null) localStorage.setItem(storageKey(baseKey), legacy);
          // Remove the shared legacy copy after its one-time account claim so
          // a later account on this browser can never render another user's data.
          if (legacy !== null) localStorage.removeItem(baseKey);
        });
        localStorage.setItem(LS_ANONYMOUS_CLAIM_KEY, storageOwnerId);
      }
    } catch (e) {
      console.warn('切换账户本地资料失败:', e);
    }
    return true;
  }

  // ---------- 工具函数 ----------
  function safeParseJSON(str, fallback) {
    try {
      const obj = JSON.parse(str);
      return obj && typeof obj === 'object' ? obj : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function getOriginalLessons() {
    return Array.isArray(window.LESSONS) ? window.LESSONS : [];
  }

  // 用户在学习导航中新增的课时：与 lessons.js 原始课程分开保存，避免覆盖源码。
  function loadCustomLessons() {
    try {
      const raw = localStorage.getItem(storageKey(LS_CUSTOM_LESSONS_KEY));
      const lessons = safeParseJSON(raw, []);
      return Array.isArray(lessons) ? lessons : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomLessons(lessons) {
    try {
      writeStoredValue(LS_CUSTOM_LESSONS_KEY, lessons);
      markCourseStateDirty();
      emitStateChange('app:course-state-changed');
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- 课程覆盖编辑（LocalStorage） ----------
  // 结构：{ [lessonId]: lessonObj（完整对象副本） }
  function loadAllEdits() {
    try {
      const raw = localStorage.getItem(storageKey(LS_EDITS_KEY));
      return safeParseJSON(raw, {});
    } catch (e) {
      console.warn('读取编辑覆盖失败:', e);
      return {};
    }
  }

  function saveAllEdits(edits) {
    try {
      writeStoredValue(LS_EDITS_KEY, edits);
      markCourseStateDirty();
      emitStateChange('app:course-state-changed');
      return true;
    } catch (e) {
      console.warn('保存编辑覆盖失败:', e);
      return false;
    }
  }

  function hasLessonEdit(lessonId) {
    if (!lessonId) return false;
    const edits = loadAllEdits();
    return !!edits[lessonId];
  }

  function getLessonEdit(lessonId) {
    if (!lessonId) return null;
    const edits = loadAllEdits();
    return edits[lessonId] || null;
  }

  function saveLessonEdit(lessonId, lessonObj) {
    if (!lessonId || !lessonObj) return false;
    const edits = loadAllEdits();
    edits[lessonId] = JSON.parse(JSON.stringify(lessonObj)); // 深拷贝一份
    return saveAllEdits(edits);
  }

  function resetLessonEdit(lessonId) {
    if (!lessonId) return false;
    const edits = loadAllEdits();
    if (!edits[lessonId]) return true;
    delete edits[lessonId];
    return saveAllEdits(edits);
  }

  // 判断是否是 V1 旧 schema（9 模块）的编辑覆盖版
  // 标准：缺 learningGoals 数组，或 vocabulary 没 accent/note 字段 → 旧 V1.5 编辑保存的副本
  function isOldV1Edit(edit) {
    if (!edit) return false;
    if (!Array.isArray(edit.learningGoals)) return true;
    if (Array.isArray(edit.vocabulary) && edit.vocabulary.length) {
      const first = edit.vocabulary[0] || {};
      if (!('accent' in first) && !('note' in first)) return true;
    }
    if (!edit.dialogue || !Array.isArray(edit.dialogue.lines)) return true;
    return false;
  }

  // 浅+深合并：练习模块 + 元信息用 edit（用户改过的优先），3 大新模块用 original（如果 edit 是 V1 旧 schema）
  function smartMergeLesson(original, edit) {
    if (!edit) return original;
    const isOld = isOldV1Edit(edit);
    // 基：以 original 为底，edit 的字段全部覆盖，但如果是旧 V1 且缺新字段 → 保留 original 的新字段
    const base = JSON.parse(JSON.stringify(original));
    const editCopy = JSON.parse(JSON.stringify(edit));
    // 合并：所有 edit 字段覆盖 base
    Object.keys(editCopy).forEach(function (k) {
      base[k] = editCopy[k];
    });
    // 旧 V1 schema 时，强制把新 3 大模块拉回磁盘版（因为用户根本没在编辑模式下编辑过这些新字段）
    if (isOld) {
      // 旧版覆盖记录可能只缺少某些新模块。只为“缺失的字段”补原版，
      // 不能覆盖用户已经保存的词汇、短语或学习目标，否则目录统计会停留在原始数量。
      if (!Array.isArray(editCopy.vocabulary) && original.vocabulary) base.vocabulary = original.vocabulary;
      if (!Array.isArray(editCopy.phrases) && original.phrases) base.phrases = original.phrases;
      if (!Array.isArray(editCopy.learningGoals) && original.learningGoals) base.learningGoals = original.learningGoals;
      if ((!editCopy.dialogue || !Array.isArray(editCopy.dialogue.lines)) && original.dialogue) base.dialogue = original.dialogue;
    }
    // ===== 清理教材残留字段（旧 LocalStorage 覆盖版可能还存着 mp3s/mp3/page；主动清除避免残留）=====
    delete base.mp3s;
    if (Array.isArray(base.learningGoals)) {
      base.learningGoals.forEach(function (g) {
        if (!g) return;
        delete g.mp3;
        delete g.page;
      });
    }
    if (base.dialogue) {
      delete base.dialogue.mp3;
    }
    return base;
  }

  // 单课：原版 + 覆盖版合并（有覆盖时覆盖版优先；V1 旧覆盖版会自动补充 V3 新字段）
  function mergeWithEdit(originalLesson) {
    if (!originalLesson) return null;
    const edit = getLessonEdit(originalLesson.id);
    if (!edit) return originalLesson;
    return smartMergeLesson(originalLesson, edit);
  }

  function getLessons() {
    const original = getOriginalLessons().concat(loadCustomLessons());
    // 有编辑覆盖的课：用 smartMerge（用户实际编辑过的练习部分/元信息保留，新模块取磁盘版）
    const edits = loadAllEdits();
    return original.map(function (l) {
      if (!edits[l.id]) return l;
      return smartMergeLesson(l, edits[l.id]);
    });
  }

  function getLessonOriginalById(id) {
    if (!id) return null;
    const lessons = getOriginalLessons().concat(loadCustomLessons());
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].id === id) return JSON.parse(JSON.stringify(lessons[i]));
    }
    return null;
  }

  function createLesson() {
    const lessons = getLessons();
    let maxSequence = 0;
    lessons.forEach(function (lesson) {
      const sequence = Number(lesson && lesson.sequence);
      if (Number.isFinite(sequence) && sequence > maxSequence) maxSequence = sequence;
    });
    const sequence = maxSequence + 1;
    const id = 'lesson-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const lesson = {
      id: id,
      sequence: sequence,
      day: '第' + sequence + '课',
      title: '新课时',
      subtitle: '请在学习导航命名，并在编辑模式补充课程内容。',
      unit: '',
      tags: [],
      estimatedMinutes: 15,
      vocabulary: [],
      phrases: [],
      grammar: [],
      learningGoals: [],
      dialogue: { title: '应用会话', lines: [] }
    };
    const customLessons = loadCustomLessons();
    customLessons.push(lesson);
    return saveCustomLessons(customLessons) ? JSON.parse(JSON.stringify(lesson)) : null;
  }

  function updateLessonMeta(lessonId, meta) {
    if (!lessonId || !meta) return false;
    const lesson = getLessonById(lessonId);
    if (!lesson) return false;
    const title = typeof meta.title === 'string' ? meta.title.trim() : lesson.title;
    if (!title) return false;
    const next = JSON.parse(JSON.stringify(lesson));
    next.title = title;
    if (typeof meta.subtitle === 'string') next.subtitle = meta.subtitle.trim();
    return saveLessonEdit(lessonId, next);
  }

  // ---------- 课时归档与删除 ----------
  // 归档标记与编辑覆盖一起同步，避免为一个轻量的个人视图状态增加新的云端表字段。
  const ARCHIVED_LESSONS_KEY = '__archivedLessonIds';

  function archivedLessonIds(edits) {
    const source = edits && edits[ARCHIVED_LESSONS_KEY];
    return source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  }

  function isLessonArchived(lessonId, editsOverride) {
    if (!lessonId) return false;
    const edits = editsOverride || loadAllEdits();
    return !!archivedLessonIds(edits)[lessonId];
  }

  function setLessonArchived(lessonId, archived) {
    if (!lessonId || !getLessonOriginalById(lessonId)) return false;
    const edits = loadAllEdits();
    const archivedIds = archivedLessonIds(edits);
    if (archived) archivedIds[lessonId] = new Date().toISOString();
    else delete archivedIds[lessonId];
    if (Object.keys(archivedIds).length) edits[ARCHIVED_LESSONS_KEY] = archivedIds;
    else delete edits[ARCHIVED_LESSONS_KEY];
    return saveAllEdits(edits);
  }

  function isCustomLesson(lessonId) {
    return loadCustomLessons().some(function (lesson) { return lesson && lesson.id === lessonId; });
  }

  function purgeLessonLearningRecords(lessonId) {
    const state = loadLearningState();
    [
      'jp_lesson_practice_v1', 'jp_lesson_practice_progress_v1',
      'jp_lesson_vocabulary_training_v1', 'jp_lesson_vocabulary_training_progress_v1'
    ].forEach(function (key) {
      if (state[key] && typeof state[key] === 'object') delete state[key][lessonId];
    });
    if (state.review && state.review.items && typeof state.review.items === 'object') {
      const prefix = 'lesson:' + lessonId + ':';
      Object.keys(state.review.items).forEach(function (key) {
        if (key.indexOf(prefix) === 0) delete state.review.items[key];
      });
    }
    return saveLearningState(state);
  }

  // 只有自建课时允许永久删除；预置教材始终使用归档，防止误删课程源内容。
  function deleteCustomLesson(lessonId) {
    if (!isCustomLesson(lessonId)) return false;
    const customLessons = loadCustomLessons().filter(function (lesson) { return lesson && lesson.id !== lessonId; });
    const edits = loadAllEdits();
    delete edits[lessonId];
    const archivedIds = archivedLessonIds(edits);
    delete archivedIds[lessonId];
    if (Object.keys(archivedIds).length) edits[ARCHIVED_LESSONS_KEY] = archivedIds;
    else delete edits[ARCHIVED_LESSONS_KEY];
    const progress = loadProgress();
    delete progress[lessonId];

    const courseSaved = saveCustomLessons(customLessons) && saveAllEdits(edits);
    const progressSaved = saveProgress(progress);
    const learningSaved = purgeLessonLearningRecords(lessonId);
    return courseSaved && progressSaved && learningSaved;
  }

  // ---------- 进度读写（V2 三元结构：status ∈ {not_started, in_progress, completed}）----------
  // V1（兼容）：{ [id]: { completed: boolean, completedAt: string } }
  // V2（新）：{ [id]: { status, startedAt?, lastVisitedAt?, completedAt? } }
  function loadProgress() {
    try {
      const raw = localStorage.getItem(storageKey(LS_KEY));
      return safeParseJSON(raw, {});
    } catch (e) {
      console.warn('读取进度失败:', e);
      return {};
    }
  }

  function saveProgress(progress) {
    try {
      writeStoredValue(LS_KEY, progress);
      emitStateChange('app:progress-changed');
      return true;
    } catch (e) {
      console.warn('保存进度失败:', e);
      return false;
    }
  }

  // 幂等迁移 V1 → V2；已含 status 字段的条目保持不动
  function migrateProgressV2() {
    const progress = loadProgress();
    let dirty = false;
    Object.keys(progress).forEach(function (id) {
      const entry = progress[id];
      if (!entry || typeof entry !== 'object') return;
      if (typeof entry.status === 'string') return; // 已是 V2
      const migrated = {};
      if (entry.completed === true) {
        migrated.status = 'completed';
        migrated.completedAt = entry.completedAt || new Date().toISOString();
        migrated.lastVisitedAt = entry.completedAt || new Date().toISOString();
        migrated.startedAt = entry.completedAt || new Date().toISOString();
      } else {
        migrated.status = 'not_started';
      }
      progress[id] = migrated;
      dirty = true;
    });
    if (dirty) saveProgress(progress);
    return progress;
  }

  // 读取原始进度条目（可能没迁移 → 返回 V2 默认值），避免上层判断
  function getProgressEntry(lessonId, progressOverride) {
    const progress = progressOverride != null ? progressOverride : loadProgress();
    const entry = progress[lessonId];
    if (!entry || typeof entry !== 'object') {
      return { status: 'not_started' };
    }
    if (typeof entry.status === 'string') return entry; // V2
    // 未迁移的老数据（调用者在 migrate 外直接用）—— 返回迁移后等价视图，但不存盘
    return {
      status: entry.completed === true ? 'completed' : 'not_started',
      completedAt: entry.completedAt || null
    };
  }

  function isLessonCompleted(lessonId) {
    if (!lessonId) return false;
    return getProgressEntry(lessonId).status === 'completed';
  }

  function markLessonInProgress(lessonId) {
    if (!lessonId) return false;
    const now = new Date().toISOString();
    const progress = loadProgress();
    const current = progress[lessonId] || {};
    // 如果已经 completed，不允许降级回 in_progress（保持完成态）
    if (typeof current.status === 'string' && current.status === 'completed') {
      // 仅更新最后访问时间，状态不变
      current.lastVisitedAt = now;
      progress[lessonId] = current;
      saveProgress(progress);
      return false;
    }
    const entry = typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {};
    entry.status = 'in_progress';
    if (!entry.startedAt) entry.startedAt = now;
    entry.lastVisitedAt = now;
    progress[lessonId] = entry;
    return saveProgress(progress);
  }

  function markLessonCompleted(lessonId) {
    if (!lessonId) return false;
    const now = new Date().toISOString();
    const progress = loadProgress();
    const current = progress[lessonId] || {};
    const entry = typeof current === 'object' ? JSON.parse(JSON.stringify(current)) : {};
    entry.status = 'completed';
    entry.completedAt = now;
    entry.lastVisitedAt = now;
    if (!entry.startedAt) entry.startedAt = now;
    progress[lessonId] = entry;
    return saveProgress(progress);
  }

  function resetProgress() {
    try {
      localStorage.removeItem(storageKey(LS_KEY));
      localStorage.removeItem(storageKey(LS_META_KEY));
      localStorage.setItem(storageKey(LS_PROGRESS_RESET_AT_KEY), new Date().toISOString());
      emitStateChange('app:progress-changed');
      return true;
    } catch (e) {
      return false;
    }
  }

  // 一次性读取：lessons（含 smartMerge）+ 已迁移 progress + edits，固定 3 次 LS 读取
  function loadAllOnce() {
    // migrateProgressV2 内部会调 loadProgress + 必要时 saveProgress（只在需要迁移时执行）
    const progress = migrateProgressV2();
    const edits = loadAllEdits();
    const lessons = getLessons(); // getLessons 内部调 loadAllEdits 但 edits 已经缓存过没关系（LS 多次读同样 key，浏览器同一微任务同值，这里只求简单正确）
    return { lessons: lessons, progress: progress, edits: edits };
  }

  function getStorageSnapshot() {
    return {
      progress: loadProgress(),
      customLessons: loadCustomLessons(),
      lessonEdits: loadAllEdits(),
      courseStateUpdatedAt: getCourseStateUpdatedAt()
    };
  }

  function replaceStorageSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    try {
      if (snapshot.progress && typeof snapshot.progress === 'object' && !Array.isArray(snapshot.progress)) {
        writeStoredValue(LS_KEY, snapshot.progress);
      }
      if (Array.isArray(snapshot.customLessons)) {
        writeStoredValue(LS_CUSTOM_LESSONS_KEY, snapshot.customLessons);
      }
      if (snapshot.lessonEdits && typeof snapshot.lessonEdits === 'object' && !Array.isArray(snapshot.lessonEdits)) {
        writeStoredValue(LS_EDITS_KEY, snapshot.lessonEdits);
      }
      if (snapshot.courseStateUpdatedAt) localStorage.setItem(storageKey(LS_COURSE_STATE_UPDATED_AT_KEY), String(snapshot.courseStateUpdatedAt));
      return true;
    } catch (e) {
      console.warn('写入账户学习资料失败:', e);
      return false;
    }
  }

  // ---------- 统计 ----------
  function getStats() {
    const archived = archivedLessonIds(loadAllEdits());
    const lessons = getLessons().filter(function (lesson) { return !archived[lesson.id]; });
    const total = lessons.length;
    migrateProgressV2();
    const progress = loadProgress();
    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    lessons.forEach(function (l) {
      const e = getProgressEntry(l.id, progress);
      if (e.status === 'completed') completed++;
      else if (e.status === 'in_progress') inProgress++;
      else notStarted++;
    });
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
    const remaining = total - completed;
    return { total: total, completed: completed, inProgress: inProgress, notStarted: notStarted, remaining: remaining, percent: percent };
  }

  function getLessonCompletedAt(lessonId) {
    const e = getProgressEntry(lessonId);
    return e.completedAt || null;
  }

  // ---------- 下一课 / "继续学习"推荐 ----------
  // 优先级：(1) in_progress 中 lastVisitedAt 最新 → (2) 首个 not_started → (3) 已完成中最老的（便于复习）
  function getNextLesson() {
    const { lessons, progress, edits } = loadAllOnce();
    const activeLessons = lessons.filter(function (lesson) { return !isLessonArchived(lesson.id, edits); });
    if (activeLessons.length === 0) return null;
    let bestInProgress = null;
    let bestInProgressTime = '';
    let firstNotStarted = null;
    let oldestCompleted = null;
    let oldestCompletedTime = '9999-12-31T23:59:59.999Z';
    for (let i = 0; i < activeLessons.length; i++) {
      const l = activeLessons[i];
      const e = getProgressEntry(l.id, progress);
      if (e.status === 'in_progress') {
        const t = e.lastVisitedAt || '';
        if (t > bestInProgressTime) {
          bestInProgressTime = t;
          bestInProgress = l;
        }
      } else if (e.status === 'not_started') {
        if (firstNotStarted === null) firstNotStarted = l;
      } else if (e.status === 'completed') {
        const t = e.completedAt || '9999-12-31T23:59:59.999Z';
        if (t < oldestCompletedTime) {
          oldestCompletedTime = t;
          oldestCompleted = l;
        }
      }
    }
    return bestInProgress || firstNotStarted || oldestCompleted || activeLessons[0];
  }

  // ---------- 按 ID 获取课程 ----------
  function getLessonById(id) {
    if (!id) return null;
    const lessons = getLessons();
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].id === id) return lessons[i];
    }
    return null;
  }

  function getLessonIndex(id) {
    const lessons = getLessons();
    for (let i = 0; i < lessons.length; i++) {
      if (lessons[i].id === id) return i;
    }
    return -1;
  }

  function getAdjacentLessons(id) {
    const allLessons = getLessons();
    const archived = archivedLessonIds(loadAllEdits());
    const lessons = allLessons.filter(function (lesson) { return !archived[lesson.id]; });
    const idx = lessons.findIndex(function (lesson) { return lesson.id === id; });
    return {
      prev: idx > 0 ? lessons[idx - 1] : null,
      next: idx >= 0 && idx < lessons.length - 1 ? lessons[idx + 1] : null
    };
  }

  // ---------- 可同步学习状态：练习、假名与复习计划 ----------
  function loadLearningState() {
    const state = readStoredValue(LS_LEARNING_STATE_KEY, {});
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  }

  function saveLearningState(state) {
    try {
      const next = state && typeof state === 'object' ? state : {};
      next.updatedAt = new Date().toISOString();
      writeStoredValue(LS_LEARNING_STATE_KEY, next);
      emitStateChange('app:learning-state-changed');
      return true;
    } catch (e) {
      console.warn('保存学习状态失败:', e);
      return false;
    }
  }

  // 兼容既有模块的键值存储；首次写入会自然迁移旧的匿名本地记录。
  function getLearningStore(key, fallback) {
    const state = loadLearningState();
    if (Object.prototype.hasOwnProperty.call(state, key)) return state[key];
    try {
      const legacy = safeParseJSON(localStorage.getItem(key), fallback);
      return legacy == null ? fallback : legacy;
    } catch (e) { return fallback; }
  }

  function setLearningStore(key, value) {
    const state = loadLearningState();
    state[key] = value;
    return saveLearningState(state);
  }

  function deleteLearningStore(key) {
    const state = loadLearningState();
    delete state[key];
    try { localStorage.removeItem(key); } catch (e) {}
    return saveLearningState(state);
  }

  function getLearningStateSnapshot() { return loadLearningState(); }

  function replaceLearningState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
    try {
      writeStoredValue(LS_LEARNING_STATE_KEY, snapshot);
      return true;
    } catch (e) { return false; }
  }

  function reviewInterval(level) {
    return [1, 3, 7, 14, 30][Math.max(0, Math.min(Number(level) || 0, 4))];
  }

  function recordReviewItem(item, correct) {
    if (!item || !item.id) return false;
    const state = loadLearningState();
    const review = state.review && typeof state.review === 'object' ? state.review : { items: {} };
    review.items = review.items && typeof review.items === 'object' ? review.items : {};
    const current = review.items[item.id] || {};
    const level = correct ? Math.min((current.level == null ? -1 : Number(current.level)) + 1, 4) : 0;
    const due = new Date();
    if (!item.dueNow) due.setDate(due.getDate() + reviewInterval(level));
    review.items[item.id] = {
      id: item.id,
      type: item.type || 'lesson',
      label: String(item.label || '待复习内容'),
      detail: String(item.detail || ''),
      href: String(item.href || 'review.html'),
      level: level,
      dueAt: due.toISOString(),
      lastResult: correct ? 'correct' : 'wrong',
      updatedAt: new Date().toISOString()
    };
    state.review = review;
    return saveLearningState(state);
  }

  function getDueReviewItems(limit) {
    const review = loadLearningState().review || {};
    const now = new Date().toISOString();
    return Object.keys(review.items || {}).map(function (key) { return review.items[key]; })
      .filter(function (item) { return item && item.dueAt && item.dueAt <= now; })
      .sort(function (a, b) { return String(a.dueAt).localeCompare(String(b.dueAt)); })
      .slice(0, Number(limit) || 12);
  }

  function getReviewStats() {
    const review = loadLearningState().review || {};
    const items = Object.keys(review.items || {}).map(function (key) { return review.items[key]; }).filter(Boolean);
    return { total: items.length, due: getDueReviewItems(999).length };
  }

  function getProgressResetAt() {
    try { return localStorage.getItem(storageKey(LS_PROGRESS_RESET_AT_KEY)) || ''; } catch (e) { return ''; }
  }

  function clearProgressResetAt() {
    try { localStorage.removeItem(storageKey(LS_PROGRESS_RESET_AT_KEY)); } catch (e) {}
  }

  function markCourseStateDirty() {
    try { localStorage.setItem(storageKey(LS_COURSE_STATE_UPDATED_AT_KEY), new Date().toISOString()); } catch (e) {}
  }

  function getCourseStateUpdatedAt() {
    try { return localStorage.getItem(storageKey(LS_COURSE_STATE_UPDATED_AT_KEY)) || ''; } catch (e) { return ''; }
  }

  // ---------- 移动端导航菜单 ----------
  function initMobileNav() {
    const toggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', function () {
      toggle.classList.toggle('is-open');
      sidebar.classList.toggle('is-open');
    });

    // 点击导航项后自动关闭
    const navItems = sidebar.querySelectorAll('.nav-item');
    navItems.forEach(function (item) {
      item.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open')) {
          sidebar.classList.remove('is-open');
          toggle.classList.remove('is-open');
        }
      });
    });

    // 点击内容区关闭侧栏（仅移动端）
    const main = document.querySelector('.main');
    if (main) {
      main.addEventListener('click', function () {
        if (sidebar.classList.contains('is-open') && window.innerWidth <= 860) {
          sidebar.classList.remove('is-open');
          toggle.classList.remove('is-open');
        }
      });
    }
  }

  // ---------- 自动初始化 ----------
  document.addEventListener('DOMContentLoaded', function () {
    migrateProgressV2(); // 任何页面打开都自动把旧格式进度（V1 completed:true）迁到 V2 三元
    initMobileNav();
  });

  // ---------- 暴露到全局 ----------
  window.App = {
    // 进度
    isLessonCompleted: isLessonCompleted,
    markLessonCompleted: markLessonCompleted,
    markLessonInProgress: markLessonInProgress,
    resetProgress: resetProgress,
    loadProgress: loadProgress,
    getLessonCompletedAt: getLessonCompletedAt,
    migrateProgressV2: migrateProgressV2,
    setStorageOwner: setStorageOwner,
    getStorageOwner: function () { return storageOwnerId; },
    getStorageSnapshot: getStorageSnapshot,
    replaceStorageSnapshot: replaceStorageSnapshot,
    getProgressResetAt: getProgressResetAt,
    clearProgressResetAt: clearProgressResetAt,

    // 练习、错题与复习
    getLearningStore: getLearningStore,
    setLearningStore: setLearningStore,
    deleteLearningStore: deleteLearningStore,
    getLearningStateSnapshot: getLearningStateSnapshot,
    replaceLearningState: replaceLearningState,
    recordReviewItem: recordReviewItem,
    getDueReviewItems: getDueReviewItems,
    getReviewStats: getReviewStats,

    // 统计
    getStats: getStats,
    getNextLesson: getNextLesson,

    // 一次性读取（课程目录与进度页专用，避免 N 次 LS）
    loadAllOnce: loadAllOnce,

    // 数据获取
    getLessons: getLessons,
    getLessonById: getLessonById,
    getLessonIndex: getLessonIndex,
    getAdjacentLessons: getAdjacentLessons,

    // 原始数据（编辑器重置时用）
    getOriginalLessons: getOriginalLessons,
    getLessonOriginalById: getLessonOriginalById,

    // 课程管理（学习导航）
    createLesson: createLesson,
    updateLessonMeta: updateLessonMeta,
    isCustomLesson: isCustomLesson,
    isLessonArchived: isLessonArchived,
    setLessonArchived: setLessonArchived,
    deleteCustomLesson: deleteCustomLesson,

    // 课程编辑（LocalStorage 覆盖）
    hasLessonEdit: hasLessonEdit,
    getLessonEdit: getLessonEdit,
    saveLessonEdit: saveLessonEdit,
    resetLessonEdit: resetLessonEdit
  };
})();
