import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./validate-content.mjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const client = path.join(dist, 'client');

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });

for (const entry of ['index.html', 'courses.html', 'lesson.html', 'kana.html', 'review.html', 'dictionary.html', 'ai.html', 'progress.html', 'login.html', 'css', 'js', 'data']) {
  await cp(path.join(root, entry), path.join(client, entry), { recursive: true });
}

await mkdir(path.join(client, 'vendor'), { recursive: true });
await cp(
  path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
  path.join(client, 'vendor', 'supabase.js')
);

console.log('Static site prepared in dist/client');
