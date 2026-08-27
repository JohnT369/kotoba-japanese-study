import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });

for (const entry of ['index.html', 'courses.html', 'lesson.html', 'kana.html', 'ai.html', 'progress.html', 'css', 'js', 'data']) {
  await cp(path.join(root, entry), path.join(client, entry), { recursive: true });
}

console.log('Static site prepared in dist/client');
