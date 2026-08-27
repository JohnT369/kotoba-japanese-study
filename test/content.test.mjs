import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

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
