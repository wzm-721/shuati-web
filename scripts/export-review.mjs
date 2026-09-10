// 导出题库为可读文本，供答案审阅：node scripts/export-review.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocx } from '../src/lib/docxParser.js';
import { dedupeQuestions } from '../src/lib/dedupe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const buf = await readFile(path.join(root, '通行证练习题（2026）.docx'));
const { questions } = await parseDocx(buf);
const { unique, removed } = dedupeQuestions(questions);

const lines = [];
lines.push(`题库导出：原 ${questions.length} 题，去重后 ${unique.length} 题，移除重复 ${removed.length} 题`);
unique.forEach((q, i) => {
  const ans = q.answer.map((a) => (a === '√' ? '对' : a === '×' ? '错' : a)).join('');
  lines.push('');
  lines.push(`[${i + 1}](${q.type}) 答案:${ans}`);
  lines.push(`Q:${q.text}`);
  q.options.forEach((o) => lines.push(`  ${o.letter}.${o.text}`));
});

await mkdir(path.join(root, 'review'), { recursive: true });
await writeFile(path.join(root, 'review', 'questions.txt'), lines.join('\n'), 'utf8');
console.log('导出完成：', unique.length, '题 → review/questions.txt');
