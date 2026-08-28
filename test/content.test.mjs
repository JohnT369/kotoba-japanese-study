import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const exec = promisify(execFile);

test('course content passes the authoring contract', async () => {
  const { stdout } = await exec(process.execPath, ['scripts/validate-content.mjs']);
  assert.match(stdout, /Content validation passed/);
});

test('AI endpoint requires identity and durable quota', async () => {
  const source = await readFile('api/ai.js', 'utf8');
  assert.match(source, /getAuthenticatedUser/);
  assert.match(source, /consumeDailyQuota/);
  assert.match(source, /请登录后再使用 AI 助学/);
});

test('lesson completion is connected to the learning page', async () => {
  const source = await readFile('js/lesson.js', 'utf8');
  assert.match(source, /data-lesson-complete/);
  assert.match(source, /App\.markLessonCompleted\(lessonId\)/);
});

test('authenticated visitors bypass the login modal and use only the account entry', async () => {
  const source = await readFile('js/auth.js', 'utf8');
  assert.match(source, /if \(isAuthPage && user\) \{/);
  assert.match(source, /entry\.id = 'authEntry'/);
  assert.doesNotMatch(source, /authSidebarEntry|mountSidebarEntry/);
});

test('course card counts edited content and keeps the summary compact', async () => {
  const source = await readFile('js/course-catalog.js', 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const lesson = {
    id: 'lesson-edited', sequence: 1, title: '已编辑课时', subtitle: '统计应来自当前内容',
    vocabulary: [{ word: '私' }, { word: 'あなた' }, { word: '学生' }],
    phrases: [{ phrase: 'はじめまして' }],
    learningGoals: [{ goalTitle: '自我介绍' }, { goalTitle: '提问' }],
    grammar: [{ pattern: 'A は B です' }]
  };
  const items = context.window.CourseCatalog.buildCatalogItems([lesson], {}, { 'lesson-edited': lesson });
  const html = context.window.CourseCatalog.buildCourseList({ items }).html;
  assert.match(html, /course-card__summary/);
  assert.match(html, /course-card__controls/);
  assert.match(html, /📘 3 词/);
  assert.match(html, /🎯 2 目标/);
  assert.doesNotMatch(html, /语法：|查看本课/);
});
