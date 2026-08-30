import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);

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

test('production speech uses the Edge Neural server proxy', async () => {
  const client = await readFile('js/tts.js', 'utf8');
  const handler = await readFile('api/tts.js', 'utf8');
  assert.match(client, /window\.location\.origin/);
  assert.match(client, /\/api\/tts\?health=1/);
  assert.match(handler, /new EdgeTTS/);
  assert.match(handler, /ja-JP-NanamiNeural/);
  assert.match(handler, /MAX_REQUESTS_PER_WINDOW/);
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

test('archived lessons leave the default route and remain recoverable', async () => {
  const source = await readFile('js/course-catalog.js', 'utf8');
  const context = { window: { App: { isCustomLesson: () => false } } };
  vm.runInNewContext(source, context);
  const lessons = [
    { id: 'active', sequence: 1, title: '正在学习', vocabulary: [], phrases: [], learningGoals: [] },
    { id: 'archived', sequence: 2, title: '已归档课时', vocabulary: [], phrases: [], learningGoals: [] }
  ];
  const items = context.window.CourseCatalog.buildCatalogItems(lessons, {}, { __archivedLessonIds: { archived: '2026-08-28T00:00:00.000Z' } });
  const active = context.window.CourseCatalog.buildCourseList({ items, tabFilter: 'all' });
  const archived = context.window.CourseCatalog.buildCourseList({ items, tabFilter: 'archived' });
  assert.match(active.html, /正在学习/);
  assert.doesNotMatch(active.html, /已归档课时/);
  assert.equal(active.tabCounts.archived, 1);
  assert.match(archived.html, /已归档课时/);
  assert.match(archived.html, /恢复课时/);
  assert.equal(context.window.CourseCatalog.getNextContinueItem(items).id, 'active');
});

test('lesson management keeps preset lessons recoverable and purges deleted custom records', async () => {
  const source = await readFile('js/app.js', 'utf8');
  assert.match(source, /const ARCHIVED_LESSONS_KEY = '__archivedLessonIds'/);
  assert.match(source, /function setLessonArchived/);
  assert.match(source, /function deleteCustomLesson/);
  assert.match(source, /function purgeLessonLearningRecords/);
  assert.match(source, /只有自建课时允许永久删除/);
});

test('practice CTA uses concise generation copy', async () => {
  const source = await readFile('js/practice.js', 'utf8');
  assert.match(source, /'生成练习'/);
  assert.doesNotMatch(source, /生成三组练习/);
});

test('vocabulary training is generated from the edited lesson source', async () => {
  const source = await readFile('js/practice.js', 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const training = context.window.Practice.buildVocabularyTraining({
    id: 'edited-lesson', title: '编辑后的课时', vocabulary: [
      { word: '私', reading: 'わたし', meaning: '我' },
      { word: '学生', reading: 'がくせい', meaning: '学生' },
      { word: '先生', reading: 'せんせい', meaning: '老师' },
      { word: '日本', reading: 'にほん', meaning: '日本' }
    ],
    phrases: [{ phrase: 'はじめまして', reading: 'はじめまして', meaning: '初次见面' }],
    learningGoals: [{ mainExample: { jp: '私は学生です。' }, examples: [] }],
    dialogue: { lines: [] }
  });
  assert.equal(training.sourceCount, 5);
  assert.ok(training.recognition.every((question) => question.options.every((option) => ['我', '学生', '老师', '日本', '初次见面'].includes(option))));
  assert.ok(training.recall.every((question) => question.acceptedAnswers.includes(question.answer)));
  assert.ok(training.usage.some((question) => question.template.includes('___')));
});

test('course dictionary indexes edited words and phrases, then finds Chinese and kana queries', async () => {
  const source = await readFile('js/dictionary.js', 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const entries = context.window.Dictionary.buildEntries([{
    id: 'day-001', sequence: 1, title: '第一课',
    vocabulary: [{ word: '私', reading: 'わたし', meaning: '我', type: '代词' }],
    phrases: [{ phrase: 'はじめまして', reading: 'はじめまして', meaning: '初次见面' }]
  }]);
  assert.equal(entries.length, 2);
  assert.equal(context.window.Dictionary.searchEntries(entries, '我')[0].term, '私');
  assert.equal(context.window.Dictionary.searchEntries(entries, 'はじめ')[0].term, 'はじめまして');
  assert.equal(entries[0].sources[0].lessonId, 'day-001');
});

test('dictionary stays tied to course content and the synced learning state', async () => {
  const dictionary = await readFile('js/dictionary.js', 'utf8');
  const lesson = await readFile('js/lesson.js', 'utf8');
  const app = await readFile('js/app.js', 'utf8');
  assert.match(dictionary, /App\.getLessons/);
  assert.match(dictionary, /App\.getLearningStore/);
  assert.match(dictionary, /type: 'dictionary'/);
  assert.match(dictionary, /dueNow: true/);
  assert.match(lesson, /dictionary\.html\?q=/);
  assert.match(app, /if \(!item\.dueNow\) due\.setDate/);
});

test('dictionary page is included in the deployable static site', async () => {
  const page = await readFile('dictionary.html', 'utf8');
  const lessonPage = await readFile('lesson.html', 'utf8');
  const build = await readFile('scripts/build-site.mjs', 'utf8');
  assert.match(page, /js\/dictionary\.js\?v=1/);
  assert.match(page, /data-dictionary-filter="saved"/);
  assert.match(lessonPage, /js\/lesson\.js\?v=9/);
  assert.match(build, /'dictionary\.html'/);
});

test('dictionary API normalizes a provider entry and returns useful verb forms', () => {
  const api = require('../api/dictionary.js');
  const entry = api._test.normalizeEntry({
    slug: '食べる', is_common: true, jlpt: ['jlpt-n5'],
    japanese: [{ word: '食べる', reading: 'たべる' }],
    senses: [{ english_definitions: ['to eat'], parts_of_speech: ['Ichidan verb', 'Transitive verb'], tags: [] }],
    attribution: { jmdict: true }
  }, '食べました');
  assert.equal(entry.word, '食べる');
  assert.deepEqual(entry.jlpt, ['N5']);
  assert.ok(entry.forms.includes('食べて'));
  assert.equal(entry.resolvedFrom, '食べました');
});

test('lesson dictionary panel uses the protected same-origin adapter', async () => {
  const panel = await readFile('js/dictionary-panel.js', 'utf8');
  const lesson = await readFile('js/lesson.js', 'utf8');
  const lessonPage = await readFile('lesson.html', 'utf8');
  const server = await readFile('server.js', 'utf8');
  const config = await readFile('vercel.json', 'utf8');
  assert.match(panel, /fetch\('\/api\/dictionary\?q='/);
  assert.match(panel, /dictionary-drawer/);
  assert.match(panel, /dictionary-drawer__backdrop.*aria-hidden/);
  assert.doesNotMatch(panel, /dictionary-drawer__close|data-drawer-close/);
  assert.match(lesson, /data-dictionary-lookup/);
  assert.match(lesson, /DictionaryPanel\.open/);
  assert.match(lessonPage, /js\/dictionary-panel\.js\?v=2/);
  assert.match(server, /requestPath === '\/api\/dictionary'/);
  assert.match(config, /api\/dictionary\.js/);
});
