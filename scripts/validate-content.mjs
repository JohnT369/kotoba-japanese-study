import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../data/lessons.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context, { filename: 'data/lessons.js' });
const lessons = context.window.LESSONS;

if (!Array.isArray(lessons) || !lessons.length) throw new Error('课程内容不能为空。');
const ids = new Set();
for (const lesson of lessons) {
  if (!lesson || typeof lesson.id !== 'string' || !lesson.id.trim()) throw new Error('每课必须有非空 id。');
  if (ids.has(lesson.id)) throw new Error('课程 id 重复：' + lesson.id);
  ids.add(lesson.id);
  if (!lesson.title || !Array.isArray(lesson.vocabulary) || !Array.isArray(lesson.learningGoals)) throw new Error('课程字段不完整：' + lesson.id);
  for (const word of lesson.vocabulary) {
    if (!word.word || !word.reading || !word.meaning) throw new Error('词汇字段不完整：' + lesson.id);
  }
  for (const goal of lesson.learningGoals) {
    if (!goal.goalTitle || !goal.mainExample || !goal.mainExample.jp) throw new Error('学习目标字段不完整：' + lesson.id);
  }
}

console.log('Content validation passed for ' + lessons.length + ' lesson(s).');
